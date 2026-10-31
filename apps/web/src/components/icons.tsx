import type { SVGProps } from "react";

// public/logo.png is 625×399 with the mark inside this box; the crop below shows only the mark.
const LOGO = { width: 625, height: 399, x: 234, y: 125, markWidth: 170, markHeight: 156 };

export function Logo({ height, className = "" }: { height: number; className?: string }) {
  const k = height / LOGO.markHeight;
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={{ width: LOGO.markWidth * k, height }}
    >
      <img
        src="/logo.png"
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={{ width: LOGO.width * k, height: LOGO.height * k, left: -LOGO.x * k, top: -LOGO.y * k }}
      />
    </span>
  );
}

export function SolIcon({ className = "" }: { className?: string }) {
  return <img src="/Solana_logo.png" alt="" className={`rounded-full ${className}`} />;
}

export function UsdcIcon({ className = "" }: { className?: string }) {
  return <img src="/usd-coin-usdc-logo.png" alt="" className={`rounded-full ${className}`} />;
}

export function BtcIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="11" fill="#f7931a" />
      <path
        fill="#fff"
        d="M15.9 10.6c.2-1.4-.9-2.2-2.4-2.7l.5-2-1.2-.3-.5 1.9-1-.2.5-1.9-1.2-.3-.5 2-.8-.2-1.7-.4-.3 1.3s.9.2.9.2c.5.1.6.5.6.7l-1.4 5.5c-.1.2-.3.4-.6.3 0 0-.9-.2-.9-.2l-.6 1.4 1.6.4.9.2-.5 2 1.2.3.5-2 1 .2-.5 2 1.2.3.5-2c2.1.4 3.6.2 4.3-1.6.5-1.5 0-2.4-1.1-2.9.8-.2 1.4-.7 1.5-1.8zm-2.8 3.9c-.4 1.5-2.9.7-3.7.5l.7-2.7c.8.2 3.4.6 3 2.2zm.4-4c-.3 1.4-2.4.7-3.1.5l.6-2.4c.7.2 2.9.5 2.5 1.9z"
      />
    </svg>
  );
}
