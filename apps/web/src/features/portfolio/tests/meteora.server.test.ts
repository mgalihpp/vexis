import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "vexis-meteora-"));
process.env.VEXIS_CACHE_DIR = dir;
const { loadPortfolio, loadTransactions } = await import("../meteora.server");

const WALLET = "81gDB9FDGqLLiCVhNMXBAk9NotKNe2MRECSm8Ck7koGa";
const GOOD = "PoolGood1111111111111111111111111111111111";
const BAD = "PoolBad11111111111111111111111111111111111";
const SECONDS = 1_700_000_000;

const side = (sol: number, usd: number) => ({ total: { sol, usd } });
const position = (address: string, closedAt: number, extra: object = {}) => ({
  positionAddress: address,
  isClosed: true,
  createdAt: closedAt - 100,
  closedAt,
  lowerBinId: 1,
  upperBinId: 2,
  minPrice: 1,
  maxPrice: 2,
  allTimeDeposits: side(1, 150),
  allTimeWithdrawals: side(1.1, 165),
  allTimeFees: side(0.05, 7.5),
  pnlSol: 0.15,
  pnlUsd: 22.5,
  ...extra,
});
const pool = (poolAddress: string, lastClosedAt: number) => ({
  poolAddress,
  tokenX: "SOL",
  tokenY: "USDC",
  tokenXMint: `${poolAddress}x`,
  tokenYMint: `${poolAddress}y`,
  binStep: 10,
  baseFee: 0.1,
  lastClosedAt,
});

const requests: URL[] = [];
const real = globalThis.fetch;
const realError = console.error;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeAll(() => {
  console.error = () => {};
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url);
    const { pathname, searchParams } = url;
    if (url.hostname.includes("jup.ag")) return json({}, 500);
    if (pathname === "/portfolio") {
      return json({ hasNext: false, pools: [pool(GOOD, SECONDS), pool(BAD, SECONDS - 1)] });
    }
    if (pathname === "/portfolio/open") return json({ hasNext: false, pools: [], solPrice: 150 });
    if (pathname === "/portfolio/total") return json({ totalClosedPositions: 1, totalPnlSol: 0.15, totalPnlUsd: 22.5 });
    if (pathname === `/positions/${GOOD}/pnl` && searchParams.get("status") === "closed") {
      // pnlSol is dropped for this one, as Meteora does for some pools.
      return json({ hasNext: false, positions: [position("pos-1", SECONDS, { pnlSol: null })] });
    }
    if (pathname === `/positions/${BAD}/pnl`) return json({}, 500);
    if (pathname === "/positions/pos-1/historical") {
      return json({
        events: [
          {
            signature: "sig",
            eventType: "add",
            blockTime: SECONDS,
            amountX: 1,
            amountY: 2,
            amountXUsd: 3,
            amountYUsd: 4,
            totalUsd: 7,
          },
        ],
      });
    }
    return json({}, 404);
  }) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = real;
  console.error = realError;
  await rm(dir, { recursive: true, force: true });
});

const calls = (path: string) => requests.filter((u) => u.pathname === path);
const settled = async () => {
  for (let i = 0; i < 100; i++) {
    const p = await loadPortfolio(WALLET);
    if (!p.closedProgress.running) return p;
    await Bun.sleep(10);
  }
  throw new Error("closed job never finished");
};

describe("the Meteora boundary", () => {
  test("closed positions come back in ms with the SOL pnl derived when Meteora drops it", async () => {
    const first = await loadPortfolio(WALLET);
    expect(first.closedProgress.total).toBe(2);
    const done = await settled();
    expect(done.closed).toHaveLength(1);
    const [closed] = done.closed;
    expect(closed).toMatchObject({
      address: "pos-1",
      pair: "SOL-USDC",
      closedAt: SECONDS * 1000,
      openedAt: (SECONDS - 100) * 1000,
    });
    expect(closed?.sol.pnl).toBeCloseTo(1.1 + 0.05 - 1, 10);
    expect(closed?.usd.pnl).toBe(22.5);
  });

  test("asks for the last 365 days in one page and never refetches inside a base snapshot", async () => {
    await settled();
    await loadPortfolio(WALLET);
    const listing = calls("/portfolio");
    expect(listing).toHaveLength(1);
    expect(listing[0]?.searchParams.get("days_back")).toBe("365");
    expect(listing[0]?.searchParams.get("page_size")).toBe("1000");
  });

  test("a failed pool stays stale and is not retried by the next poll", async () => {
    const done = await settled();
    expect(done.closedProgress).toEqual({ loaded: 1, total: 2, running: false });
    const before = calls(`/positions/${BAD}/pnl`).length;
    expect(before).toBe(1);
    await loadPortfolio(WALLET);
    await loadPortfolio(WALLET);
    expect(calls(`/positions/${BAD}/pnl`)).toHaveLength(before);
  });

  test("transaction history reads event times in ms", async () => {
    await settled();
    let result = await loadTransactions(WALLET);
    for (let i = 0; i < 100 && result.progress.running; i++) {
      await Bun.sleep(10);
      result = await loadTransactions(WALLET);
    }
    expect(result.histories.map((h) => h.events.map((e) => e.at))).toEqual([[SECONDS * 1000]]);
  });
});
