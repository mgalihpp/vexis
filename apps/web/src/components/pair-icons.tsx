/** Two overlapping token bubbles for a pool pair. */
export function PairIcons({
  tokens,
  size = "size-6",
}: {
  /** Left to right; the first one is drawn on top. */
  tokens: { symbol: string; logo?: string | null }[];
  /** Tailwind size class for one bubble. */
  size?: string;
}) {
  return (
    <span className="flex -space-x-2">
      {tokens.map((token, index) => (
        <TokenMark key={token.symbol} token={token.symbol} logo={token.logo} front={index === 0} size={size} />
      ))}
    </span>
  );
}

export function TokenMark({
  token,
  logo,
  front = false,
  size = "size-6",
}: {
  token: string;
  logo?: string | null;
  front?: boolean;
  size?: string;
}) {
  const layer = front ? "relative z-10" : "relative";
  return logo ? (
    <img
      src={logo}
      alt={token}
      className={`${layer} ${size} rounded-full border-2 border-background bg-background object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${layer} flex ${size} items-center justify-center rounded-full border-2 border-background bg-muted text-[0.6rem] font-bold text-foreground`}
    >
      {token.slice(0, 1)}
    </span>
  );
}
