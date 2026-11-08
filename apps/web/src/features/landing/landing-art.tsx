import { Eye, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// The Vexis mark, traced from public/logo.png.
const MARK =
  "M4 4 L166 4 Q186 4 176 20 L92 158 Q88.5 163.5 85 158 L59 119 L84 119 L139 34 L16 34 Z M26 58 L97 58 L71 94 L46 94 Z";

export function BrandMark() {
  return (
    <span className="vx-brandmark">
      <span className="vx-logo">
        <img src="/logo.png" alt="" />
      </span>
      VEXIS
    </span>
  );
}

const HERO_LINE =
  "M0 330 C6.7 323.7 27.0 297.0 40 292 C53.0 287.0 64.7 307.0 78 300 C91.3 293.0 108.0 255.3 120 250 C132.0 244.7 137.5 272.7 150 268 C162.5 263.3 183.0 227.3 195 222 C207.0 216.7 209.8 246.7 222 236 C234.2 225.3 254.2 163.2 268 158 C281.8 152.8 291.3 189.2 305 205 C318.7 220.8 335.5 251.3 350 253 C364.5 254.7 380.0 218.5 392 215 C404.0 211.5 410.3 235.2 422 232 C433.7 228.8 449.8 206.0 462 196 C474.2 186.0 484.0 185.0 495 172 C506.0 159.0 516.8 140.3 528 118 C539.2 95.7 549.3 36.3 562 38 C574.7 39.7 591.0 119.0 604 128 C617.0 137.0 625.7 101.7 640 92 C654.3 82.3 681.7 73.7 690 70";

export function HeroChart() {
  return (
    <svg className="vx-hero-chart" viewBox="0 0 690 360" preserveAspectRatio="none" aria-hidden="true" data-reveal="">
      <defs>
        <linearGradient id="vxhf" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#baf448" stopOpacity=".12" />
          <stop offset=".75" stopColor="#baf448" stopOpacity=".02" />
          <stop offset="1" stopColor="#baf448" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vxhs" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#baf448" stopOpacity="0" />
          <stop offset=".2" stopColor="#baf448" stopOpacity=".18" />
          <stop offset=".85" stopColor="#baf448" stopOpacity=".2" />
          <stop offset="1" stopColor="#baf448" stopOpacity=".05" />
        </linearGradient>
      </defs>
      <path d={`${HERO_LINE} L690 360 L0 360 Z`} fill="url(#vxhf)" />
      <path d={HERO_LINE} fill="none" stroke="url(#vxhs)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BigMark() {
  return (
    <div className="logo-big-banner vx-big-logo" data-reveal="">
      <svg viewBox="-34 -30 248 232" role="img" aria-label="Vexis">
        <defs>
          <linearGradient id="vxmf" x1="10" y1="-60" x2="95" y2="168" gradientUnits="userSpaceOnUse">
            <stop stopColor="#baf448" />
            <stop offset=".45" stopColor="#5f8a22" />
            <stop offset="1" stopColor="#0b1404" />
          </linearGradient>
          <linearGradient id="vxms" x1="30" y1="-10" x2="95" y2="165" gradientUnits="userSpaceOnUse">
            <stop stopColor="#d9ff8f" stopOpacity=".9" />
            <stop offset="1" stopColor="#1c2a0a" stopOpacity=".6" />
          </linearGradient>
          <filter
            id="vxmsh"
            x="-34"
            y="-30"
            width="248"
            height="232"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feOffset in="SourceAlpha" dy="1" />
            <feGaussianBlur stdDeviation="14" />
            <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0" />
            <feBlend in="SourceGraphic" />
          </filter>
        </defs>
        <g filter="url(#vxmsh)">
          <path d={MARK} fill="url(#vxmf)" fillRule="evenodd" />
          <path d={MARK} fill="none" stroke="url(#vxms)" strokeWidth=".8" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}

// A sample month in SOL, one entry per day; null is a day with no closes.
const MONTH: (number | null)[] = [
  0.42,
  0.18,
  -0.12,
  0.65,
  0.31,
  null,
  0.09,
  0.77,
  1.12,
  -0.34,
  0.25,
  0.58,
  null,
  0.14,
  0.96,
  2.48,
  -0.21,
  0.44,
  0.37,
  0.62,
  null,
  0.29,
  -0.08,
  0.81,
  1.35,
  0.48,
  0.16,
  -0.45,
  0.52,
  0.71,
];
const SAMPLE_SOL_USD = 166;
const known = MONTH.filter((v) => v !== null);
const BEST = Math.max(...known);
const MONTH_TOTAL = known.reduce((a, b) => a + b, 0);

/** The month as the shareable PnL card the app renders, with each day as one tick along the bottom. */
export function PnlCard() {
  return (
    <div className="vx-pnl-stage" role="img" aria-label="Shareable monthly PnL card, sample">
      <div className="vx-pnl vx-pnl-back" />
      <div className="vx-pnl">
        <div className="vx-pnl-top">
          <span className="vx-pnl-brand">
            <svg viewBox="-10 -10 200 184" aria-hidden="true">
              <path d={MARK} fill="currentColor" fillRule="evenodd" />
            </svg>
            VEXIS
          </span>
          <span>Nov 2026</span>
        </div>
        <span className="vx-pnl-label">Monthly PnL</span>
        <b className="vx-pnl-sol vx-num">+{MONTH_TOTAL.toFixed(2)} SOL</b>
        <span className="vx-pnl-usd vx-num">${Math.round(MONTH_TOTAL * SAMPLE_SOL_USD).toLocaleString("en-US")}</span>
        <div className="vx-pnl-days">
          {MONTH.map((v, i) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: day of the month
              key={i}
              className={cn(v === null && "off", v !== null && v < 0 && "loss")}
              style={{ height: `${v === null ? 8 : 18 + 82 * (Math.abs(v) / BEST)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Sample liquidity per bin, in percent of the fullest, around the active bin (index 14).
const BINS = [
  14, 16, 18, 22, 27, 33, 38, 45, 53, 56, 64, 71, 76, 88, 100, 81, 96, 84, 78, 65, 58, 51, 44, 34, 28, 23, 18, 15, 12,
];
const ACTIVE = 14;
// Sample hourly closes for the candles, oldest first.
const CLOSES = [
  3.28, 3.31, 3.29, 3.35, 3.38, 3.36, 3.42, 3.4, 3.47, 3.45, 3.52, 3.49, 3.44, 3.46, 3.39, 3.41, 3.36, 3.38, 3.34, 3.37,
  3.4, 3.38, 3.41,
];

/** A miniature of the Analytics page, cropped by the card the way the phone is. */
export function AnalyticsWindow() {
  const lo = Math.min(...CLOSES) - 0.04;
  const hi = Math.max(...CLOSES) + 0.04;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="vx-window" role="img" aria-label="The Analytics page for a sample JUP-SOL pool">
      <div className="vx-app">
        <div className="vx-app-nav">
          <svg viewBox="-10 -10 200 184" aria-hidden="true">
            <path d={MARK} fill="currentColor" fillRule="evenodd" />
          </svg>
          <b>Vexis</b>
          <span>Portfolio</span>
          <span className="on">Analytics</span>
          <span>Agents</span>
        </div>
        <div className="vx-app-body">
          <div className="vx-app-col">
            <div className="vx-app-panel">
              <div className="vx-app-pair">
                <span className="vx-app-tokens">
                  <img src="/brands/jupiter.png" alt="" />
                  <img src="/Solana_logo.png" alt="" />
                </span>
                <span>
                  <b>JUP-SOL</b>
                  <small>Fee: 0.20% | Bin Step: 20</small>
                </span>
              </div>
              <div className="vx-app-stats">
                <span>
                  <small>Current Pool Price</small>
                  <b className="vx-num">0.003412</b>
                </span>
                <span>
                  <small>Total Value Locked</small>
                  <b className="vx-num">$4.21M</b>
                </span>
              </div>
            </div>
            <div className="vx-app-panel">
              <b className="vx-app-title">Liquidity Distribution</b>
              <div className="vx-app-legend">
                <span className="x">JUP</span>
                <span className="y">SOL</span>
              </div>
              <div className="vx-app-bins">
                {BINS.map((h, i) => (
                  <i
                    // biome-ignore lint/suspicious/noArrayIndexKey: bins are positional
                    key={i}
                    className={i < ACTIVE ? "y" : i > ACTIVE ? "x" : "a"}
                    style={{ height: `${h * 0.75}%` }}
                  >
                    {i === ACTIVE && (
                      <span className="vx-app-pool">
                        <small>Pool Price</small>
                        <b className="vx-num">0.003412 SOL/JUP</b>
                      </span>
                    )}
                  </i>
                ))}
              </div>
              <div className="vx-app-axis vx-num">
                <span>0.00318</span>
                <span>0.00333</span>
                <span>0.00349</span>
                <span>0.00365</span>
              </div>
            </div>
          </div>
          <div className="vx-app-col">
            <div className="vx-app-panel">
              <div className="vx-app-stats">
                <span>
                  <small>24h Volume</small>
                  <b className="vx-num big">$8.71M</b>
                </span>
                <span>
                  <small>24h Vol / TVL</small>
                  <b className="vx-num">2.07x</b>
                </span>
              </div>
            </div>
            <div className="vx-app-panel">
              <b className="vx-app-title">Volume Chart</b>
              <svg className="vx-app-candles" viewBox="0 0 230 100" preserveAspectRatio="none" aria-hidden="true">
                {CLOSES.slice(1).map((c, i) => {
                  const o = CLOSES[i] ?? c;
                  const up = c >= o;
                  const x = 6 + i * 10;
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: candles are positional
                    <g key={i} className={up ? "up" : "down"}>
                      <line x1={x} x2={x} y1={y(Math.max(o, c) + 0.02)} y2={y(Math.min(o, c) - 0.02)} />
                      <rect x={x - 3} width="6" y={y(Math.max(o, c))} height={Math.max(1.5, Math.abs(y(o) - y(c)))} />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const NOTIFS = [
  { from: "Vexis alerts", at: "now", title: "Volume spike · JUP-SOL", text: "8.8× the usual pace in the last minute" },
  {
    from: "Vexis rebalance",
    at: "4m ago",
    title: "Back in range · SOL-USDC",
    text: "Re-centered, 0.42 SOL in fees compounded",
  },
];

export function AlertPhone() {
  return (
    <div className="vx-phone" role="img" aria-label="Phone notifications, sample">
      <div className="vx-notifs">
        {NOTIFS.map((n) => (
          <div key={n.title} className="vx-notif">
            <span className="vx-notif-icon">
              <svg viewBox="-10 -10 200 184" aria-hidden="true">
                <path d={MARK} fill="#0b0b0b" fillRule="evenodd" />
              </svg>
            </span>
            <span className="vx-notif-body">
              <span className="vx-notif-top">
                <b>{n.from}</b>
                <span>{n.at}</span>
              </span>
              <b className="vx-notif-title">{n.title}</b>
              <span className="vx-notif-text">{n.text}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// [cx, cy, r, delay s, opacity]
const STARS = [
  [573, 163, 1.4, 3.8, 0.66],
  [849, 6, 1.1, 3.1, 0.39],
  [48, 35, 1.1, 1.9, 0.39],
  [500, 126, 0.9, 2.9, 0.47],
  [168, 191, 1.1, 0.6, 0.69],
  [128, 136, 0.9, 0.5, 0.78],
  [5, 170, 0.9, 3.5, 0.41],
  [885, 119, 1.4, 2.5, 0.35],
  [891, 43, 1.1, 1.2, 0.45],
  [153, 32, 0.9, 1.3, 0.7],
  [539, 131, 1.4, 1.4, 0.42],
  [753, 106, 1.1, 0.7, 0.51],
  [162, 56, 0.9, 3.8, 0.45],
  [372, 121, 1.1, 1.5, 0.57],
  [8, 10, 0.9, 2.5, 0.77],
  [109, 54, 1.1, 1.4, 0.45],
  [483, 171, 0.9, 2.4, 0.68],
  [338, 65, 1.1, 3.8, 0.3],
  [313, 134, 0.9, 1.4, 0.76],
  [502, 69, 1.1, 1.2, 0.69],
  [577, 159, 1.1, 4, 0.34],
  [45, 217, 1.4, 3.7, 0.27],
  [681, 76, 1.1, 1.8, 0.48],
  [51, 202, 0.9, 3.2, 0.43],
  [190, 216, 1.4, 3.8, 0.6],
  [725, 23, 1.1, 1.5, 0.28],
];

const WIRES = [
  "M70 24 H150 L182 56 H262 L282 76 H360",
  "M0 70 H170 L198 98 H360",
  "M0 150 H170 L198 122 H360",
  "M70 196 H150 L182 164 H262 L282 144 H360",
];
const STUBS = ["M96 56 H182", "M96 164 H182"];

function Wires({ transform, delays }: { transform?: string; delays: number[] }) {
  return (
    <g transform={transform}>
      {[...WIRES, ...STUBS].map((d) => (
        <path key={d} d={d} stroke="url(#vxcl)" />
      ))}
      {WIRES.map((d, i) => (
        <path key={`pulse-${d}`} className="vx-pulse" d={d} style={{ animationDelay: `${delays[i]}s` }} />
      ))}
    </g>
  );
}

export function Circuit() {
  return (
    <div className="vx-circuit" data-reveal="">
      <svg className="vx-circuit-lines" viewBox="0 0 920 220" aria-hidden="true">
        <defs>
          <linearGradient id="vxcl" x1="0" x2="360" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#baf448" stopOpacity="0" />
            <stop offset=".3" stopColor="#baf448" stopOpacity=".45" />
            <stop offset="1" stopColor="#baf448" stopOpacity=".85" />
          </linearGradient>
        </defs>
        {STARS.map(([cx, cy, r, delay, opacity]) => (
          <circle
            key={`${cx}-${cy}`}
            className="vx-star"
            cx={cx}
            cy={cy}
            r={r}
            style={{ animationDelay: `${delay}s`, opacity }}
          />
        ))}
        <g fill="none" strokeWidth="1.3">
          <Wires delays={[0, 0.7, 1.4, 2.1]} />
          <Wires transform="translate(920 0) scale(-1 1)" delays={[0.3, 1, 1.8, 2.4]} />
        </g>
      </svg>
      <div className="vx-tile">
        <svg viewBox="-10 -10 200 184" role="img" aria-label="Vexis">
          <defs>
            <linearGradient id="vxtf" x1="10" y1="-50" x2="95" y2="168" gradientUnits="userSpaceOnUse">
              <stop stopColor="#baf448" />
              <stop offset=".5" stopColor="#5f8a22" />
              <stop offset="1" stopColor="#0b1404" />
            </linearGradient>
          </defs>
          <path
            d={MARK}
            fill="url(#vxtf)"
            fillRule="evenodd"
            stroke="#d9ff8f"
            strokeOpacity=".35"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

const LOOP = "M70 190 C70 70 230 60 300 170 C360 265 520 280 530 170 C540 70 380 70 300 170 C230 265 70 300 70 190 Z";

export function SafetyCards() {
  return (
    <div className="right-cards-wrapper right-card-home-3 vx-safety" data-reveal="">
      <svg className="vx-loop" viewBox="0 0 600 340" aria-hidden="true">
        <defs>
          <linearGradient id="vxlg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#e9ffb8" />
            <stop offset=".45" stopColor="#baf448" />
            <stop offset="1" stopColor="#4d7a12" />
          </linearGradient>
          <filter id="vxlb" x="-20%" y="-30%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>
        <path d={LOOP} fill="none" stroke="#baf448" strokeOpacity=".55" strokeWidth="30" filter="url(#vxlb)" />
        <path d={LOOP} fill="none" stroke="url(#vxlg)" strokeWidth="16" strokeLinecap="round" />
        <path d={LOOP} fill="none" stroke="#f6ffe0" strokeOpacity=".7" strokeWidth="2.5" transform="translate(0 -4)" />
      </svg>
      <div className="vx-pcard dark">
        <div className="vx-pcard-top">
          <svg viewBox="-10 -10 200 184" aria-hidden="true">
            <path d={MARK} fill="#baf448" fillRule="evenodd" />
          </svg>
          <span>WALLET</span>
        </div>
        <div className="vx-pcard-num vx-num">7xKX ···· gAsU</div>
        <div className="vx-pcard-foot">
          <span>Tracking only</span>
          <span className="vx-badge">
            <Eye className="vx-ic" />
            Read-only
          </span>
        </div>
      </div>
      <div className="vx-pcard light">
        <div className="vx-pcard-top">
          <span>RULE MODE</span>
          <ShieldCheck className="vx-ic vx-pcard-chip" />
        </div>
        <div className="vx-pcard-mode">
          <span className="vx-toggle">
            <i />
          </span>
          <b>Preview</b>
        </div>
        <div className="vx-pcard-foot">
          <span>Nothing moves until you go live</span>
        </div>
      </div>
    </div>
  );
}
