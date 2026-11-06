// Relative times are computed from the server's `now` carried in loader data,
// so SSR output and the hydrated client render the same string.
export function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  const rest = h % 24;
  return rest > 0 ? `${d}d ${rest}h ago` : `${d}d ago`;
}

export const solscanTx = (signature: string) => `https://solscan.io/tx/${signature}`;
export const solscanAccount = (address: string) => `https://solscan.io/account/${address}`;

export const shortAddr = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
