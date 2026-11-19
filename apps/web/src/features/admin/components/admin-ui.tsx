// Pieces the admin tabs share: stat cards, the card with a tab bar, pills, the pager, confirmations and the mutation
// hook. The look follows the agents fleet page.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PAGE_SIZE } from "@vexis/shared/admin";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, InfoIcon } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { InfoTip } from "@/components/info-tip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MENU_TRIGGER } from "@/features/agents/components/agent-layout";
import { PoolFilter } from "@/features/portfolio/components/table-controls";
import type { Tone } from "../admin";

export { MENU_TRIGGER };

const TONE_VARIANT = {
  profit: "profit",
  danger: "destructive",
  warning: "warning",
  muted: "secondary",
  brand: "brand",
} as const;

export function Pill({ tone, children }: { tone: Tone | "brand"; children: ReactNode }) {
  return (
    <Badge variant={TONE_VARIANT[tone]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </Badge>
  );
}

function StatLabel({ label, info }: { label: string; info?: string }) {
  return (
    <span className="flex items-center gap-1.25 text-xs text-muted-foreground">
      {label}
      {info && (
        <InfoTip aria-label={info} content={info} contentClassName="max-w-52">
          <InfoIcon className="size-2.75 text-muted-foreground" />
        </InfoTip>
      )}
    </span>
  );
}

export function Stat({
  label,
  info,
  value,
  tone = "",
  chip,
  gauge,
  children,
}: {
  label: string;
  info?: string;
  value: ReactNode;
  tone?: string;
  chip?: ReactNode;
  gauge?: ReactNode;
  children?: ReactNode;
}) {
  if (gauge) {
    return (
      <div className="flex h-[7.5rem] items-center justify-between gap-1.5 rounded-lg bg-card px-3.25">
        <div className="min-w-0">
          <StatLabel label={label} info={info} />
          <div className={`mt-2.5 truncate text-[1.5rem] leading-none font-bold tabular-nums ${tone}`}>{value}</div>
        </div>
        {gauge}
      </div>
    );
  }
  return (
    <div className="flex h-[7.5rem] flex-col justify-center gap-2.5 rounded-lg bg-card px-3.25">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <StatLabel label={label} info={info} />
        {chip}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className={`truncate text-[1.5rem] leading-none font-bold tabular-nums ${tone}`}>{value}</div>
        {children}
      </div>
    </div>
  );
}

/** Semicircle arc meter from 180° to 0°, like the portfolio stat cards. */
export function Gauge({
  good,
  bad,
  goodLabel,
  badLabel,
  goodStroke = "stroke-profit",
  badStroke = "stroke-loss",
  goodText = "text-profit",
  badText = "text-loss",
}: {
  good: number;
  bad: number;
  goodLabel?: ReactNode;
  badLabel?: ReactNode;
  goodStroke?: string;
  badStroke?: string;
  goodText?: string;
  badText?: string;
}) {
  const total = good + bad;
  const share = total > 0 ? Math.min(1, Math.max(0, good / total)) : 0;
  const r = 46;
  const point = (t: number) => {
    const a = Math.PI * (1 - t);
    return `${50 + r * Math.cos(a)} ${54 - r * Math.sin(a)}`;
  };
  const arc = (from: number, to: number) => `M ${point(from)} A ${r} ${r} 0 0 1 ${point(to)}`;
  const gap = total > 0 && share > 0 && share < 1 ? 0.025 : 0;
  return (
    <div className="w-[6rem] shrink-0">
      <svg viewBox="0 0 100 60" className="w-full" aria-hidden="true">
        <path d={arc(0, 1)} className="fill-none stroke-muted" strokeWidth="9" />
        {share > 0 && <path d={arc(0, share - gap)} className={`fill-none ${goodStroke}`} strokeWidth="9" />}
        {share < 1 && total > 0 && (
          <path d={arc(share + gap, 1)} className={`fill-none ${badStroke}`} strokeWidth="9" />
        )}
      </svg>
      <div className="-mt-0.75 flex justify-between gap-1 text-[0.625rem] tabular-nums">
        <span className={`truncate ${goodText}`}>{goodLabel ?? good}</span>
        <span className={`truncate ${badText}`}>{badLabel ?? bad}</span>
      </div>
    </div>
  );
}

export function LabeledField({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 text-xs font-medium">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

export function Chip({ children, on = false }: { children: ReactNode; on?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[0.65rem] tabular-nums ${on ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}
    >
      {children}
    </span>
  );
}

/** A thin used/total bar with its two captions. */
export function Meter({ used, total, className = "bg-brand" }: { used: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={`h-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Page({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">{title}</h1>
        {action}
      </header>
      {children}
    </div>
  );
}

export const StatGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{children}</div>
);

/** The card with a tab bar on top and optional tools on its right. */
export function TabCard<T extends string>({
  label,
  tabs,
  active,
  onChange,
  tools,
  children,
}: {
  label: string;
  tabs: readonly { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  tools?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4">
        <div role="tablist" aria-label={label} className="-mb-px flex gap-5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              onClick={() => onChange(t.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 py-3.5 text-sm font-medium transition-colors ${
                active === t.id
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count !== undefined && <Chip on={active === t.id}>{t.count}</Chip>}
            </button>
          ))}
        </div>
        {tools && <div className="flex w-full items-center gap-2 pb-3 sm:w-auto sm:py-2.5">{tools}</div>}
      </div>
      {children}
    </section>
  );
}

export function Pager({ total, page, onPage }: { total: number; page: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-xs">
      <span className="text-muted-foreground tabular-nums">
        {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={MENU_TRIGGER}
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={MENU_TRIGGER}
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Who({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[0.65rem] font-semibold text-muted-foreground uppercase"
      >
        {title.slice(0, 2)}
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium">{title}</div>
        {sub && <div className="truncate text-[0.7rem] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

export const Count = ({ n }: { n: number }) => (
  <span
    className={`inline-flex h-6 min-w-7 items-center justify-center rounded-md bg-muted px-1.5 font-medium tabular-nums ${n === 0 ? "text-muted-foreground" : ""}`}
  >
    {n}
  </span>
);

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="py-12 text-center text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

/** `in 6 days` for a time ahead of `now`, `2 days ago` behind it, like `timeAgo`. */
export function relative(ms: number, now: number) {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const unit = abs >= 86_400_000 ? [86_400_000, "d"] : abs >= 3_600_000 ? [3_600_000, "h"] : [60_000, "m"];
  const n = Math.max(1, Math.round(abs / (unit[0] as number)));
  return diff >= 0 ? `in ${n}${unit[1]}` : `${n}${unit[1]} ago`;
}

export function useAdminAction<A, R>(fn: (arg: A) => Promise<R>, onDone?: (result: R) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: A) => fn(arg),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      onDone?.(result);
    },
    onError: (error) => toast.error(error instanceof Error && error.message ? error.message : "Something went wrong"),
  });
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  pending,
  onConfirm,
  requireText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  action: string;
  pending?: boolean;
  onConfirm: () => void;
  /** The phrase to type before the action unlocks. */
  requireText?: string;
}) {
  const [typed, setTyped] = useState("");
  const locked = requireText !== undefined && typed !== requireText;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireText !== undefined && (
          <LabeledField label={`Type ${requireText}`}>
            {(id) => (
              <Input
                id={id}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            )}
          </LabeledField>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={locked || pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => toast.success("Copied"),
          () => toast.error("Copy failed"),
        )
      }
    >
      <CopyIcon />
    </Button>
  );
}

export const copy = (text: string) =>
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );

/** A search box that keeps what you type and tells the URL once you pause, so a slow load never eats keystrokes. */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return (
    <PoolFilter
      value={text}
      placeholder={placeholder}
      onChange={(next) => {
        setText(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(next), 300);
      }}
    />
  );
}
