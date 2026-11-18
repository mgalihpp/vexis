import type { OfficeConfigRow, ProposalRow } from "@vexis/db/office-queries";
import { dailyLossHit, dailyLossPct, dayPnlSol, officeCapital, storedDayCapital } from "@vexis/shared/guardrails";
import {
  activeModels,
  DAILY_LOSS,
  officeFilter,
  parseGuardrails,
  parseModels,
  parseScreen,
  utcDayStart,
} from "@vexis/shared/office";
import { Clock, Effect } from "effect";
import { type Office, say } from "./ask.ts";
import { dailyBriefing } from "./briefing.ts";
import { type Floor, presentChecked, reviewDrafts, scoutAndDraft } from "./desks.ts";
import { BadOfficeConfig, type ChainError } from "./errors.ts";
import { Chain } from "./services/chain.ts";
import { Db } from "./services/db.ts";

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
      filter: officeFilter(parseScreen(row)),
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

  // Before the daily-loss check, so a loss that pauses the office today does not cost yesterday's briefing. A failed
  // briefing is logged and never keeps the desks (a stop loss among them) from their tick.
  yield* dailyBriefing(office).pipe(
    Effect.catchTag("DbError", (error) =>
      Effect.logError(`office ${row.userId} briefing failed: ${error.operation}`, error.cause),
    ),
  );

  const floor = yield* readFloor(office);
  const loss = dailyLossPct(floor.dayStartCapital, dayPnlSol(floor.book, now));
  if (dailyLossHit(office.guardrails, loss)) {
    yield* db.setPause(row.userId, { reason: DAILY_LOSS, until: new Date(utcDayStart(now).getTime() + DAY_MS) });
    yield* say(office, "manager", `The office is down ${loss?.toFixed(1)}% today. Pausing until 00:00 UTC.`, "bad");
    return;
  }

  yield* scoutAndDraft(floor);
  yield* reviewDrafts(floor);
  yield* presentChecked(floor);
});

/** The wallet and the office's positions as the desks see them this tick. One balance read on the user's RPC. */
const readFloor = (office: Office) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const book = yield* db.book(office.userId, utcDayStart(office.now));
    const wallet = yield* db.wallet(office.row);
    if (wallet._tag !== "ready") {
      if (wallet._tag === "unreadable") yield* Effect.logWarning(`office ${office.userId}: RPC URL does not decrypt`);
      return {
        ...office,
        walletSol: null,
        positionRentSol: null,
        dayStartCapital: null,
        book,
        rpc: null,
      } satisfies Floor;
    }
    const chain = yield* Chain;
    const orNull = (what: string, read: Effect.Effect<number, ChainError>) =>
      read.pipe(
        Effect.map((sol): number | null => sol),
        Effect.catchTag("ChainError", (error) =>
          Effect.logWarning(`office ${office.userId}: ${what} read failed: ${error.message}`).pipe(Effect.as(null)),
        ),
      );
    const [walletSol, positionRentSol] = yield* Effect.all(
      [
        orNull("balance", chain.balanceSol(wallet.rpcUrl, wallet.owner)),
        orNull("position rent", chain.positionRentSol(wallet.rpcUrl)),
      ],
      { concurrency: 2 },
    );
    // Stored on the office row so the runner's Executor reads the same baseline and a restart keeps it.
    let dayStartCapital = storedDayCapital(office.row, office.now);
    if (dayStartCapital === null && walletSol !== null) {
      dayStartCapital = officeCapital(walletSol, book.open);
      yield* db.setDayCapital(office.userId, dayStartCapital, new Date(office.now));
    }
    return {
      ...office,
      walletSol,
      positionRentSol,
      dayStartCapital,
      book,
      rpc: { owner: wallet.owner, url: wallet.rpcUrl },
    } satisfies Floor;
  });
