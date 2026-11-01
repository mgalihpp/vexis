import { describe, expect, test } from "bun:test";
import { type BalanceToken, balanceMint, balancesView, type WalletBalances } from "./balances";
import { formatAmount } from "./money";
import { SOL_MINT } from "./portfolio";

const token = (mint: string, over: Partial<BalanceToken> = {}): BalanceToken => ({
  mint,
  symbol: mint.toUpperCase(),
  name: mint,
  icon: null,
  verified: true,
  organicScore: 90,
  price: 1,
  fdv: 1e6,
  priceChange24h: 0,
  ...over,
});

const wallet: WalletBalances = {
  balances: [
    { mint: "usdc", amount: 50 },
    { mint: "sol", amount: 2 },
    { mint: "junk", amount: 1_000_000 },
    { mint: "meme", amount: 300 },
    { mint: "dust", amount: 0 },
    { mint: "ghost", amount: 7 },
  ],
  tokens: [
    token("usdc"),
    token("sol", { price: 150 }),
    token("junk", { verified: false, price: null, fdv: null }),
    token("meme", { verified: false, price: 0.1 }),
    token("dust"),
  ],
};

const SOL_PRICE = 200;

describe("balancesView", () => {
  const view = balancesView(wallet, SOL_PRICE);
  const [verified, other] = view.groups;
  const mints = (rows: { token: BalanceToken }[]) => rows.map((r) => r.token.mint);

  test("puts verified tokens in the first group and everything else, unknown mints included, in the second", () => {
    expect(view.groups.map((g) => g.label)).toEqual(["Verified Tokens", "All Other Tokens"]);
    expect(mints(verified?.rows ?? [])).toEqual(["sol", "usdc"]);
    expect(new Set(mints(other?.rows ?? []))).toEqual(new Set(["meme", "junk", "ghost"]));
  });

  test("sorts each group by value descending, unpriced rows last", () => {
    expect(mints(verified?.rows ?? [])).toEqual(["sol", "usdc"]);
    expect(other?.rows[0]?.token.mint).toBe("meme");
    expect(mints(other?.rows.slice(1) ?? [])).toEqual(["junk", "ghost"]);
  });

  test("skips zero balances", () => {
    expect([...mints(verified?.rows ?? []), ...mints(other?.rows ?? [])]).not.toContain("dust");
  });

  test("leaves unpriced rows out of every total", () => {
    const junk = other?.rows.find((r) => r.token.mint === "junk");
    expect(junk?.value).toEqual({ usd: null, sol: null });
    expect(verified?.total.usd).toBe(350);
    expect(other?.total.usd).toBe(30);
    expect(other?.unpriced).toBe(2);
    expect(view.total.usd).toBe(380);
    expect(view.unpriced).toBe(2);
  });

  test("converts values and totals to SOL at the given SOL price", () => {
    expect(verified?.rows[0]?.value.sol).toBe(1.5);
    expect(verified?.total.sol).toBe(1.75);
    expect(view.total.sol).toBe(1.9);
  });

  test("has no SOL values when the SOL price is unknown", () => {
    const noPrice = balancesView(wallet, null);
    expect(noPrice.total).toEqual({ usd: 380, sol: null });
    expect(noPrice.groups[0]?.rows[0]?.value.sol).toBeNull();
  });

  test("an all-unpriced wallet totals zero", () => {
    const junkOnly = balancesView(
      { balances: [{ mint: "junk", amount: 5 }], tokens: [token("junk", { verified: false, price: null })] },
      SOL_PRICE,
    );
    expect(junkOnly.total).toEqual({ usd: 0, sol: 0 });
    expect(junkOnly.unpriced).toBe(1);
    expect(junkOnly.groups[1]?.rows).toHaveLength(1);
  });

  test("merges native and wrapped SOL into one row", () => {
    const sol = balancesView(
      {
        balances: [
          { mint: SOL_MINT, amount: 1 },
          { mint: SOL_MINT, amount: 0.5 },
        ],
        tokens: [token(SOL_MINT, { price: 200 })],
      },
      SOL_PRICE,
    );
    expect(sol.groups[0]?.rows).toHaveLength(1);
    expect(sol.groups[0]?.rows[0]?.amount).toBe(1.5);
    expect(sol.total).toEqual({ usd: 300, sol: 1.5 });
  });

  test("an empty wallet has empty groups", () => {
    const empty = balancesView({ balances: [], tokens: [] }, SOL_PRICE);
    expect(empty.groups.map((g) => g.rows.length)).toEqual([0, 0]);
    expect(empty.total.usd).toBe(0);
  });
});

test("balanceMint maps the native SOL key to the wrapped SOL mint", () => {
  expect(balanceMint("SOL")).toBe(SOL_MINT);
  expect(balanceMint("abc")).toBe("abc");
});

test("formatAmount keeps tiny amounts visible and trims large ones", () => {
  expect(formatAmount(0.000543)).toBe("0.000543");
  expect(formatAmount(1234.56789)).toBe("1,234.568");
  expect(formatAmount(2)).toBe("2");
});
