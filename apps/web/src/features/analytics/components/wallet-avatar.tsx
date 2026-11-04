import { avatarTraits, type Rarity } from "../wallet-avatar";

// Drawn on a 32 by 32 grid so the character reads at 32px.
const BODIES = [
  // Round blob
  "M16 5C25 5 28 11.5 28 18.5C28 26 23 29 16 29C9 29 4 26 4 18.5C4 11.5 7 5 16 5Z",
  // Soft square
  "M8 6H24Q28 6 28 10V22Q28 28 22 28H10Q4 28 4 22V10Q4 6 8 6Z",
  // Bean
  "M16 6C26 6 29 12 27 19C25 27 7 27 5 19C3 12 6 6 16 6Z",
];

function Eyes({ kind }: { kind: number }) {
  if (kind === 0) {
    return (
      <>
        <circle cx="11.5" cy="16" r="2.2" fill="#1b1b1f" />
        <circle cx="20.5" cy="16" r="2.2" fill="#1b1b1f" />
        <circle cx="12.2" cy="15.2" r="0.7" fill="#fff" />
        <circle cx="21.2" cy="15.2" r="0.7" fill="#fff" />
      </>
    );
  }
  if (kind === 1) {
    // Happy arches
    return (
      <path
        d="M9 16.5Q11.5 13 14 16.5M18 16.5Q20.5 13 23 16.5"
        fill="none"
        stroke="#1b1b1f"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    );
  }
  if (kind === 2) {
    // Sleepy lids
    return <path d="M9.5 16H13.5M18.5 16H22.5" fill="none" stroke="#1b1b1f" strokeWidth="1.8" strokeLinecap="round" />;
  }
  // Big shiny eyes
  return (
    <>
      <ellipse cx="11.5" cy="16" rx="2.8" ry="3.2" fill="#1b1b1f" />
      <ellipse cx="20.5" cy="16" rx="2.8" ry="3.2" fill="#1b1b1f" />
      <circle cx="12.5" cy="14.6" r="1" fill="#fff" />
      <circle cx="21.5" cy="14.6" r="1" fill="#fff" />
    </>
  );
}

function Mouth({ kind }: { kind: number }) {
  if (kind === 0) {
    return <path d="M13.5 21Q16 23.5 18.5 21" fill="none" stroke="#1b1b1f" strokeWidth="1.4" strokeLinecap="round" />;
  }
  if (kind === 1) {
    return <ellipse cx="16" cy="21.5" rx="1.4" ry="1.7" fill="#1b1b1f" />;
  }
  // Cat mouth
  return (
    <path
      d="M16 20.5V21M13.5 21.5Q15 23 16 21.6Q17 23 18.5 21.5"
      fill="none"
      stroke="#1b1b1f"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  );
}

function Ears({ kind, fill }: { kind: number; fill: string }) {
  if (kind === 0) return null;
  if (kind === 1) {
    // Cat ears
    return (
      <>
        <path d="M7 11L8 3L14 8Z" fill={fill} />
        <path d="M25 11L24 3L18 8Z" fill={fill} />
      </>
    );
  }
  // Round ears
  return (
    <>
      <circle cx="6" cy="14" r="3.5" fill={fill} />
      <circle cx="26" cy="14" r="3.5" fill={fill} />
    </>
  );
}

// Worn on top of the head. 0 means none.
function Accessory({ kind }: { kind: number }) {
  if (kind === 1) {
    // Top hat
    return (
      <>
        <rect x="10" y="0.5" width="12" height="7" rx="1" fill="#24242b" />
        <rect x="10" y="5.5" width="12" height="1.6" fill="#e0457b" />
        <rect x="6" y="7" width="20" height="2.2" rx="1" fill="#24242b" />
      </>
    );
  }
  if (kind === 2) {
    // Crown
    return <path d="M9 8L10.5 2.5L14 6L16 1.5L18 6L21.5 2.5L23 8Z" fill="#ffc83d" stroke="#c98b00" strokeWidth="0.8" />;
  }
  if (kind === 3) {
    // Sunglasses
    return (
      <>
        <rect x="7.5" y="13.2" width="7.6" height="5.2" rx="2" fill="#17171c" />
        <rect x="16.9" y="13.2" width="7.6" height="5.2" rx="2" fill="#17171c" />
        <path d="M15.1 15H16.9" stroke="#17171c" strokeWidth="1.2" />
      </>
    );
  }
  if (kind === 4) {
    // Halo
    return <ellipse cx="16" cy="3" rx="7" ry="2" fill="none" stroke="#ffd95a" strokeWidth="1.6" />;
  }
  if (kind === 5) {
    // Bow tie
    return (
      <>
        <path d="M16 25L11 22V28Z" fill="#e0457b" />
        <path d="M16 25L21 22V28Z" fill="#e0457b" />
        <circle cx="16" cy="25" r="1.2" fill="#b02d5c" />
      </>
    );
  }
  return null;
}

