import type { ReactNode } from "react";

// iOS-style inset grouped list, used by the settings and notifications dialogs.

export function Group({
  title,
  footer,
  error = false,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  /** Outlines the group and its footer in red, for a setting that cannot work as set. */
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && (
        <h3 className="px-3 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      )}
      <div
        className={`divide-y divide-border/60 overflow-hidden rounded-xl bg-muted/50 ring-1 ${error ? "ring-loss" : "ring-foreground/5"}`}
      >
        {children}
      </div>
      {footer && (
        <p className={`px-3 text-[0.65rem] leading-relaxed ${error ? "text-loss" : "text-muted-foreground"}`}>
          {footer}
        </p>
      )}
    </section>
  );
}

export function Row({
  icon,
  label,
  description,
  onClick,
  children,
}: {
  icon?: ReactNode;
  label: ReactNode;
  description?: ReactNode;
  /** Makes the whole row a button, like an iOS row that opens another page. */
  onClick?: () => void;
  children?: ReactNode;
}) {
  const content = (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs font-medium">{label}</span>
        {description && <span className="text-[0.65rem] text-muted-foreground">{description}</span>}
      </span>
      {children}
    </>
  );
  const className = "flex min-h-11 w-full items-center gap-3 px-3 py-2";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} text-left active:bg-foreground/[0.06]`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** A rounded square icon tile, like the ones beside iOS settings rows. */
export function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.08] text-foreground [&>svg]:size-3.5">
      {children}
    </span>
  );
}

/** iOS segmented control: the selected segment is a raised pill on a sunken track. */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  fill = false,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  /** Stretch to the container's width with equal segments, as a tab bar. */
  fill?: boolean;
}) {
  return (
    <div className={`${fill ? "flex w-full" : "inline-flex shrink-0"} rounded-lg bg-foreground/[0.07] p-0.5`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1 font-medium ${fill ? "flex-1 text-xs" : "text-[0.65rem]"} transition-all [&>svg]:size-3 ${
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
