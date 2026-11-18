import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useLayoutEffect, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { compactSol, compactUsd, money } from "@/features/portfolio/money";
import { useStamp } from "@/features/timezone/timezone";
import { useNow } from "@/hooks/use-now";
import { age } from "../analytics";

/**
 * Whether a panel is expanded, remembered per browser under `key`. The server always renders it open; the saved
 * choice applies before the first paint after hydration.
 */
export function usePanelOpen(key: string) {
  const [open, setOpen] = useState(true);
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem(key) === "0") setOpen(false);
    } catch {}
  }, [key]);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(key, open ? "0" : "1");
    } catch {}
  };
  return [open, toggle] as const;
}

export function CollapseToggle({ open, onToggle, name }: { open: boolean; onToggle: () => void; name: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
      onClick={onToggle}
      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ChevronDownIcon className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

/** How long ago a section's data was fetched on the server, ticking; the exact time is in the tooltip. */
export function Updated({ at }: { at: number }) {
  const stamp = useStamp();
  const now = useNow(at);
  return (
    <span className="whitespace-nowrap text-[11px] text-muted-foreground" title={stamp(at)}>
      Updated {age(at, now)} ago
    </span>
  );
}

export const NA = "—";

const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** `2.86M`, `110.21K`. Used for axes and token amounts where a currency sign would be wrong. */
export const compact = (v: number) => compactFmt.format(v);

export const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
export const amount = (v: number | null) =>
  v == null ? NA : Math.abs(v) >= 1e4 ? compact(v) : v.toLocaleString("en-US", { maximumSignificantDigits: 4 });
export const usd = (v: number | null, signed = false) =>
  v == null ? NA : `${signed && v > 0 ? "+" : ""}${compactUsd(v)}`;
// `|| 0` drops the -0 that rounding a negative dust amount leaves, which `money` would print as `-0.0000`.
export const solRound = (v: number | null) => (v == null ? null : Math.round(v * 1e4) / 1e4 || 0);
/** Signed, with the sign from the rounded value, so a dust amount reads `0.0000 SOL` instead of `+0.0000 SOL`. */
export const sol = (v: number | null) => (v == null ? NA : money(solRound(v) ?? 0, "sol", { signed: true }));
export const solAmount = (v: number | null) => (v == null ? NA : money(v, "sol"));
export const solCompact = (v: number | null, signed = false) =>
  v == null ? NA : `${signed && v > 0 ? "+" : ""}${compactSol(v)}`;
export const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "text-profit" : "text-loss");

export const signedPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-2 rounded-[10px] border bg-card p-3 ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-muted-foreground">{children}</span>;
}

/** A number animates; a string (a dash, a date) is printed as is. */
export function Num({ value, format }: { value: ReactNode | number; format?: (value: number) => string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return <>{value}</>;
  return <AnimatedNumber value={value} format={format} />;
}

export function Stat({
  label,
  value,
  format,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode | number;
  format?: (value: number) => string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      <span className={`num text-xs font-semibold ${className}`}>
        <Num value={value} format={format} />
      </span>
    </div>
  );
}

/** Label, dotted leader, value. */
export function Row({
  label,
  value,
  format,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode | number;
  format?: (value: number) => string;
  className?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex-1 -translate-y-0.5 border-b border-dotted border-border" />
      <span className={`num font-semibold ${className}`}>
        <Num value={value} format={format} />
      </span>
    </div>
  );
}
