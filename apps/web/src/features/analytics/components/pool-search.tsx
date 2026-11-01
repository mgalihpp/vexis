import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { compactUsd } from "@/features/portfolio/money";
import { findPools } from "../analytics.functions";
import type { PoolSearchHit } from "../analytics.types";

/** Text box with a leading search icon, shared by the desktop popover and the phone sheet. */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground focus-within:ring-1 focus-within:ring-ring">
      <SearchIcon className="size-3.5 shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

/** Debounced pair search; empty until there is a query and `enabled`. */
export function usePoolHits(query: string, enabled: boolean) {
  const [hits, setHits] = useState<PoolSearchHit[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!enabled || !q) return setHits([]);
    let live = true;
    const timer = setTimeout(() => {
      findPools({ data: { query: q } })
        .then((r) => live && setHits(r))
        .catch(() => live && setHits([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [enabled, query]);
  return hits;
}

export function PoolHitList({ query, hits, onSelect }: { query: string; hits: PoolSearchHit[]; onSelect: () => void }) {
  return (
    <ul className="max-h-72 overflow-auto">
      {hits.map((h) => (
        <li key={h.address}>
          <Link
            to="/analytics"
            search={(prev) => ({ ...prev, pool: h.address })}
            onClick={onSelect}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
          >
            <span className="truncate font-medium">
              {h.name} <span className="text-muted-foreground">bin {h.binStep}</span>
            </span>
            <span className="num shrink-0 text-[11px] text-muted-foreground">
              TVL {compactUsd(h.tvl)}, Vol {compactUsd(h.volume24h)}
            </span>
          </Link>
        </li>
      ))}
      {query.trim() && hits.length === 0 && (
        <li className="px-2 py-1.5 text-xs text-muted-foreground">No pools found.</li>
      )}
    </ul>
  );
}
