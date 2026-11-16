import { utcDayStart } from "@vexis/shared/office";
import { Context, Effect, Layer, Ref } from "effect";

// Memory the runtime keeps between ticks. A restart forgets it on purpose: Scout runs at once and each once-a-day
// notice can repeat one time.

type Store = {
  readonly scoutAt: Map<string, number>;
  readonly notices: Set<string>;
};

export class OfficeState extends Context.Service<
  OfficeState,
  {
    lastScout(userId: string): Effect.Effect<number | null>;
    markScout(userId: string, at: number): Effect.Effect<void>;
    /** True the first time `key` is seen on the UTC day holding `now`, so a notice goes to the feed once a day. */
    firstToday(key: string, now: number): Effect.Effect<boolean>;
  }
>()("vexis/office/OfficeState") {
  static readonly layer = Layer.effect(
    OfficeState,
    Effect.gen(function* () {
      const store = yield* Ref.make<Store>({ scoutAt: new Map(), notices: new Set() });
      return OfficeState.of({
        lastScout: (userId) => Ref.get(store).pipe(Effect.map((s) => s.scoutAt.get(userId) ?? null)),
        markScout: (userId, at) => Ref.update(store, (s) => ({ ...s, scoutAt: new Map(s.scoutAt).set(userId, at) })),
        firstToday: (key, now) =>
          Ref.modify(store, (s) => {
            const tagged = `${utcDayStart(now).getTime()}:${key}`;
            if (s.notices.has(tagged)) return [false, s] as const;
            return [true, { ...s, notices: new Set(s.notices).add(tagged) }] as const;
          }),
      });
    }),
  );
}
