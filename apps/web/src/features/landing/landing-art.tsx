import { Eye, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";
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

// Sample week, scaled to the best day (+2.48 SOL).
const DAYS: { day: string; v: number | null; tip?: string }[] = [
  { day: "M", v: 0.38 },
  { day: "T", v: 1, tip: "+2.48 SOL" },
  { day: "W", v: -0.27 },
  { day: "T", v: 0.17 },
  { day: "F", v: 0.12 },
  { day: "S", v: null },
  { day: "S", v: 0.41 },
];

export function ProfitDays() {
  return (
    <div className="vx-days" role="img" aria-label="Daily profit for one week, sample">
      {DAYS.map(({ day, v, tip }, i) => {
        const cls = cn("vx-day", v === null && "off", v !== null && v < 0 && "loss", tip && "top");
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed week, day letters repeat
          <div key={i} className={cls} style={v === null ? undefined : ({ "--v": Math.abs(v) } as CSSProperties)}>
            {tip && <b className="vx-tip">{tip}</b>}
            <i />
            <span>{day}</span>
          </div>
        );
      })}
    </div>
  );
}

// Sample liquidity per bin, in percent of the fullest; index 14 is the active bin.
const BINS = [
  7, 7, 7, 7, 7, 12, 16, 27, 38, 53, 56, 71, 76, 100, 100, 81, 96, 84, 65, 51, 34, 23, 18, 10, 7, 7, 7, 7, 7,
];
const ACTIVE = 14;

export function BinsGlimpse() {
  return (
    <>
      <div className="vx-binsfull" role="img" aria-label="Liquidity by bin around the active price, sample">
        {BINS.map((h, i) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: bins are positional
            key={i}
            className={i < ACTIVE ? "y" : i > ACTIVE ? "x" : "a"}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="vx-marker">
        <i />
        <i />
      </div>
      <div className="vx-price">
        <b className="vx-num">0.003412</b>
        <span>Active price · JUP-SOL</span>
      </div>
    </>
  );
}

export function AlertPhone() {
  return (
    <div className="vx-phone" role="img" aria-label="Phone notification, sample">
      <div className="vx-notif">
        <span className="vx-notif-icon">
          <svg viewBox="-10 -10 200 184" aria-hidden="true">
            <path d={MARK} fill="#0b0b0b" fillRule="evenodd" />
          </svg>
        </span>
        <span className="vx-notif-body">
          <span className="vx-notif-top">
            <b>Vexis alerts</b>
            <span>now</span>
          </span>
          <b className="vx-notif-title">Volume spike · JUP-SOL</b>
          <span className="vx-notif-text">8.8× the usual pace in the last minute</span>
        </span>
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
