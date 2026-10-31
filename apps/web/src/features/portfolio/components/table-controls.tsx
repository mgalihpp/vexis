import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  SearchIcon,
  TableIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { TableHead } from "@/components/ui/table";

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" };

export function sortBy<T, K extends string>(rows: T[], value: (row: T, key: K) => number, { key, dir }: Sort<K>) {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row) => ({ row, v: value(row, key) }))
    .sort((a, b) => sign * (a.v < b.v ? -1 : a.v > b.v ? 1 : 0))
    .map((x) => x.row);
}

export function SortHead<K extends string>({
  id,
  sort,
  onSort,
  className = "",
  children,
}: {
  id: K;
  sort: Sort<K>;
  onSort: (sort: Sort<K>) => void;
  className?: string;
  children: ReactNode;
}) {
  const active = sort.key === id;
  const Icon = !active ? ArrowUpDownIcon : sort.dir === "desc" ? ArrowDownIcon : ArrowUpIcon;
  return (
    <TableHead
      aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : undefined}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort({ key: id, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
        className={`inline-flex items-center gap-0.75 hover:text-foreground ${active ? "text-brand" : ""}`}
      >
        {children}
        <Icon className="size-2.75" />
      </button>
    </TableHead>
  );
}

export function Expander({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
      className="rounded p-0.75 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ChevronRightIcon className={`size-3.25 transition-transform ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

export function PoolFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative w-full max-w-[16rem]">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.25 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter by pool name"
        aria-label="Filter by pool name"
        className="h-7 w-full rounded-md border bg-card pr-2 pl-8 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring"
      />
    </label>
  );
}

const VIEWS = [
  { value: "table", label: "Table view", Icon: TableIcon },
  { value: "grid", label: "Grid view", Icon: LayoutGridIcon },
] as const;

export type View = (typeof VIEWS)[number]["value"];

export function ViewToggle({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <>
      {VIEWS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={`flex size-6 items-center justify-center rounded-md border transition-colors ${
            view === value
              ? "border-brand bg-brand text-brand-foreground"
              : "text-foreground/70 hover:bg-muted hover:text-foreground"
          }`}
        >
          <Icon className="size-3.25" />
        </button>
      ))}
    </>
  );
}
