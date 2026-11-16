import { describe, expect, it } from "bun:test";
import { BACKGROUND_RESERVE, DatapiBudget, datapiBackgroundFetch, datapiFetch, MAX_ATTEMPTS } from "./datapi-budget";

const ORIGIN = "https://datapi.test";

/** A clock that only moves when something sleeps, and a fetch that answers from a script. */
function world(script: Array<{ status?: number; headers?: Record<string, string> }>) {
  let t = 1_000_000;
  const sleeps: number[] = [];
  const calls: string[] = [];
  const opts = {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    fetch: (async (input: string | URL | Request) => {
      calls.push(String(input));
      const step = script[Math.min(calls.length - 1, script.length - 1)] ?? {};
      return new Response("{}", { status: step.status ?? 200, headers: step.headers });
    }) as typeof fetch,
  };
  return { opts, sleeps, calls, at: () => t };
}

const reset = (secondsFromNow: number, t = 1_000_000) => String(Math.ceil(t / 1000) + secondsFromNow);

describe("datapiFetch", () => {
  it("waits out a 429 until the reset, then continues", async () => {
    const w = world([{ status: 429, headers: { "x-ratelimit-reset": reset(10) } }, { status: 200 }]);
    const res = await datapiFetch(`${ORIGIN}/pools`, undefined, { ...w.opts, budget: new DatapiBudget() });
    expect(res.status).toBe(200);
    expect(w.calls).toHaveLength(2);
    expect(w.sleeps[0]).toBeGreaterThanOrEqual(10_000);
  });

  it("honours retry-after when there is no reset header, and backs off by attempt when there is neither", async () => {
    const a = world([{ status: 429, headers: { "retry-after": "7" } }, { status: 200 }]);
    await datapiFetch(`${ORIGIN}/x`, undefined, { ...a.opts, budget: new DatapiBudget() });
    expect(a.sleeps[0]).toBeGreaterThanOrEqual(7000);
    const b = world([{ status: 429 }, { status: 429 }, { status: 200 }]);
    await datapiFetch(`${ORIGIN}/x`, undefined, { ...b.opts, budget: new DatapiBudget() });
    expect(b.sleeps.map((ms) => Math.round(ms / 1000))).toEqual([1, 2]);
  });

  it("gives up after MAX_ATTEMPTS and hands back the 429", async () => {
    const w = world([{ status: 429 }]);
    const res = await datapiFetch(`${ORIGIN}/x`, undefined, { ...w.opts, budget: new DatapiBudget() });
    expect(res.status).toBe(429);
    expect(w.calls).toHaveLength(MAX_ATTEMPTS);
  });

  it("holds background work at the reserve but lets a user request through", async () => {
    const budget = new DatapiBudget();
    const w = world([{ status: 200 }]);
    budget.remaining = BACKGROUND_RESERVE;
    budget.resetAt = w.at() + 30_000;
    await datapiFetch(`${ORIGIN}/user`, undefined, { ...w.opts, budget });
    expect(w.sleeps).toEqual([]);
    await datapiFetch(`${ORIGIN}/bg`, undefined, { ...w.opts, budget, background: true });
    expect(w.sleeps[0]).toBeGreaterThanOrEqual(30_000);
  });

  it("does not crash or wait on missing or garbage headers", async () => {
    const w = world([{ headers: { "x-ratelimit-remaining": "abc" } }, { status: 200 }]);
    const budget = new DatapiBudget();
    await datapiFetch(`${ORIGIN}/x`, undefined, { ...w.opts, budget, background: true });
    await datapiFetch(`${ORIGIN}/x`, undefined, { ...w.opts, budget, background: true });
    expect(w.sleeps).toEqual([]);
  });

  it("shows a budget one consumer spent to the other", async () => {
    const shared = new DatapiBudget();
    const low = { "x-ratelimit-remaining": "5", "x-ratelimit-reset": reset(20) };
    const w = world([{ headers: low }, { status: 200 }]);
    await datapiFetch(`${ORIGIN}/runner`, undefined, { ...w.opts, budget: shared, background: true });
    await datapiFetch(`${ORIGIN}/office`, undefined, { ...w.opts, budget: shared, background: true });
    expect(w.sleeps).toHaveLength(1);
    expect(w.sleeps[0]).toBeGreaterThanOrEqual(20_000);
  });
});

describe("datapiBackgroundFetch", () => {
  it("guards only the datapi origin", async () => {
    const budget = new DatapiBudget();
    budget.remaining = 0;
    const w = world([{ status: 200 }]);
    const f = datapiBackgroundFetch(ORIGIN, { ...w.opts, budget });
    budget.resetAt = w.at() + 5000;
    await f("https://other.test/pools");
    expect(w.sleeps).toEqual([]);
    await f(`${ORIGIN}/pools`);
    expect(w.sleeps).toHaveLength(1);
  });
});