// Behind the character, inside the frame. Patterns are keyed by the avatar's hue so they stay distinct per wallet.
function Background({ kind, hue, id }: { kind: number; hue: number; id: string }) {
  const base = `hsl(${hue} 70% 92%)`;
  const deep = `hsl(${(hue + 30) % 360} 65% 78%)`;
  if (kind === 1) {
    // Diagonal stripes
    return (
      <>
        <rect width="32" height="32" fill={base} />
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="6" fill={deep} />
        </pattern>
        <rect width="32" height="32" fill={`url(#${id})`} opacity="0.7" />
      </>
    );
  }
  if (kind === 2) {
    // Dots
    return (
      <>
        <rect width="32" height="32" fill={base} />
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.1" fill={deep} />
        </pattern>
        <rect width="32" height="32" fill={`url(#${id})`} />
      </>
    );
  }
  if (kind === 3) {
    // Sparkle: radial glow with a star
    return (
      <>
        <defs>
          <radialGradient id={id}>
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={deep} />
          </radialGradient>
        </defs>
        <rect width="32" height="32" fill={`url(#${id})`} />
        <path d="M26 3L27 5.5L29.5 6.5L27 7.5L26 10L25 7.5L22.5 6.5L25 5.5Z" fill="#fff" opacity="0.9" />
        <path d="M5 25L5.6 26.4L7 27L5.6 27.6L5 29L4.4 27.6L3 27L4.4 26.4Z" fill="#fff" opacity="0.8" />
      </>
    );
  }
  return <rect width="32" height="32" fill={base} />;
}

const RARITY_RING: Record<Rarity, { color: string; glow: string }> = {
  common: { color: "#9ca3af", glow: "none" },
  rare: { color: "#3b82f6", glow: "0 0 6px rgb(59 130 246 / 0.5)" },
  epic: { color: "#a855f7", glow: "0 0 8px rgb(168 85 247 / 0.6)" },
  legendary: { color: "#f5b82e", glow: "0 0 10px rgb(245 184 46 / 0.75)" },
};

/** A small, stable NFT-style character for a wallet. Same address, same character and rarity. */
export function WalletAvatar({ address, className = "size-8" }: { address: string; className?: string }) {
  const t = avatarTraits(address);
  const ring = RARITY_RING[t.rarity];
  const body = `hsl(${t.hue} 75% 62%)`;
  const shade = `hsl(${(t.hue + 40) % 360} 80% 52%)`;
  // Pattern ids depend on the address so two avatars on the page never share one.
  const id = `wa-${t.hue}-${t.background}-${t.rarity}`;
  return (
    <span
      aria-hidden
      data-rarity={t.rarity}
      className={`${className} inline-block shrink-0 overflow-hidden rounded-md`}
      style={{ boxShadow: `inset 0 0 0 2px ${ring.color}, ${ring.glow}` }}
    >
      <svg viewBox="0 0 32 32" className="block size-full">
        <Background kind={t.background} hue={t.hue} id={id} />
        <Ears kind={t.ears} fill={shade} />
        <path d={BODIES[t.body]} fill={body} />
        <ellipse cx="8" cy="21" rx="2" ry="1.3" fill="#ff7aa2" opacity="0.6" />
        <ellipse cx="24" cy="21" rx="2" ry="1.3" fill="#ff7aa2" opacity="0.6" />
        <Eyes kind={t.eyes} />
        <Mouth kind={t.mouth} />
        <Accessory kind={t.accessory} />
      </svg>
    </span>
  );
}
