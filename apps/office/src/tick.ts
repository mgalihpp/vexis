import { activeModels, DAILY_LOSS, PROPOSAL_PARAMS, parseGuardrails, parseModels, utcDayStart } from "@vexis/db/office";
import type { OfficeConfigRow, ProposalRow } from "@vexis/db/office-queries";
import { Clock, Effect } from "effect";
import { type Office, say } from "./ask.ts";
import { type Floor, presentChecked, reviewDrafts, scoutAndDraft } from "./desks.ts";
import { BadOfficeConfig } from "./errors.ts";
import { dailyLossHit, dailyLossPct } from "./guardrails.ts";
import { Chain } from "./services/chain.ts";
import { Db } from "./services/db.ts";
import { OfficeState } from "./services/state.ts";

const DAY_MS = 86_400_000;

/** One minute of every office: offices run side by side, each one's desks one after another. */
export const tick = Effect.fn("office.tick")(function* () {
  const offices = yield* (yield* Db).listOffices();
  yield* Effect.forEach(
    offices,
    (row) =>
      runOffice(row).pipe(
        Effect.catchTag("BadOfficeConfig", (error) =>
          Effect.logWarning(`skipping office ${error.userId}: bad config`, error.cause),
        ),
        Effect.catchTag("DbError", (error) =>
          Effect.logError(`office ${row.userId} failed: ${error.operation}`, error.cause),
        ),
      ),
    { concurrency: 4, discard: true },
  );
});

const parse = (row: OfficeConfigRow) =>
  Effect.try({
    try: () => ({
      guardrails: parseGuardrails(row.guardrails),
      models: activeModels(row.keySource, parseModels(row.models)),
    }),
    catch: (cause) => new BadOfficeConfig({ userId: row.userId, cause }),
  });

const nameOf = (p: ProposalRow) => p.poolName ?? p.poolAddress.slice(0, 6);

const runOffice = Effect.fn("office.run")(function* (row: OfficeConfigRow) {
  const db = yield* Db;
  const now = yield* Clock.currentTimeMillis;
  const office: Office = { row, userId: row.userId, now, ...(yield* parse(row)) };

  for (const p of yield* db.expire(row.userId, new Date(now))) {
    yield* say(office, "manager", `${nameOf(p)} expired before anyone approved it.`, "warn", {
      poolAddress: p.poolAddress,
      proposalId: p.id,
    });
  }

  if (row.paused) {
    if (row.pausedUntil === null || row.pausedUntil.getTime() > now) return;
    yield* db.setPause(row.userId, null);
    yield* say(office, "manager", "The pause is over. Back to work.", "info");
  }

  yield* execute(office);

  const floor = yield* readFloor(office);
  if (dailyLossHit(office.guardrails, floor.dayStartSol, floor.walletSol)) {
    const loss = dailyLossPct(floor.dayStartSol, floor.walletSol).toFixed(1);
    yield* db.setPause(row.userId, { reason: DAILY_LOSS, until: new Date(utcDayStart(now).getTime() + DAY_MS) });
    yield* say(office, "manager", `Wallet is down ${loss}% today. Pausing until 00:00 UTC.`, "bad");
    return;
  }

  yield* scoutAndDraft(floor);
  yield* reviewDrafts(floor);
  yield* presentChecked(floor);
});

/** The wallet as the desks see it this tick. One balance read on the user's RPC; no wallet means no read. */
const readFloor = (office: Office) =>
  Effect.gen(function* () {
    const wallet = yield* (yield* Db).wallet(office.row);
    if (wallet._tag !== "ready") {
      if (wallet._tag === "unreadable") yield* Effect.logWarning(`office ${office.userId}: RPC URL does not decrypt`);
      return { ...office, walletSol: null, dayStartSol: null, rpc: null } satisfies Floor;
    }
    const walletSol = yield* (yield* Chain).balanceSol(wallet.rpcUrl, wallet.owner).pipe(
      Effect.map((sol): number | null => sol),
      Effect.catchTag("ChainError", (error) =>
        Effect.logWarning(`office ${office.userId}: balance read failed: ${error.message}`).pipe(Effect.as(null)),
      ),
    );
    const dayStartSol = yield* (yield* OfficeState).dayStartSol(office.userId, office.now, walletSol);
    return { ...office, walletSol, dayStartSol, rpc: { owner: wallet.owner, url: wallet.rpcUrl } } satisfies Floor;
  });

/** The MVP executor: every approved proposal is marked done without signing or sending anything. */
const execute = (office: Office) =>
  Effect.gen(function* () {
    const db = yield* Db;
    for (const p of yield* db.proposals(office.userId, ["approved"])) {
      const claimed = yield* db.move(office.userId, p.id, "approved", "executing");
      if (!claimed) continue;
      const open = p.kind === "open" ? PROPOSAL_PARAMS.open.safeParse(p.params) : null;
      if (open?.success) {
        yield* db.insertJournal(office.userId, {
          openProposalId: p.id,
          poolAddress: p.poolAddress,
          poolName: p.poolName,
          simulated: true,
          amountSol: open.data.amountSol,
          amountUsd: open.data.solUsd === null ? null : open.data.amountSol * open.data.solUsd,
          openReason: p.rationale,
          pnlSol: null,
          pnlUsd: null,
        });
      }
      yield* db.move(office.userId, p.id, "executing", "done");
      const what = open?.success
        ? `opened ${open.data.amountSol} SOL in ${nameOf(p)}`
        : `ran the ${p.kind} on ${nameOf(p)}`;
      yield* say(office, "executor", `Simulation: ${what}. Nothing was signed or sent.`, "good", {
        poolAddress: p.poolAddress,
        proposalId: p.id,
      });
    }
  });
