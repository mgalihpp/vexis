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

/** `$950.12`, `$114.20K`, `$1.27M`. */
export function compactUsd(value: number) {
  const abs = Math.abs(value);
  const [div, suffix] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
  return `${value < 0 ? "-" : ""}$${fmt(2).format(abs / div)}${suffix}`;
}

const smallPrice = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const largePrice = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/** `0.0000000588` reads as `0.0₇588`: four or more zeros after the point collapse into a subscript count. */
export const collapseZeros = (formatted: string) =>
  formatted.replace(
    /^(-?0\.)(0{4,})/,
    (_, head: string, zeros: string) =>
      `${head}0${[...String(zeros.length)].map((d) => SUBSCRIPT[Number(d)]).join("")}`,
  );

/** Pool prices are often tiny (`0.000783`), so below 1 they keep three significant digits. */
export const formatPrice = (value: number) => collapseZeros((value < 1 ? smallPrice : largePrice).format(value));

const largeAmount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** Token amounts: `1,234.568` from 1 up, three significant digits below (`0.000543`). */
export const formatAmount = (value: number) => (value < 1 ? smallPrice : largeAmount).format(value);

const pad = (n: number) => String(n).padStart(2, "0");

/** `21h 07m 57s`, or `2d 03h 04m` from a day up. */
export function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor(s / 60) % 60;
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${h}h ${pad(m)}m ${pad(s % 60)}s`;
}

/** `1m 42s`, `1h 24m 54s`, `8d 09h 36m 36s`: leading zero units dropped, seconds kept. */
export function fullDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor(s / 60) % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s % 60)}s`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s % 60)}s`;
  if (m > 0) return `${m}m ${pad(s % 60)}s`;
  return `${s}s`;
}

const AGO: [limitSeconds: number, unitSeconds: number, one: string, many: string][] = [
  [45, 1, "a few seconds", "a few seconds"],
  [90, 60, "a minute", "minutes"],
  [45 * 60, 60, "a minute", "minutes"],
  [90 * 60, 3600, "an hour", "hours"],
  [22 * 3600, 3600, "an hour", "hours"],
  [36 * 3600, 86_400, "a day", "days"],
  [26 * 86_400, 86_400, "a day", "days"],
  [45 * 86_400, 30 * 86_400, "a month", "months"],
  [320 * 86_400, 30 * 86_400, "a month", "months"],
  [Number.POSITIVE_INFINITY, 365 * 86_400, "a year", "years"],
];

/** `9 days ago`, measured from `now` (pass the loader's fetch time so SSR and hydration agree). */
export function timeAgo(ms: number, now: number) {
  const s = Math.max(0, (now - ms) / 1000);
  for (const [limit, unit, one, many] of AGO) {
    if (s >= limit) continue;
    const n = Math.round(s / unit);
    return `${n <= 1 || unit === 1 ? one : `${n} ${many}`} ago`;
  }
  return "";
}

const utcDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const utcTime = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** `Oct 30, 2026 20:30:10` in the zone `offset` minutes east of UTC; `joiner` replaces the space between date and time. */
export const utcStamp = (ms: number, joiner = " ", offset = 0) => {
  const at = ms + offset * 60_000;
  return `${utcDate.format(at)}${joiner}${utcTime.format(at)}`;
};
