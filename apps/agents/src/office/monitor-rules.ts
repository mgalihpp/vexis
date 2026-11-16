import type { AutoRebalanceConfig } from "@vexis/db/agents";
import type { Guardrails } from "@vexis/db/office";

// What the Monitor asks the owner to do with one office position, from one on-chain read. Pure: the runner reads the
// chain and writes the proposal.

export type MonitorReading = {
  /** What the position cost, in SOL. */
  readonly costSol: number;
  /** Liquidity plus unclaimed fees at the active bin price; null when the pool has no SOL side. */
  readonly valueSol: number | null;
  /** Unclaimed fees alone, valued the same way. */
  readonly feeSol: number | null;
  readonly activeBin: number;
  readonly lowerBin: number;
  readonly upperBin: number;
  readonly strategy: AutoRebalanceConfig["strategy"];
};

export type MonitorProposal =
  | { readonly kind: "close"; readonly params: { readonly reason: "take_profit" | "stop_loss" | "out_of_range" } }
  | {
      readonly kind: "rebalance";
      readonly params: {
        readonly strategy: AutoRebalanceConfig["strategy"];
        readonly activeBin: number;
        readonly lowerBin: number;
        readonly upperBin: number;
      };
    }
  | { readonly kind: "claim"; readonly params: { readonly feeSol: number } };

const pct = (n: number) => `${n.toFixed(1)}%`;

/**
 * Take profit and stop loss first, on value against cost. Then range: one range-width or less past an edge is
 * re-centered with the same width; further out, re-centering would chase the move, so the position is closed. Then
 * fees: a claim once they are worth `claimFeePct` of the cost. Null when nothing is due.
 */
export function monitorProposal(
  g: Guardrails,
  r: MonitorReading,
): { readonly proposal: MonitorProposal; readonly rationale: string } | null {
  if (r.valueSol !== null && r.costSol > 0) {
    const pnl = ((r.valueSol - r.costSol) / r.costSol) * 100;
    if (pnl >= g.tpPct) {
      return {
        proposal: { kind: "close", params: { reason: "take_profit" } },
        rationale: `Up ${pct(pnl)} on cost, past the ${pct(g.tpPct)} take profit.`,
      };
    }
    if (pnl <= -g.slPct) {
      return {
        proposal: { kind: "close", params: { reason: "stop_loss" } },
        rationale: `Down ${pct(-pnl)} on cost, past the ${pct(g.slPct)} stop loss.`,
      };
    }
  }

  const width = r.upperBin - r.lowerBin;
  const past = r.activeBin < r.lowerBin ? r.lowerBin - r.activeBin : r.activeBin - r.upperBin;
  if (past > Math.max(1, width)) {
    return {
      proposal: { kind: "close", params: { reason: "out_of_range" } },
      rationale: `The active bin ${r.activeBin} is ${past} bins past the range ${r.lowerBin}..${r.upperBin}.`,
    };
  }
  if (past > 0) {
    const half = Math.max(1, Math.floor(width / 2));
    return {
      proposal: {
        kind: "rebalance",
        params: {
          strategy: r.strategy,
          activeBin: r.activeBin,
          lowerBin: r.activeBin - half,
          upperBin: r.activeBin + half,
        },
      },
      rationale: `The active bin ${r.activeBin} left the range ${r.lowerBin}..${r.upperBin}.`,
    };
  }

  if (r.feeSol !== null && r.costSol > 0 && r.feeSol >= (r.costSol * g.claimFeePct) / 100) {
    return {
      proposal: { kind: "claim", params: { feeSol: r.feeSol } },
      rationale: `Unclaimed fees are worth ${r.feeSol.toFixed(4)} SOL, ${pct((r.feeSol / r.costSol) * 100)} of cost.`,
    };
  }
  return null;
}
