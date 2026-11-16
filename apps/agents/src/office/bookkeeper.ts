import { type PositionPnl, positionAmounts } from "@vexis/db/pnl";
import { Clock, Effect } from "effect";
import { Meteora } from "../services/meteora.ts";
import { type JournalRow, OfficeDb } from "../services/office-db.ts";

/** Meteora indexes a close after it lands; reading sooner would find nothing and spend the one read. */
export const BOOK_DELAY_MS = 10 * 60_000;

export type ClosePnl = { readonly pnlSol: number | null; readonly pnlUsd: number | null };

const UNKNOWN: ClosePnl = { pnlSol: null, pnlUsd: null };

/** The close's PnL as the portfolio reads it (`positionAmounts`); unknown when Meteora does not list it closed. */
export function closePnl(positions: ReadonlyArray<PositionPnl>, positionAddress: string | null): ClosePnl {
  const p = positions.find((x) => x.positionAddress === positionAddress);
  if (!p?.isClosed) return UNKNOWN;
  return { pnlSol: positionAmounts(p, "sol").pnl, pnlUsd: positionAmounts(p, "usd").pnl };
}

const sign = (n: number) => (n >= 0 ? "+" : "−");

/**
 * One minute of the Bookkeeper: every real close at least `BOOK_DELAY_MS` old that has not been read gets its PnL in
 * SOL and USD from Meteora, the source the portfolio reads. One datapi request per (pool, wallet), shared by the
 * closes in it, and each close is read once: a PnL Meteora does not have, or a failed request, stays null for good.
 */
export const officeBookkeeper = Effect.fn("office.bookkeeper")(function* () {
  const db = yield* OfficeDb;
  const meteora = yield* Meteora;
  const now = yield* Clock.currentTimeMillis;
  const rows = yield* db.unbookedCloses(new Date(now - BOOK_DELAY_MS));
  const groups = new Map<string, JournalRow[]>();
  for (const row of rows) {
    const key = `${row.poolAddress} ${row.walletAddress ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    const [first] = group;
    if (!first) continue;
    const positions =
      first.walletAddress === null
        ? []
        : yield* meteora
            .closedPositions(first.poolAddress, first.walletAddress)
            .pipe(
              Effect.catchTag("MeteoraError", (error) =>
                Effect.logWarning(`bookkeeper: PnL read for ${first.poolAddress} failed`, error.cause).pipe(
                  Effect.as([] as ReadonlyArray<PositionPnl>),
                ),
              ),
            );
    for (const row of group) {
      const pnl = closePnl(positions, row.positionAddress);
      yield* db.bookClose(row.userId, row.id, pnl, new Date(now));
      const name = row.poolName ?? row.poolAddress.slice(0, 6);
      const known = pnl.pnlSol !== null;
      const sol = pnl.pnlSol ?? 0;
      const usd = pnl.pnlUsd === null ? "—" : `${sign(pnl.pnlUsd)}$${Math.abs(pnl.pnlUsd).toFixed(2)}`;
      yield* db.message(row.userId, {
        agent: "bookkeeper",
        text: known
          ? `${name} closed (${row.closeReason ?? "closed"}): ${sign(sol)}${Math.abs(sol).toFixed(4)} SOL, ${usd}.`
          : `Meteora has no PnL for the ${name} close, so it stays unknown and out of the totals.`,
        tone: known ? (sol >= 0 ? "good" : "bad") : "warn",
        poolAddress: row.poolAddress,
      });
    }
  }
});
