import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/features/portfolio/money";
import { offsetLabel, useTzOffset } from "@/features/timezone/timezone";
import { type Bar, type TimeframeId, ticks } from "../analytics";
import { compact, signedPct } from "./ui";

const AXIS_WIDE = 58;
const AXIS_NARROW = 52;
const NARROW_BELOW = 520;
const GAP = 8;
const VOLUME_SHARE = 0.27;
const FALLBACK = { w: 772, h: 560 };
const TIME_DEFAULT = 20;
const AXIS_RANGE = [40, 140] as const;
const TIME_RANGE = [16, 60] as const;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));
const MIN_VISIBLE = 15;
const MAX_VISIBLE = 200;
const NEAR_START = 5;
// Touch: a finger that moves less than this is a tap, and one held this long switches from panning to scrubbing.
const TAP_SLOP_PX = 8;
const LONG_PRESS_MS = 350;

const utc = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" });
const timeFmt = utc({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFmt = utc({ month: "short", day: "numeric" });
const longDayFmt = utc({ weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** Midnight bars and daily candles read better as a date than as `00:00`. */
function axisLabel(t: number, tf: TimeframeId, tz: number) {
  t += tz * 60_000;
  const d = new Date(t);
  const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  return tf === "24h" || midnight ? dayFmt.format(t) : timeFmt.format(t);
}

const exact = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 5 });

export interface ChartBar extends Bar {
  /** Volume or fees, whichever the toggle picked. */
  value: number;
}

/** Pixel size of the element given to the returned ref callback, kept current with a ResizeObserver. */
function useSize() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState(FALLBACK);
  useEffect(() => {
    if (!el) return;
    const read = () =>
      setSize({ w: Math.max(200, Math.round(el.clientWidth)), h: Math.max(160, Math.round(el.clientHeight)) });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return { ref: setEl, size };
}

/**
 * Candles and a bar series in one SVG so the axes share a coordinate system. Drag to pan through history
 * (older bars are requested as the left edge nears), scroll to zoom, hover for a tooltip. On touch, tap a candle
 * to pin its tooltip, or hold and drag to scrub. Times follow the timezone setting.
 */
export function CandleChart({
  bars,
  tf,
  price,
  prefix,
  metric,
  onNeedOlder,
  loadingOlder,
}: {
  bars: ChartBar[];
  tf: TimeframeId;
  /** Current pool price in the chart's currency. */
  price: number;
  prefix: string;
  metric: "volume" | "fees";
  onNeedOlder?: () => void;
  loadingOlder?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { ref: boxRef, size } = useSize();
  const tz = useTzOffset();
  const drag = useRef<{ x: number; offset: number } | null>(null);
  const touch = useRef<{
    x: number;
    y: number;
    at: { x: number; y: number };
    moved: boolean;
    scrubbing: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState(60);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [axisW, setAxisW] = useState<number | null>(null);
  const [timeH, setTimeH] = useState(TIME_DEFAULT);
  const axisDrag = useRef<{ x: number; w: number } | null>(null);
  const timeDrag = useRef<{ y: number; h: number } | null>(null);

  const narrow = size.w < NARROW_BELOW;
  const AXIS = axisW ?? (narrow ? AXIS_NARROW : AXIS_WIDE);
  const FONT = narrow ? 9 : 10;
  const W = size.w - AXIS;
  const plotH = size.h - GAP - timeH;
  const VOL_H = Math.round(plotH * VOLUME_SHARE);
  const PRICE_H = plotH - VOL_H;
  const TOTAL_H = size.h;

  const total = bars.length;
  const visible = Math.min(count, total);
  const maxOffset = Math.max(0, total - visible);
  const off = Math.min(offset, maxOffset);
  const endIdx = total - off;
  const startIdx = endIdx - visible;
  const view = bars.slice(startIdx, endIdx);

  useEffect(() => {
    if (total > 0 && startIdx <= NEAR_START) onNeedOlder?.();
  }, [startIdx, total, onNeedOlder]);

  // React's onWheel is passive, so scroll-to-zoom needs a native listener to stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCount((c) => Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, Math.round(c * (e.deltaY > 0 ? 1.15 : 0.87)))));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  if (total === 0) {
    return (
      <div className="flex h-60 items-center justify-center text-xs text-muted-foreground">
        No trades in this range.
      </div>
    );
  }

  const lo = Math.min(...view.map((b) => b.low), price);
  const hi = Math.max(...view.map((b) => b.high), price);
  const pad = (hi - lo || hi || 1) * 0.06;
  const min = lo - pad;
  const max = hi + pad;
  const y = (p: number) => ((max - p) / (max - min)) * PRICE_H;
  const maxValue = Math.max(...view.map((b) => b.value), 1e-12);
  const step = W / view.length;
  const body = Math.max(1, step * 0.7);
  const x = (i: number) => i * step + step / 2;
  const labelEvery = Math.max(1, Math.floor(view.length / 8));

  const hover =
    cursor && !dragging && cursor.x >= 0 && cursor.x < W
      ? Math.min(view.length - 1, Math.floor(cursor.x / step))
      : null;
  const shown = view[hover ?? view.length - 1] as ChartBar;
  const local = shown.t + tz * 60_000;
  const change = shown.open > 0 ? ((shown.close - shown.open) / shown.open) * 100 : 0;
  const up = shown.close >= shown.open;
  const tone = up ? "text-profit" : "text-loss";

  const toSvg = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * (W + AXIS), y: ((e.clientY - box.top) / box.height) * TOTAL_H };
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="num flex flex-wrap items-center gap-x-3 text-[11px]">
        <span className="text-muted-foreground">
          {tf === "24h" ? dayFmt.format(local) : `${dayFmt.format(local)} ${timeFmt.format(local)}`}
        </span>
        {(
          [
            ["O", shown.open],
            ["H", shown.high],
            ["L", shown.low],
            ["C", shown.close],
          ] as const
        ).map(([k, v]) => (
          <span key={k} className={tone}>
            {k} {exact.format(v)}
          </span>
        ))}
        <span className={tone}>{signedPct(change)}</span>
        <span className="text-muted-foreground">
          {metric === "fees" ? "Fees" : "Vol"} {prefix}
          {compact(shown.value)}
        </span>
        <span className="ml-auto text-muted-foreground/70">{loadingOlder ? "Loading older bars…" : ""}</span>
      </div>
      <div ref={boxRef} className="relative min-h-0 flex-1">
        <button
          type="button"
          aria-label="Resize price axis"
          className="absolute inset-y-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none"
          style={{ left: W }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            axisDrag.current = { x: e.clientX, w: AXIS };
          }}
          onPointerMove={(e) => {
            if (axisDrag.current) setAxisW(clamp(axisDrag.current.w - (e.clientX - axisDrag.current.x), AXIS_RANGE));
          }}
          onPointerUp={() => {
            axisDrag.current = null;
          }}
          onDoubleClick={() => setAxisW(null)}
        />
        <button
          type="button"
          aria-label="Resize time axis"
          className="absolute inset-x-0 z-10 h-2 -translate-y-1/2 cursor-row-resize touch-none"
          style={{ top: size.h - timeH }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            timeDrag.current = { y: e.clientY, h: timeH };
          }}
          onPointerMove={(e) => {
            if (timeDrag.current) setTimeH(clamp(timeDrag.current.h - (e.clientY - timeDrag.current.y), TIME_RANGE));
          }}
          onPointerUp={() => {
            timeDrag.current = null;
          }}
          onDoubleClick={() => setTimeH(TIME_DEFAULT)}
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W + AXIS} ${TOTAL_H}`}
          className={`absolute inset-0 h-full w-full touch-pan-y select-none ${dragging ? "cursor-grabbing" : "cursor-crosshair"}`}
          role="img"
          aria-label="Price chart"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = toSvg(e);
            drag.current = { x: p.x, offset: off };
            setDragging(true);
            if (e.pointerType === "mouse") return;
            // A finger pans by default; holding still first turns the drag into a crosshair scrub.
            const t = {
              x: e.clientX,
              y: e.clientY,
              at: p,
              moved: false,
              scrubbing: false,
              timer: setTimeout(() => {
                t.scrubbing = true;
                drag.current = null;
                setDragging(false);
                setCursor(t.at);
              }, LONG_PRESS_MS),
            };
            touch.current = t;
          }}
          onPointerMove={(e) => {
            const p = toSvg(e);
            const t = touch.current;
            if (t) {
              t.at = p;
              if (t.scrubbing) return setCursor(p);
              if (!t.moved && Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP_PX) {
                t.moved = true;
                clearTimeout(t.timer);
                setCursor(null);
              }
            } else setCursor(p);
            if (drag.current) {
              const moved = Math.round((p.x - drag.current.x) / step);
              setOffset(Math.min(maxOffset, Math.max(0, drag.current.offset + moved)));
            }
          }}
          onPointerUp={(e) => {
            const t = touch.current;
            if (t) {
              clearTimeout(t.timer);
              // A tap pins the crosshair on that candle; tapping the same candle again clears it.
              if (!t.moved && !t.scrubbing) {
                const p = toSvg(e);
                setCursor(hover !== null && Math.floor(p.x / step) === hover ? null : p);
              }
              touch.current = null;
            }
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            if (touch.current) clearTimeout(touch.current.timer);
            touch.current = null;
            drag.current = null;
            setDragging(false);
          }}
          // A lifted finger also leaves; only a mouse leaving should hide the crosshair a tap pinned.
          onPointerLeave={(e) => e.pointerType === "mouse" && setCursor(null)}
        >
          {ticks(lo, hi, Math.max(3, Math.round(PRICE_H / 80))).map((t) => (
            <g key={t}>
              <line x1={0} x2={W} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={W + 6} y={y(t) + 3} className="fill-muted-foreground" fontSize={FONT}>
                {formatPrice(t)}
              </text>
            </g>
          ))}
          {view.map((b, i) => {
            const color = b.close >= b.open ? "var(--profit)" : "var(--loss)";
            const h = (b.value / maxValue) * VOL_H;
            return (
              <g key={b.t}>
                <line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={color} strokeWidth={1} />
                <rect
                  x={x(i) - body / 2}
                  y={y(Math.max(b.open, b.close))}
                  width={body}
                  height={Math.max(1, Math.abs(y(b.open) - y(b.close)))}
                  fill={color}
                />
                <rect
                  x={x(i) - body / 2}
                  y={PRICE_H + GAP + VOL_H - h}
                  width={body}
                  height={h}
                  fill={color}
                  opacity={hover === i ? 0.9 : 0.55}
                />
              </g>
            );
          })}
          {off === 0 && (
            <>
              <line
                x1={0}
                x2={W}
                y1={y(price)}
                y2={y(price)}
                stroke="var(--brand)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <rect x={W + 2} y={y(price) - 8} width={AXIS - 4} height={16} rx={3} fill="var(--brand)" />
              <text x={W + 6} y={y(price) + 3.5} fontSize={FONT} fontWeight={600} fill="var(--brand-foreground)">
                {formatPrice(price)}
              </text>
            </>
          )}
          {[0, 0.5, 1].map((f) => (
            <text
              key={f}
              x={W + 6}
              y={PRICE_H + GAP + VOL_H - f * VOL_H + (f === 1 ? 10 : f === 0 ? -2 : 3)}
              className="fill-muted-foreground"
              fontSize={FONT}
            >
              {compact(maxValue * f)}
            </text>
          ))}
          <line x1={0} x2={W} y1={PRICE_H + GAP / 2} y2={PRICE_H + GAP / 2} className="stroke-border" />
          {view.map((b, i) =>
            (i + 1) % labelEvery === 0 ? (
              <text
                key={b.t}
                x={x(i)}
                y={TOTAL_H - 5}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize={FONT}
              >
                {axisLabel(b.t, tf, tz)}
              </text>
            ) : null,
          )}
          {hover !== null && cursor && (
            <g className="pointer-events-none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={0}
                y2={PRICE_H + GAP + VOL_H}
                className="stroke-foreground/25"
                strokeDasharray="2 3"
              />
              {cursor.y >= 0 && cursor.y <= PRICE_H && (
                <>
                  <line
                    x1={0}
                    x2={W}
                    y1={cursor.y}
                    y2={cursor.y}
                    className="stroke-foreground/25"
                    strokeDasharray="2 3"
                  />
                  <rect x={W + 2} y={cursor.y - 8} width={AXIS - 4} height={16} rx={3} className="fill-foreground" />
                  <text x={W + 6} y={cursor.y + 3.5} fontSize={FONT} fontWeight={600} className="fill-background">
                    {formatPrice(max - (cursor.y / PRICE_H) * (max - min))}
                  </text>
                </>
              )}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-3 z-10 w-48 rounded-lg border bg-popover/95 p-2.5 text-[11px] shadow-xl backdrop-blur"
            style={{
              left: `${(x(hover) / (W + AXIS)) * 100}%`,
              transform: hover > view.length / 2 ? "translateX(calc(-100% - 14px))" : "translateX(14px)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{longDayFmt.format(local)}</div>
                <div className="num text-muted-foreground">
                  {timeFmt.format(local)} {offsetLabel(tz)}
                </div>
              </div>
              <span
                className={`num rounded-md px-1.5 py-0.5 font-semibold ${up ? "bg-profit/15" : "bg-loss/15"} ${tone}`}
              >
                {signedPct(change)}
              </span>
            </div>
            <div className="num mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Open</span>
              <span className="text-right">{exact.format(shown.open)}</span>
              <span className="text-muted-foreground">High</span>
              <span className="text-right text-profit">{exact.format(shown.high)}</span>
              <span className="text-muted-foreground">Low</span>
              <span className="text-right text-loss">{exact.format(shown.low)}</span>
              <span className="text-muted-foreground">Close</span>
              <span className={`text-right font-semibold ${tone}`}>{exact.format(shown.close)}</span>
            </div>
            <div className="num mt-2 flex items-center justify-between border-t pt-2">
              <span className="text-muted-foreground">{metric === "fees" ? "Fees" : "Volume"}</span>
              <span className="font-semibold">
                {prefix}
                {compact(shown.value)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
