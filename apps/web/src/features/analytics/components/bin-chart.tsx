import { type PointerEvent, useRef, useState } from "react";
import { TIP_CLASS } from "@/components/info-tip";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { compactSol, compactUsd, formatPrice, pct } from "@/features/portfolio/money";
import { type DistributionBar, ratio } from "../analytics";

/**
 * The stacked bin bars of the pool's Liquidity Distribution: token X (brand) over token Y (SOL color) per bar, a
 * marker with the pool price on the active bin, a tooltip per bar and four price labels. The pool panel and every
 * tracked position draw it, so the two look the same.
 */
export function BinChart({
  bars,
  x,
  y,
  poolPrice,
  solUsd = null,
}: {
  bars: DistributionBar[];
  x: string;
  y: string;
  /** Token X priced in token Y. */
  poolPrice: number;
  /** When known, the tooltip also shows the bar's value in SOL. */
  solUsd?: number | null;
}) {
  const peak = Math.max(...bars.map((b) => b.height), 1e-12);
  const first = bars[0];
  const last = bars[bars.length - 1];
  const labels = first && last ? [0, 1, 2, 3].map((i) => first.price + ((last.lastPrice - first.price) * i) / 3) : [];
  const at = bars.findIndex((b) => b.active) / Math.max(1, bars.length - 1);
  const [selected, setSelected] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const sel = selected === null ? undefined : bars[selected];
  // The bar under the pointer, from its x position, so a finger can drag across bars without lifting.
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - rect.left) / rect.width) * bars.length);
    setSelected(Math.min(bars.length - 1, Math.max(0, i)));
  };
  return (
    <>
      <Popover open={sel !== undefined} onOpenChange={(open) => !open && setSelected(null)}>
        <div
          ref={chartRef}
          className="mt-9 flex h-28 touch-pan-y items-end gap-0.5"
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            pick(e);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && pick(e)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setSelected(null)}
        >
          {bars.map((b, i) => {
            const bar = (
              <div
                key={b.id}
                className={`relative flex h-full flex-1 flex-col justify-end transition-opacity ${
                  sel && i !== selected ? "opacity-50" : ""
                }`}
              >
                {b.active && (
                  <div className="pointer-events-none absolute -top-9 bottom-0 left-1/2 z-10 -translate-x-1/2 border-l-2 border-foreground">
                    <div
                      className={`absolute top-0 flex flex-col items-center rounded-md bg-popover px-2.5 py-1 text-[11px] whitespace-nowrap shadow-md ring-1 ring-border ${
                        at < 0.25 ? "left-0 items-start" : at > 0.75 ? "right-0 items-end" : "-translate-x-1/2"
                      }`}
                    >
                      <span className="text-muted-foreground">Pool Price</span>
                      <span className="num font-semibold">
                        {formatPrice(poolPrice)} {y}/{x}
                      </span>
                    </div>
                  </div>
                )}
                <div
                  className="flex flex-col overflow-hidden rounded-t-sm"
                  style={{ height: `${Math.max(1, (b.height / peak) * 75)}%` }}
                >
                  {/* Shares, not raw USD: flex-grow summing under 1 leaves the bottom of the bar empty. */}
                  <div className="bg-brand" style={{ flex: ratio(b.xUsd, b.xUsd + b.yUsd) }} />
                  <div style={{ flex: ratio(b.yUsd, b.xUsd + b.yUsd), background: "var(--sol)" }} />
                </div>
              </div>
            );
            return i === selected ? (
              <PopoverAnchor key={b.id} asChild>
                {bar}
              </PopoverAnchor>
            ) : (
              bar
            );
          })}
        </div>
        {sel && (
          <PopoverContent
            side="top"
            className={`${TIP_CLASS} w-48 flex-col items-stretch p-2.5 text-[11px]`}
            onOpenAutoFocus={(e) => e.preventDefault()}
            // A tap on another bar moves the selection; only a tap off the chart closes it.
            onPointerDownOutside={(e) => chartRef.current?.contains(e.target as Node) && e.preventDefault()}
          >
            <div className="num text-muted-foreground">
              {sel.lastId === sel.id
                ? `Bin ${sel.id} · ${formatPrice(sel.price)}`
                : `Bins ${sel.id} to ${sel.lastId} · ${formatPrice(sel.price)} to ${formatPrice(sel.lastPrice)}`}
            </div>
            <div className="num mt-0.5 text-sm font-semibold">{compactUsd(sel.xUsd + sel.yUsd)}</div>
            {solUsd ? (
              <div className="num text-muted-foreground">{compactSol((sel.xUsd + sel.yUsd) / solUsd)}</div>
            ) : null}
            <div className="mt-2 flex flex-col gap-1 border-t pt-2">
              {(
                [
                  [x, sel.xUsd, "var(--brand)"],
                  [y, sel.yUsd, "var(--sol)"],
                ] as const
              ).map(([symbol, usd, color]) => (
                <div key={symbol} className="num flex items-center gap-1.5">
                  <i className="size-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-muted-foreground">{symbol}</span>
                  <span className="ml-auto font-semibold">{compactUsd(usd)}</span>
                  <span className="w-9 text-right text-muted-foreground">
                    {pct(ratio(usd, sel.xUsd + sel.yUsd), 0)}
                  </span>
                </div>
              ))}
            </div>
          </PopoverContent>
        )}
      </Popover>
      <div className="num flex justify-between text-[10px] text-muted-foreground">
        {labels.map((l) => (
          <span key={l}>{formatPrice(l)}</span>
        ))}
      </div>
    </>
  );
}
