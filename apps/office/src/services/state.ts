import { utcDayStart } from "@vexis/db/office";
import { Context, Effect, Layer, Ref } from "effect";

// Memory the runtime keeps between ticks. A restart forgets it on purpose: Scout runs at once, the day's starting
// capital is taken again at the first read, and each once-a-day notice can repeat one time.

type Store = {
  readonly scoutAt: Map<string, number>;
  readonly dayStart: Map<string, { readonly day: number; readonly sol: number }>;
  readonly notices: Set<string>;
};

export class OfficeState extends Context.Service<
  OfficeState,
  {
    lastScout(userId: string): Effect.Effect<number | null>;
    markScout(userId: string, at: number): Effect.Effect<void>;
    /** The office's capital at the first read of the UTC day holding `now`; `sol` is today's first when none is kept. */
    dayStartCapital(userId: string, now: number, sol: number | null): Effect.Effect<number | null>;
    /** True the first time `key` is seen on the UTC day holding `now`, so a notice goes to the feed once a day. */
    firstToday(key: string, now: number): Effect.Effect<boolean>;
  }
>()("vexis/office/OfficeState") {
  static readonly layer = Layer.effect(
    OfficeState,
    Effect.gen(function* () {
      const store = yield* Ref.make<Store>({ scoutAt: new Map(), dayStart: new Map(), notices: new Set() });
      return OfficeState.of({
        lastScout: (userId) => Ref.get(store).pipe(Effect.map((s) => s.scoutAt.get(userId) ?? null)),
        markScout: (userId, at) => Ref.update(store, (s) => ({ ...s, scoutAt: new Map(s.scoutAt).set(userId, at) })),
        dayStartCapital: (userId, now, sol) =>
          Ref.modify(store, (s) => {
            const day = utcDayStart(now).getTime();
            const kept = s.dayStart.get(userId);
            if (kept?.day === day) return [kept.sol, s] as const;
            if (sol === null) return [null, s] as const;
            return [sol, { ...s, dayStart: new Map(s.dayStart).set(userId, { day, sol }) }] as const;
          }),
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
