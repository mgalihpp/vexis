import type { Guardrails, ProposalParams, RiskNotes } from "@vexis/db/office";
import type { z } from "zod";
import { ManagerDecision, RiskDecision, ScoutDecision, StrategistDecision } from "../decision.ts";

// Every prompt carries a version recorded in `office_runs`, so a change in behavior can be traced to a prompt change.
// Prompts hold market data and the proposal only: never a key, an RPC URL, a bot token or a wallet address.

export type Prompt<I, A> = {
  readonly version: string;
  readonly system: string;
  readonly schema: z.ZodType<A>;
  readonly user: (input: I) => string;
};

const JSON_ONLY = "Answer with one JSON object and nothing else.";
const PLAIN = "Write every free-text field in short, plain English.";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export type ScoutPool = {
  readonly address: string;
  readonly name: string;
  readonly tvl: number;
  readonly volume24h: number;
  /** Fees over TVL in the last 24h, in percent. */
  readonly feeTvl24h: number | null;
  readonly binStep: number;
};

export type ScoutSpike = { readonly poolAddress: string; readonly ratio: number; readonly vol1m: number };

export const scoutPrompt: Prompt<{ pools: readonly ScoutPool[]; spikes: readonly ScoutSpike[] }, ScoutDecision> = {
  version: "scout-v1",
  schema: ScoutDecision,
  system: [
    "You are the Scout of a Meteora DLMM liquidity desk on Solana.",
    "From the pools you are given, pick 3 to 5 where a liquidity provider earns the most fees for the risk:",
    "high fees over TVL, steady volume, enough TVL to exit. A recent volume spike is a signal, not a must.",
    "Only pick addresses from the list.",
    `${PLAIN} ${JSON_ONLY}`,
    'Shape: {"candidates":[{"pool":"<address>","reason":"<one sentence>"}]}',
  ].join("\n"),
  user: ({ pools, spikes }) =>
    [
      "Pools (address | pair | TVL | 24h volume | 24h fee/TVL | bin step):",
      ...pools.map(
        (p) =>
          `${p.address} | ${p.name} | ${usd(p.tvl)} | ${usd(p.volume24h)} | ${p.feeTvl24h === null ? "-" : `${p.feeTvl24h.toFixed(2)}%`} | ${p.binStep}`,
      ),
      spikes.length === 0
        ? "No volume spikes in the last hour."
        : "Volume spikes in the last hour (pool | x median | 1m volume):",
      ...spikes.map((s) => `${s.poolAddress} | ${s.ratio.toFixed(1)}x | ${usd(s.vol1m)}`),
    ].join("\n"),
};

export type StrategistCandidate = ScoutPool & { readonly reason: string; readonly activeBin: number };

export type StrategistInput = {
  readonly candidates: readonly StrategistCandidate[];
  /** SOL the office may still spend. */
  readonly walletSol: number;
  /** The largest position the guardrails allow, in SOL. */
  readonly maxPositionSol: number;
  readonly guardrails: Guardrails;
  readonly openPositions: readonly { readonly name: string | null; readonly amountSol: number }[];
};

export const strategistPrompt: Prompt<StrategistInput, StrategistDecision> = {
  version: "strategist-v2",
  schema: StrategistDecision,
  system: [
    "You are the Strategist of a Meteora DLMM liquidity desk on Solana.",
    "Pick at most one candidate and draft one position in it, sized in SOL, or skip when none is worth it.",
    "Strategy is Spot (even), Curve (concentrated at the active bin) or BidAsk (weighted to the edges).",
    "lowerBin and upperBin are bin ids that must hold the active bin; keep the range within 69 bins.",
    "Stay inside the limits you are given: position size and the SOL that must stay in the wallet.",
    `${PLAIN} ${JSON_ONLY}`,
    'Shape: {"action":"open","pool":"<address>","strategy":"Spot|Curve|BidAsk","lowerBin":0,"upperBin":0,"amountSol":0,"rationale":"<two sentences>"}',
    'or {"action":"skip","reason":"<one sentence>"}',
  ].join("\n"),
  user: ({ candidates, walletSol, maxPositionSol, guardrails, openPositions }) =>
    [
      `Wallet: ${walletSol.toFixed(3)} SOL free. Max position: ${maxPositionSol.toFixed(3)} SOL. Keep at least ${guardrails.solReserve} SOL.`,
      `Open positions (${openPositions.length} of max ${guardrails.maxActivePositions}):`,
      ...openPositions.map((p) => `- ${p.name ?? "?"}: ${p.amountSol} SOL`),
      "Candidates (address | pair | TVL | 24h volume | 24h fee/TVL | bin step | active bin | Scout's reason):",
      ...candidates.map(
        (c) =>
          `${c.address} | ${c.name} | ${usd(c.tvl)} | ${usd(c.volume24h)} | ${c.feeTvl24h === null ? "-" : `${c.feeTvl24h.toFixed(2)}%`} | ${c.binStep} | ${c.activeBin} | ${c.reason}`,
      ),
    ].join("\n"),
};

export type ProposalBrief = {
  readonly poolName: string | null;
  readonly params: ProposalParams<"open">;
  readonly rationale: string;
};

export const riskPrompt: Prompt<ProposalBrief & { readonly checks: RiskNotes["checks"] }, RiskDecision> = {
  version: "risk-v1",
  schema: RiskDecision,
  system: [
    "You are the Risk Manager of a Meteora DLMM liquidity desk on Solana.",
    "Code has already checked the hard limits and they all passed. Look for what code cannot see:",
    "a range too narrow for the pool's bin step, a size out of line with the rationale, a rationale that does not hold.",
    "Veto only for a concrete reason. You cannot lift a code veto, and you are only asked when there is none.",
    `${PLAIN} ${JSON_ONLY}`,
    'Shape: {"veto":false,"note":"<one sentence>"}',
  ].join("\n"),
  user: (b) =>
    [briefLines(b), "Code checks:", ...b.checks.map((c) => `- ${c.rule}: ${c.ok ? "ok" : "FAIL"} (${c.value})`)].join(
      "\n",
    ),
};

export const managerPrompt: Prompt<ProposalBrief & { readonly riskNote: string | null }, ManagerDecision> = {
  version: "manager-v1",
  schema: ManagerDecision,
  system: [
    "You are the Manager of a Meteora DLMM liquidity desk on Solana.",
    "Write the summary the owner reads before approving: what the position is, why, and the main risk.",
    "At most three sentences. No advice beyond this proposal.",
    `${PLAIN} ${JSON_ONLY}`,
    'Shape: {"summary":"<three sentences at most>"}',
  ].join("\n"),
  user: (b) => [briefLines(b), `Risk note: ${b.riskNote ?? "none"}`].join("\n"),
};

function briefLines({ poolName, params, rationale }: ProposalBrief) {
  return [
    `Pool: ${poolName ?? "?"}`,
    `Open ${params.amountSol} SOL, ${params.strategy}, bins ${params.lowerBin} to ${params.upperBin} (active ${params.activeBin}).`,
    `Strategist's rationale: ${rationale}`,
  ].join("\n");
}
