import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { money } from "@/features/portfolio/money";
import { OFFICE_KEY } from "../office.queries";

export const DASH = "—";

/** Every office write refreshes everything under ["office"]. */
export function useOfficeMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: OFFICE_KEY }) });
}

/** The clock, ticking every `ms`. It starts at the server's `now` so SSR and hydration render the same text. */
export function useNow(start: number, ms = 1000) {
  const [now, setNow] = useState(start);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** `14:05:09` in UTC. */
export const utcClock = (ms: number) => new Date(ms).toISOString().slice(11, 19);

export const sol = (v: number | null, signed = false) => (v === null ? DASH : money(v, "sol", { signed }));
export const usd = (v: number | null, signed = false) => (v === null ? DASH : money(v, "usd", { signed }));

/** LLM spend: a run often costs a fraction of a cent, so three decimals under a dollar. */
export const cost = (v: number | null) => (v === null ? DASH : money(v, "usd", { digits: v < 1 ? 3 : 2 }));

export const toneOf = (v: number | null) =>
  v === null || v === 0 ? "text-muted-foreground" : v > 0 ? "text-profit" : "text-loss";

export function Section({
  title,
  action,
  className = "",
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-2.5 rounded-lg bg-card p-3.5 ${className}`}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] whitespace-nowrap text-muted-foreground">
      {children}
    </span>
  );
}

/** A thin bar for a share between 0 and 1. */
export function Meter({ share, className = "bg-brand" }: { share: number; className?: string }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full transition-[width] ${className}`} style={{ width: `${share * 100}%` }} />
    </div>
  );
}
