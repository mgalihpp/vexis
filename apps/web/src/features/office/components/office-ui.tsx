import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { money } from "@/features/portfolio/money";
import { OFFICE_KEY } from "../office.queries";

export const DASH = "—";

/** Every office write refreshes everything under ["office"]. */
export function useOfficeMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: V) => fn(v), onSuccess: () => qc.invalidateQueries({ queryKey: OFFICE_KEY }) });
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

/** LLM spend: a run often costs a fraction of a cent, so three decimals under a dollar; a free run reads $0.00. */
export const cost = (v: number | null) => (v === null ? DASH : money(v, "usd", { digits: v > 0 && v < 1 ? 3 : 2 }));

export const toneOf = (v: number | null) =>
  v === null || v === 0 ? "text-muted-foreground" : v > 0 ? "text-profit" : "text-loss";

/** A sidebar panel with a title and an optional action on the right. */
export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="shrink-0 rounded-lg bg-card p-3.25">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading text-xs leading-snug font-medium">{title}</h3>
        {action}
      </div>
      <div className="mt-2.5 flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/** The empty state of a panel: an icon, one line, and an optional hint or action. */
export function PanelEmpty({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {hint && <EmptyDescription>{hint}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
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
