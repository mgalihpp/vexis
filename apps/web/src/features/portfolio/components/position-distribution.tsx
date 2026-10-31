import { compactUsd, formatPrice } from "../money";
import { type ActivePool, type ActivePosition, type BinSide, binLadder, binSpan, fdvAt } from "../portfolio";

const SIDE: Record<BinSide, string> = {
  y: "bg-foreground/70",
  active: "bg-linear-to-r from-foreground/70 to-brand",
  x: "bg-brand",
};

/** The positions' bins from min to max price: token Y below the active bin, token X above. */
export function Distribution({
  pool,
  positions,
  className = "w-50",
}: {
  pool: ActivePool;
  positions: ActivePosition[];
  className?: string;
}) {
  const range = binSpan(positions);
  if (!range || !pool.price) return <span className="text-muted-foreground">—</span>;
  const bins = binLadder(range, pool);
  const active = bins.findIndex((b) => b.side === "active");
  const tick = ((active + 0.5) / bins.length) * 100;
  const low = fdvAt(pool, range.minPrice);
  const high = fdvAt(pool, range.maxPrice);
  return (
    <div className={`text-[0.625rem] tabular-nums ${className}`}>
      <div className="flex justify-between font-medium">
        <span>{low !== null && compactUsd(low)}</span>
        <span>{high !== null && compactUsd(high)}</span>
      </div>
      <div className={`relative mt-2.5 flex h-4.5 text-[0.6875rem] ${bins.length <= 60 ? "gap-px" : ""}`}>
        {bins.map((b) => (
          <div key={b.bin} title={formatPrice(b.price)} className={`h-full flex-1 rounded-[0.05rem] ${SIDE[b.side]}`} />
        ))}
        {active >= 0 && (
          <>
            <div className="absolute -top-1.5 bottom-0 w-px bg-foreground" style={{ left: `${tick}%` }} />
            {/* The label sits on the bars beside the tick, on whichever side has more room. */}
            <span
              className={`absolute bottom-0 rounded-sm bg-card px-0.5 font-semibold leading-tight ${tick > 50 ? "-translate-x-full" : ""}`}
              style={{ left: `calc(${tick}% ${tick > 50 ? "-" : "+"} 0.1rem)` }}
            >
              {formatPrice(pool.price)}
            </span>
          </>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.6875rem] font-medium text-foreground/80">
        <span>{formatPrice(range.minPrice)}</span>
        <span>{formatPrice(range.maxPrice)}</span>
      </div>
    </div>
  );
}
