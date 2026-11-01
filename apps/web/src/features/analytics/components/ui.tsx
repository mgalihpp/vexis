import type { ReactNode } from "react";

export const NA = "-";

const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** `2.86M`, `110.21K`. Used for axes and token amounts where a currency sign would be wrong. */
export const compact = (v: number) => compactFmt.format(v);

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

export function Stat({ label, value, className = "" }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      <span className={`num text-xs font-semibold ${className}`}>{value}</span>
    </div>
  );
}

/** Label, dotted leader, value. */
export function Row({ label, value, className = "" }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex-1 -translate-y-0.5 border-b border-dotted border-border" />
      <span className={`num font-semibold ${className}`}>{value}</span>
    </div>
  );
}
