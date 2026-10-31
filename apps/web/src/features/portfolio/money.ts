import type { Currency } from "./portfolio";

const formatters = new Map<string, Intl.NumberFormat>();

function fmt(digits: number) {
  const key = String(digits);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(key, f);
  }
  return f;
}

/** `18.0254 SOL`, `+0.42 SOL`, `-$12.30`. SOL defaults to 4 decimals, USD to 2. */
export function money(value: number, currency: Currency, opts: { signed?: boolean; digits?: number } = {}) {
  const digits = opts.digits ?? (currency === "sol" ? 4 : 2);
  const body = fmt(digits).format(Math.abs(value));
  const negative = value < 0 || Object.is(value, -0);
  const sign = negative ? "-" : opts.signed ? "+" : "";
  return currency === "sol" ? `${sign}${body} SOL` : `${sign}$${body}`;
}

export const pct = (ratio: number, digits = 2) => `${fmt(digits).format(ratio * 100)}%`;

export const tone = (value: number) => (value > 0 ? "text-profit" : value < 0 ? "text-loss" : "text-muted-foreground");
