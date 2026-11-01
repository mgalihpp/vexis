import { SOL_MINT } from "./portfolio";

/** A non-zero wallet balance; `amount` is already scaled by the mint's decimals. */
export interface TokenBalance {
  mint: string;
  amount: number;
}

export interface BalanceToken {
  mint: string;
  symbol: string;
  name: string;
  icon: string | null;
  verified: boolean;
  organicScore: number | null;
  /** USD; null when Jupiter has no price for the token. */
  price: number | null;
  fdv: number | null;
  /** 24h price change in percent, e.g. -0.29. */
  priceChange24h: number | null;
}

/** What the balances server function returns; `tokens` may lack a mint Jupiter does not know. */
export interface WalletBalances {
  balances: TokenBalance[];
  tokens: BalanceToken[];
}

/** Null for an unpriced token, or for SOL when the SOL price is unknown. */
export interface BalanceValue {
  usd: number | null;
  sol: number | null;
}

export interface BalanceRow {
  token: BalanceToken;
  amount: number;
  value: BalanceValue;
}

export type GroupId = "verified" | "other";

export interface BalanceGroup {
  id: GroupId;
  label: string;
  rows: BalanceRow[];
  /** Sum over priced rows only. */
  total: BalanceValue;
  unpriced: number;
}

export interface BalancesView {
  total: BalanceValue;
  groups: BalanceGroup[];
  unpriced: number;
}

const GROUPS: { id: GroupId; label: string }[] = [
  { id: "verified", label: "Verified Tokens" },
  { id: "other", label: "All Other Tokens" },
];

/** A mint Jupiter returned nothing for. */
export function unknownToken(mint: string): BalanceToken {
  return {
    mint,
    symbol: mint.slice(0, 4),
    name: mint,
    icon: null,
    verified: false,
    organicScore: null,
    price: null,
    fdv: null,
    priceChange24h: null,
  };
}

const inSol = (usd: number | null, solPrice: number | null) => (usd === null || !solPrice ? null : usd / solPrice);

const byValue = (a: BalanceRow, b: BalanceRow) =>
  (b.value.usd ?? Number.NEGATIVE_INFINITY) - (a.value.usd ?? Number.NEGATIVE_INFINITY) || b.amount - a.amount;

function sumUsd(rows: BalanceRow[]) {
  return rows.reduce((sum, r) => sum + (r.value.usd ?? 0), 0);
}

/** Rows grouped verified first, each group sorted by value; unpriced rows sort last and stay out of totals. */
export function balancesView(data: WalletBalances, solPrice: number | null): BalancesView {
  const tokens = new Map(data.tokens.map((t) => [t.mint, t]));
  // Native SOL and a wrapped SOL account share a mint; one row holds both.
  const amounts = new Map<string, number>();
  for (const b of data.balances) if (b.amount > 0) amounts.set(b.mint, (amounts.get(b.mint) ?? 0) + b.amount);
  const rows = [...amounts].map(([mint, amount]): BalanceRow => {
    const token = tokens.get(mint) ?? unknownToken(mint);
    const usd = token.price === null ? null : amount * token.price;
    return { token, amount, value: { usd, sol: inSol(usd, solPrice) } };
  });
  const groups = GROUPS.map(({ id, label }): BalanceGroup => {
    const mine = rows.filter((r) => (r.token.verified ? "verified" : "other") === id).sort(byValue);
    const usd = sumUsd(mine);
    return {
      id,
      label,
      rows: mine,
      total: { usd, sol: inSol(usd, solPrice) },
      unpriced: mine.filter((r) => r.value.usd === null).length,
    };
  });
  const usd = sumUsd(rows);
  return {
    total: { usd, sol: inSol(usd, solPrice) },
    groups,
    unpriced: rows.filter((r) => r.value.usd === null).length,
  };
}

/** Jupiter's balances endpoint reports native SOL under this key instead of its mint. */
export const NATIVE_SOL_KEY = "SOL";

export const balanceMint = (key: string) => (key === NATIVE_SOL_KEY ? SOL_MINT : key);
