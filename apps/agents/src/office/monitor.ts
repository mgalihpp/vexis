import { REBALANCE_STRATEGIES } from "@vexis/db/agents";
import { Guardrails, isPaused, pauseOf } from "@vexis/db/office";
import { Clock, Effect } from "effect";
import { feeValueInLamports, lamportsToSol } from "../rebalance/fees.ts";
import { Chain, type PoolState } from "../services/chain.ts";
import { type LivePosition, type OfficeConfigRow, OfficeDb } from "../services/office-db.ts";
import { monitorProposal } from "./monitor-rules.ts";

/** Offices read at once; one office's positions are read one after another. */
const OFFICE_CONCURRENCY = 4;

const strategyOf = (openParams: unknown) => {
  const raw = (openParams as { strategy?: unknown } | null)?.strategy;
  return REBALANCE_STRATEGIES.find((s) => s === raw) ?? "Spot";
};

/**
 * One minute of the Monitor: reads every real open office position on chain over the owner's RPC, stores its value
 * for the daily loss, and drafts a close, rebalance or claim when one is due. Drafts go through the same Risk Manager
 * and approval as any proposal. Reads only: nothing here signs, and no datapi request is made.
 */
export const officeMonitor = Effect.fn("office.monitor")(function* () {
  const db = yield* OfficeDb;
  const positions = yield* db.livePositions();
  if (positions.length === 0) return;
  const offices = new Map((yield* db.offices()).map((o) => [o.userId, o]));
  const byUser = new Map<string, LivePosition[]>();
  for (const p of positions) byUser.set(p.journal.userId, [...(byUser.get(p.journal.userId) ?? []), p]);
  yield* Effect.forEach(
    byUser,
    ([userId, held]) => {
      const office = offices.get(userId);
      if (!office) return Effect.logWarning(`office ${userId}: open positions but no office`);
      return watchOffice(office, held).pipe(
        Effect.catchTag("DbError", (error) =>
          Effect.logError(`office ${userId} monitor failed: ${error.operation}`, error.cause),
        ),
      );
    },
    { concurrency: OFFICE_CONCURRENCY, discard: true },
  );
});

const watchOffice = (office: OfficeConfigRow, held: ReadonlyArray<LivePosition>) =>
  Effect.gen(function* () {
    const db = yield* OfficeDb;
    const chain = yield* Chain;
    const { userId } = office;
    const wallet = yield* db.wallet(office);
    if (wallet._tag !== "ready") {
      yield* Effect.logWarning(`office ${userId}: no readable wallet RPC, ${held.length} position(s) unwatched`);
      return;
    }
    const parsed = Guardrails.safeParse(office.guardrails);
    if (!parsed.success) {
      yield* Effect.logWarning(`office ${userId}: guardrails do not parse, positions unwatched`);
      return;
    }
    const g = parsed.data;
    const managed = yield* db.rebalancePools(userId);
    const reads = new Map<string, PoolState>();

    for (const { journal, openParams } of held) {
      const positionAddress = journal.positionAddress;
      if (positionAddress === null) continue;
      let state = reads.get(journal.poolAddress);
      if (!state) {
        const read = yield* chain.pool(wallet.rpcUrl, journal.poolAddress, wallet.owner).pipe(
          Effect.map((s): PoolState | null => s),
          Effect.catchTag("ChainError", (error) =>
            Effect.logWarning(`office ${userId}: read of ${journal.poolAddress} failed`, error.cause).pipe(
              Effect.as(null),
            ),
          ),
        );
        if (!read) continue;
        state = read;
        reads.set(journal.poolAddress, read);
      }
      const position = state.positions.find((p) => p.address === positionAddress);
      // Its value then goes stale, so the daily loss vetoes new opens until someone looks.
      if (!position) {
        yield* Effect.logWarning(`office ${userId}: position ${positionAddress} is not on chain for this wallet`);
        continue;
      }
      const priced = (x: bigint, y: bigint) => {
        const lamports = feeValueInLamports({
          feeX: x,
          feeY: y,
          mintX: state.mintX,
          mintY: state.mintY,
          pricePerLamport: state.pricePerLamport,
        });
        return lamports === null ? null : lamportsToSol(lamports);
      };
      const valueSol = priced(position.amountX + position.feeX, position.amountY + position.feeY);
      const now = yield* Clock.currentTimeMillis;
      if (valueSol !== null) yield* db.setJournalValue(userId, journal.id, valueSol, new Date(now));

      if (isPaused(pauseOf(office), now) || managed.has(journal.poolAddress)) continue;
      const due = monitorProposal(g, {
        costSol: journal.amountSol,
        valueSol,
        feeSol: priced(position.feeX, position.feeY),
        activeBin: state.activeBinId,
        lowerBin: position.lowerBinId,
        upperBin: position.upperBinId,
        strategy: strategyOf(openParams),
      });
      if (!due) continue;
      const last = yield* db.lastProposalAt(userId, journal.poolAddress);
      if (last !== null && now - last.getTime() < g.cooldownSec * 1000) continue;
      const row = yield* db.insertProposal(userId, {
        kind: due.proposal.kind,
        poolAddress: journal.poolAddress,
        poolName: journal.poolName,
        positionAddress,
        params: due.proposal.params,
        rationale: due.rationale,
        proposedBy: "monitor",
        expiresAt: new Date(now + g.approvalTtlSec * 1000),
      });
      if (!row) continue;
      yield* db.message(userId, {
        agent: "monitor",
        text: `${journal.poolName ?? "A position"}: proposing a ${due.proposal.kind}. ${due.rationale}`,
        tone: due.proposal.kind === "close" ? "warn" : "info",
        poolAddress: journal.poolAddress,
        proposalId: row.id,
      });
    }
  });
