// Meteora's datapi allows 300 requests per window per IP, and the web app, the runner and the office runtime share
// one IP. Every response reports the server's own count (x-ratelimit-remaining / x-ratelimit-reset, epoch seconds),
// so any process that reads those headers sees what the others spent. All three go through `datapiFetch`.

type Headers = { get(name: string): string | null };

/** Background work stops this far above zero, so a page someone has open never queues behind a job or a schedule. */
export const BACKGROUND_RESERVE = 60;
export const MAX_ATTEMPTS = 6;
/** A page request waits at most this long for the budget; nginx gives up on the page at 60 s. */
export const FOREGROUND_MAX_WAIT_MS = 5_000;

export class DatapiBudgetError extends Error {
  constructor(readonly waitMs: number) {
    super(`Meteora data API is rate limited; retry in ${Math.ceil(waitMs / 1000)} s`);
    this.name = "DatapiBudgetError";
  }
}

export class DatapiBudget {
  remaining = Number.POSITIVE_INFINITY;
  resetAt = 0;

  /** Reads the limit headers off any response; a missing or unreadable header changes nothing. */
  observe(headers: Headers, status: number, now: number, attempt = 1) {
    const remaining = Number(headers.get("x-ratelimit-remaining") ?? Number.NaN);
    const reset = Number(headers.get("x-ratelimit-reset") ?? Number.NaN);
    if (Number.isFinite(remaining)) this.remaining = remaining;
    if (Number.isFinite(reset)) this.resetAt = reset * 1000;
    if (status !== 429) return;
    this.remaining = 0;
    const retryAfter = Number(headers.get("retry-after") ?? Number.NaN);
    if (Number.isFinite(retryAfter)) this.resetAt = Math.max(this.resetAt, now + retryAfter * 1000);
    if (this.resetAt <= now) this.resetAt = now + 1000 * attempt;
  }

  /** How long to hold off before a request at this priority; 0 once the window has reset. */
  waitMs(now: number, background: boolean) {
    const floor = background ? BACKGROUND_RESERVE : 0;
    return this.remaining <= floor && now < this.resetAt ? this.resetAt - now + 100 : 0;
  }
}

/** One budget per process: every datapi caller in it shares it. */
export const processBudget = new DatapiBudget();

type Clock = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  budget?: DatapiBudget;
};

/**
 * `fetch` for the datapi: waits out a low budget or a 429 and retries, up to MAX_ATTEMPTS, then returns the last
 * response for the caller to judge. `background` requests leave BACKGROUND_RESERVE requests to the web app's users.
 * `maxWaitMs` caps one wait; past it the call throws DatapiBudgetError instead of holding the page open.
 */
export async function datapiFetch(
  input: string | URL,
  init: RequestInit | undefined,
  opts: Clock & { background?: boolean; maxWaitMs?: number } = {},
): Promise<Response> {
  const budget = opts.budget ?? processBudget;
  const send = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxWaitMs = opts.maxWaitMs ?? Number.POSITIVE_INFINITY;
  for (let attempt = 1; ; attempt++) {
    const background = opts.background ?? false;
    for (let wait = budget.waitMs(now(), background); wait > 0; wait = budget.waitMs(now(), background)) {
      if (wait > maxWaitMs) throw new DatapiBudgetError(wait);
      await sleep(wait);
    }
    const res = await send(input, init);
    budget.observe(res.headers, res.status, now(), attempt);
    if (res.status !== 429 || attempt === MAX_ATTEMPTS) return res;
  }
}

/**
 * A drop-in `fetch` for an HTTP client: requests to `origin` go through the budget as background work, anything else
 * (the discovery API has its own host and limit) passes through untouched.
 */
export function datapiBackgroundFetch(origin: string, opts: Clock = {}): typeof fetch {
  const send = opts.fetch ?? fetch;
  return ((input, init) => {
    // A Request body cannot be sent twice, and the datapi is only read with GET, so a Request is never retried.
    if (input instanceof Request || new URL(String(input)).origin !== origin) return send(input, init);
    return datapiFetch(String(input), init, { ...opts, background: true });
  }) as typeof fetch;
}
