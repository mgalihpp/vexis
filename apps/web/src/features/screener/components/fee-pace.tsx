import { AnimatedNumber } from "@/components/animated-number";
import { type FeeWindows, feePace, momentum } from "../screener";

const DASH = "—";

export const times = (v: number | null) => (v === null ? DASH : `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}×`);

/**
 * Six bars, 24h ago on the left and the last 30 minutes on the right; a bar above the day's average is lime.
 * `feeTvl` may be a percent or a fraction: the bars and the momentum only compare it against itself.
 */
export function FeePace({ feeTvl }: { feeTvl: FeeWindows }) {
  const pace = feePace(feeTvl);
  const average = feeTvl["24h"] / 24;
  const peak = Math.max(...pace);
  const m = momentum(feeTvl);
  const tone =
    m === null ? "text-muted-foreground" : m >= 1.25 ? "text-profit" : m < 0.75 ? "text-muted-foreground" : "";
  return (
    <div
      className="relative z-10 flex items-end gap-2"
      title={m === null ? "No fees in the last 24h" : `Last hour is ${times(m)} the 24h hourly average`}
    >
      <span className="flex h-5 items-end gap-0.5" aria-hidden="true">
        {pace.map((rate, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: six fixed stretches of time, never reordered
            key={i}
            className={`w-1.5 rounded-[1px] ${rate > average ? "bg-brand" : "bg-foreground/25"}`}
            style={{ height: `${peak > 0 ? Math.max(10, (rate / peak) * 100) : 10}%` }}
          />
        ))}
      </span>
      <span className={`num text-[11px] font-medium ${tone}`}>
        {m === null || !Number.isFinite(m) ? DASH : <AnimatedNumber value={m} format={times} />}
      </span>
    </div>
  );
}
