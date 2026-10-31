// Relative times are computed from the server's `now` carried in loader data,
// so SSR output and the hydrated client render the same string.
export function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const solscanTx = (signature: string) => `https://solscan.io/tx/${signature}`;

export const shortAddr = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
