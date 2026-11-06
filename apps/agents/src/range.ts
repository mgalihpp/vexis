import type { AutoRebalanceConfig } from "@vexis/db/agents";

/** One of the wallet's positions in a pool, as read on-chain. */
export type OnChainPosition = {
  readonly address: string;
  readonly lowerBinId: number;
  readonly upperBinId: number;
  /** Any liquidity or unclaimed fee left in it. An emptied position is ignored. */
  readonly funded: boolean;
};

export type PositionPick =
  | { readonly _tag: "none" }
  | { readonly _tag: "many"; readonly addresses: ReadonlyArray<string> }
  | { readonly _tag: "one"; readonly position: OnChainPosition };

/** The agent manages exactly one funded position per pool; it never guesses between several. */
export function pickPosition(positions: ReadonlyArray<OnChainPosition>): PositionPick {
  const funded = positions.filter((p) => p.funded);
  const [only] = funded;
  if (!only) return { _tag: "none" };
  if (funded.length > 1) return { _tag: "many", addresses: funded.map((p) => p.address) };
  return { _tag: "one", position: only };
}

/** No drift threshold: any active bin outside `[lower, upper]` counts. */
export const outOfRange = (activeBinId: number, p: Pick<OnChainPosition, "lowerBinId" | "upperBinId">) =>
  activeBinId < p.lowerBinId || activeBinId > p.upperBinId;

/** Bins each side of the active bin after a move: the configured `halfWidth`, or the current width's half. */
export const halfWidthFor = (
  config: Pick<AutoRebalanceConfig, "halfWidth">,
  p: Pick<OnChainPosition, "lowerBinId" | "upperBinId">,
) => config.halfWidth ?? Math.max(1, Math.floor((p.upperBinId - p.lowerBinId) / 2));

/** The range to move to: `halfWidth` bins each side of the active bin, or the current width re-centered. */
export function targetRange(
  config: Pick<AutoRebalanceConfig, "halfWidth">,
  activeBinId: number,
  p: Pick<OnChainPosition, "lowerBinId" | "upperBinId">,
) {
  const half = halfWidthFor(config, p);
  return { lowerBinId: activeBinId - half, upperBinId: activeBinId + half };
}
