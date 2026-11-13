import { Context, Effect, Layer, Ref } from "effect";
import { type History, recordMinute } from "./screener-history.ts";

/**
 * Per-minute volume of every screener pool, kept in memory: storing ~620 pools a minute in `pool_minutes` would be
 * about 890k rows a day. A restart starts empty, so screener alerts warm up again before any verdict.
 */
export class ScreenerHistory extends Context.Service<
  ScreenerHistory,
  {
    /** Records this minute's readings and returns the history including them. */
    record(
      readings: ReadonlyArray<{ readonly address: string; readonly cumulativeVolume: number }>,
      minute: number,
    ): Effect.Effect<History>;
  }
>()("vexis/agents/ScreenerHistory") {
  static readonly make = (ref: Ref.Ref<History>) =>
    ScreenerHistory.of({
      record: (readings, minute) => Ref.updateAndGet(ref, (history) => recordMinute(history, readings, minute)),
    });

  static readonly layer = Layer.effect(ScreenerHistory, Effect.map(Ref.make<History>(new Map()), ScreenerHistory.make));
}
