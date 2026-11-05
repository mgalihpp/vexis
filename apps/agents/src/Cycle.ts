import { Effect } from "effect";
import { Db } from "./Db.ts";
import { evaluate } from "./Evaluate.ts";
import { ingest } from "./Ingest.ts";

/**
 * One tick: collect the pools of every runnable agent, read each once, then judge every
 * (agent, pool) pair. No agents or no pools means nothing to do.
 */
export const cycle = Effect.fn("cycle")(function* () {
  const db = yield* Db;
  const watches = yield* db.runnableWatches();
  const addresses = [...new Set(watches.map((w) => w.poolAddress))];
  if (addresses.length === 0) return;

  const pools = yield* ingest(addresses);
  yield* evaluate(watches, pools);
});
