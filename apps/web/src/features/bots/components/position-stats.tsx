import { type BotSummary, isInRange } from "@vexis/bot-state";
import type { ReactNode } from "react";
import { shortAddr } from "@/lib/format";

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="num mt-1 text-sm text-zinc-200">{children}</dd>
    </div>
  );
}

export function PositionStats({ bot }: { bot: BotSummary }) {
  const snap = bot.snapshot;
  if (!snap) {
    return <p className="text-sm text-zinc-500">The bot has not written snapshot.json yet.</p>;
  }
  const inRange = isInRange(snap);
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Stat label="Active bin">{snap.activeBin}</Stat>
      <Stat label="Range">
        {snap.position ? (
          <span className={inRange ? "text-emerald-300" : "text-amber-300"}>
            {snap.position.lower}–{snap.position.upper} {inRange ? "in" : "out"}
          </span>
        ) : (
          <span className="text-zinc-500">no position</span>
        )}
      </Stat>
      <Stat label="Wallet SOL">{snap.wallet.sol}</Stat>
      <Stat label="Pool">{snap.pair ?? shortAddr(snap.pool)}</Stat>
    </dl>
  );
}
