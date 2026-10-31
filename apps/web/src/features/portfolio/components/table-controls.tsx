import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
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

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}

const count = new Intl.NumberFormat("en-US");

export function Pagination({
  total,
  page,
  pages,
  pageSize,
  sizes,
  onPage,
  onPageSize,
}: {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  sizes: readonly number[];
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background px-3 py-2 text-xs">
      <label className="flex items-center gap-2">
        Rows per page
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-7 rounded-md border bg-background px-2 outline-none focus-visible:border-ring"
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {count.format(first)}-{count.format(last)} <span className="text-muted-foreground">of</span>{" "}
          {count.format(total)}
        </span>
        <div className="flex items-center gap-1">
          <PageButton label="First page" disabled={page === 0} onClick={() => onPage(0)}>
            <ChevronsLeftIcon className="size-3.5" />
          </PageButton>
          <PageButton label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}>
            <ChevronLeftIcon className="size-3.5" />
          </PageButton>
          <PageButton label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
            <ChevronRightIcon className="size-3.5" />
          </PageButton>
          <PageButton label="Last page" disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}>
            <ChevronsRightIcon className="size-3.5" />
          </PageButton>
        </div>
      </div>
    </div>
  );
}
