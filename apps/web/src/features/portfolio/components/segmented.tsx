export function Segmented<T extends string>({
  value,
  options,
  onChange,
  variant = "brand",
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  variant?: "brand" | "muted";
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5 text-[0.8125rem] font-medium">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-[0.3125rem] px-2.5 py-1 transition-colors ${
              active
                ? variant === "brand"
                  ? "bg-brand text-brand-foreground"
                  : "bg-muted text-foreground"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const METRIC_OPTIONS = [
  { value: "fees", label: "Only fees" },
  { value: "pnl", label: "Total P&L" },
] as const;
