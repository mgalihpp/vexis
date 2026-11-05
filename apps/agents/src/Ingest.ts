import { Array as Arr, Clock, Effect } from "effect";
import { Db, type NewMinute } from "./Db.ts";
import { Meteora, type PoolReading } from "./Meteora.ts";
import { volumeDelta } from "./spike.ts";

const MINUTE_MS = 60_000;
/** Pools per Meteora request. */
export const BATCH_SIZE = 100;
/** How long `pool_minutes` rows are kept. */
export const RETENTION_MS = 7 * 24 * 60 * MINUTE_MS;

/**
 * Reads every pool once and stores this minute's row. A batch that fails is logged and its pools
 * simply miss this minute (the next delta then spans a gap and is stored as null). Returns the
 * readings that did arrive, for the evaluator's pool names.
 */
export const ingest = Effect.fn("ingest")(function* (addresses: ReadonlyArray<string>) {
  const db = yield* Db;
  const meteora = yield* Meteora;

  const now = yield* Clock.currentTimeMillis;
  const minute = Math.floor(now / MINUTE_MS) * MINUTE_MS;

  const batches = yield* Effect.forEach(Arr.chunksOf(addresses, BATCH_SIZE), (batch) =>
    meteora
      .pools(batch)
      .pipe(
        Effect.catchTag("MeteoraError", (error) =>
          Effect.logWarning("meteora batch failed", error.cause).pipe(Effect.as<ReadonlyArray<PoolReading>>([])),
        ),
      ),
  );
  const readings = batches.flat();

  const previous = yield* db.latestReadings(readings.map((r) => r.address));
  const rows = readings.map(
    (r): NewMinute => ({
      poolAddress: r.address,
      minute: new Date(minute),
      cumulativeVolume: r.cumulativeVolume,
      volume: volumeDelta(previous.get(r.address), { minute, cumulativeVolume: r.cumulativeVolume }),
      tvl: r.tvl,
    }),
  );
  yield* db.insertMinutes(rows);
  yield* Effect.logDebug(`ingested ${rows.length}/${addresses.length} pools`);

  return new Map(readings.map((r) => [r.address, r]));
});

export const prune = Effect.fn("prune")(function* () {
  const db = yield* Db;
  const now = yield* Clock.currentTimeMillis;
  yield* db.pruneMinutes(new Date(now - RETENTION_MS));
});
