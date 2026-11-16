import { PROPOSAL_PARAMS, RiskNotes } from "@vexis/db/office";
import type { ProposalRow } from "@vexis/db/office-queries";
import { alertable } from "@vexis/db/screen";
import { Effect, Option } from "effect";
import { ask, call, llmBudget, type Office, say, sayOnce, seat } from "./ask.ts";
import { checkOpen } from "./guardrails.ts";
import type { OfficePool } from "./pools.ts";
import {
  managerPrompt,
  riskPrompt,
  type ScoutPool,
  type StrategistCandidate,
  scoutPrompt,
  strategistPrompt,
} from "./prompts/prompts.ts";
import { Chain } from "./services/chain.ts";
import { Db } from "./services/db.ts";
import { SCREENER_WINDOW_MS, Screener } from "./services/meteora.ts";
import { OfficeState } from "./services/state.ts";

/** Pools the Scout reads per run, best fee/TVL first; the screen leaves far fewer on most days. */
const SCOUT_POOLS = 40;
const HOUR_MS = 60 * 60_000;

/** What a tick read once and every desk shares. */
export type Floor = Office & {
  /** Native SOL in the wallet now; null when there is no wallet or the read failed. */
  readonly walletSol: number | null;
  readonly dayStartSol: number | null;
  readonly rpc: { readonly owner: string; readonly url: string } | null;
};

const scoutPool = (p: OfficePool): ScoutPool => ({
  address: p.address,
  name: p.name,
  tvl: p.tvl,
  volume24h: p.volume24h,
  feeTvl24h: p.feeTvl24h,
  binStep: p.binStep,
});

const screenedPools = Effect.gen(function* () {
  const screener = yield* Screener;
  yield* screener.refresh();
  return yield* screener.current();
});

/**
 * Scout, then Strategist on what it found. The Scout runs every 15 minutes, or sooner when one of the user's volume
 * agents alerted since its last run, and not while the office already holds its most positions.
 */
export const scoutAndDraft = (floor: Floor) =>
  Effect.gen(function* () {
    if (!floor.models.scout) return;
    const { filter } = floor;
    if (!filter) {
      const text = "The custom pool filter is empty, so I am not scouting. Pick a preset in Settings.";
      yield* sayOnce(floor, "no-filter", "scout", text, "warn");
      return;
    }
    const db = yield* Db;
    const state = yield* OfficeState;

    const last = yield* state.lastScout(floor.userId);
    const recentSpikes = yield* db.spikesSince(floor.userId, new Date(floor.now - HOUR_MS));
    const due =
      last === null || floor.now - last >= SCREENER_WINDOW_MS || recentSpikes.some((s) => s.at.getTime() > last);
    if (!due) return;
    const open = yield* db.openJournal(floor.userId);
    if (open.length >= floor.guardrails.maxActivePositions) return;
    yield* state.markScout(floor.userId, floor.now);
    // Seated before the pool list, so an office with no key or budget left costs no datapi request.
    const scout = yield* seat(floor, "scout");
    if (Option.isNone(scout)) return;

    const snapshot = yield* screenedPools;
    if (!snapshot) {
      yield* sayOnce(floor, "no-screener", "scout", "No pool list from Meteora yet. Waiting.", "warn");
      return;
    }
    const pools = snapshot.pools
      .filter((p) => alertable(p, filter))
      .toSorted((a, b) => (b.feeTvl24h ?? -1) - (a.feeTvl24h ?? -1))
      .slice(0, SCOUT_POOLS);
    if (pools.length === 0) {
      yield* say(floor, "scout", "No pool passes the screen right now.", "info");
      return;
    }

    const answer = yield* call(floor, scout.value, scoutPrompt, {
      pools: pools.map(scoutPool),
      spikes: recentSpikes.filter((s) => pools.some((p) => p.address === s.poolAddress)),
    });
    if (Option.isNone(answer)) return;
    const byAddress = new Map(pools.map((p) => [p.address, p]));
    const candidates = [...new Map(answer.value.value.candidates.map((c) => [c.pool, c])).values()].flatMap((c) => {
      const pool = byAddress.get(c.pool);
      return pool ? [{ pool, reason: c.reason }] : [];
    });
    const [top] = candidates;
    if (!top) {
      yield* say(floor, "scout", "Nothing worth a look this round.", "info");
      return;
    }
    yield* say(floor, "scout", `${candidates.length} candidates. Top pick: ${top.pool.name}.`, "info", {
      poolAddress: top.pool.address,
    });
    yield* draft(floor, candidates, snapshot.solUsd);
  });

/** The Strategist turns the Scout's candidates into at most one draft, with the active bin read on chain. */
const draft = (
  floor: Floor,
  candidates: ReadonlyArray<{ readonly pool: OfficePool; readonly reason: string }>,
  solUsd: number | null,
) =>
  Effect.gen(function* () {
    if (!floor.models.strategist) return;
    if (!floor.rpc || floor.walletSol === null) {
      const why = floor.rpc ? "I could not read the wallet balance" : "There is no wallet or RPC URL";
      yield* sayOnce(floor, "no-wallet", "strategist", `${why}, so I cannot size a position.`, "warn");
      return;
    }
    const { rpc, walletSol } = floor;
    const db = yield* Db;
    const chain = yield* Chain;

    const read = yield* Effect.forEach(candidates, ({ pool, reason }) =>
      chain.pool(rpc.url, pool.address).pipe(
        Effect.map((bins): StrategistCandidate[] => [
          { ...scoutPool(pool), binStep: bins.binStep, activeBin: bins.activeBin, reason },
        ]),
        Effect.catchTag("ChainError", (error) =>
          Effect.logWarning(`bin read failed for ${pool.address}: ${error.message}`).pipe(Effect.as([])),
        ),
      ),
    );
    const ready = read.flat();
    if (ready.length === 0) {
      yield* say(floor, "strategist", "Could not read any candidate on chain. Skipping.", "warn");
      return;
    }

    const open = yield* db.openJournal(floor.userId);
    const answer = yield* ask(floor, "strategist", strategistPrompt, {
      candidates: ready,
      walletSol,
      guardrails: floor.guardrails,
      openPositions: open.map((j) => ({ name: j.poolName, amountSol: j.amountSol })),
    });
    if (Option.isNone(answer)) return;
    const { value: decision, runId } = answer.value;
    if (decision.action === "skip") {
      yield* say(floor, "strategist", `Passing this round: ${decision.reason}`, "info");
      return;
    }

    const pick = ready.find((c) => c.address === decision.pool);
    if (!pick) {
      yield* Effect.logWarning(`strategist picked ${decision.pool}, which is not a candidate`);
      return;
    }
    const params = PROPOSAL_PARAMS.open.safeParse({
      strategy: decision.strategy,
      activeBin: pick.activeBin,
      lowerBin: decision.lowerBin,
      upperBin: decision.upperBin,
      amountSol: decision.amountSol,
      solUsd,
    });
    if (!params.success) {
      yield* say(floor, "strategist", `Dropped my ${pick.name} draft: the range misses the active bin.`, "warn", {
        poolAddress: pick.address,
      });
      return;
    }
    const row = yield* db.insertProposal(floor.userId, {
      kind: "open",
      poolAddress: pick.address,
      poolName: pick.name,
      params: params.data,
      rationale: decision.rationale,
      proposedBy: "strategist",
      runId,
      expiresAt: new Date(floor.now + floor.guardrails.approvalTtlSec * 1000),
    });
    if (!row) {
      yield* say(floor, "strategist", `${pick.name} already has an open proposal. Dropped the duplicate.`, "info", {
        poolAddress: pick.address,
      });
      return;
    }
    const p = params.data;
    yield* say(floor, "strategist", `Drafted ${p.amountSol} SOL ${p.strategy} in ${pick.name}.`, "info", {
      poolAddress: pick.address,
      proposalId: row.id,
    });
  });

/** Every guardrail in code, then the Risk agent. A code veto stands; the agent may only add one. */
export const reviewDrafts = (floor: Floor) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const drafts = yield* db.proposals(floor.userId, ["draft"]);
    if (drafts.length === 0) return;
    const snapshot = yield* screenedPools;
    const managed = yield* db.rebalancePools(floor.userId);
    for (const proposal of drafts) yield* review(floor, proposal, snapshot?.pools ?? [], managed);
  });

const review = (floor: Floor, proposal: ProposalRow, pools: ReadonlyArray<OfficePool>, managed: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const name = proposal.poolName ?? proposal.poolAddress.slice(0, 6);
    const where = { poolAddress: proposal.poolAddress, proposalId: proposal.id };
    const reject = (notes: RiskNotes, text: string) =>
      db
        .move(floor.userId, proposal.id, "draft", "rejected", { riskNotes: notes, decidedBy: "risk" })
        .pipe(Effect.andThen(say(floor, "risk", text, "bad", where)));

    const params = PROPOSAL_PARAMS.open.safeParse(proposal.params);
    if (proposal.kind !== "open" || !params.success) {
      const check = { rule: "params", ok: false, value: `${proposal.kind} proposals are not handled yet` };
      return yield* reject({ checks: [check], llm: null }, `Vetoed ${name}: I can only check new positions.`);
    }

    const open = yield* db.openJournal(floor.userId);
    const { spent, cap } = yield* llmBudget(floor);
    const checks = checkOpen(floor.guardrails, floor.filter, {
      params: params.data,
      walletSol: floor.walletSol,
      dayStartSol: floor.dayStartSol,
      openPositions: open.length,
      pool: pools.find((p) => p.address === proposal.poolAddress) ?? null,
      rebalanceManaged: managed.has(proposal.poolAddress),
      lastExecutionAt: yield* db.lastExecutionAt(floor.userId, proposal.poolAddress),
      now: floor.now,
      llmSpentUsd: spent,
      llmCapUsd: cap,
    });
    const failed = checks.filter((c) => !c.ok).map((c) => c.rule);
    if (failed.length > 0) {
      return yield* reject({ checks, llm: null }, `Vetoed ${name}: ${failed.join(", ")}.`);
    }

    const answer = yield* ask(floor, "risk", riskPrompt, {
      poolName: proposal.poolName,
      params: params.data,
      rationale: proposal.rationale,
      checks,
    });
    const llm = Option.match(answer, { onNone: () => null, onSome: (a) => a.value });
    if (llm?.veto) return yield* reject({ checks, llm }, `Vetoed ${name}: ${llm.note}`);
    yield* db.move(floor.userId, proposal.id, "draft", "risk_checked", { riskNotes: { checks, llm } });
    yield* say(floor, "risk", `${name} passed every check.${llm ? ` ${llm.note}` : ""}`, "good", where);
  });

/** The Manager summarises each checked proposal and puts it in front of the owner. */
export const presentChecked = (floor: Floor) =>
  Effect.gen(function* () {
    if (!floor.models.manager) return;
    const db = yield* Db;
    const checked = yield* db.proposals(floor.userId, ["risk_checked"]);
    for (const proposal of checked) {
      const params = PROPOSAL_PARAMS.open.safeParse(proposal.params);
      if (proposal.kind !== "open" || !params.success) continue;
      const notes = RiskNotes.safeParse(proposal.riskNotes);
      const answer = yield* ask(floor, "manager", managerPrompt, {
        poolName: proposal.poolName,
        params: params.data,
        rationale: proposal.rationale,
        riskNote: notes.success ? (notes.data.llm?.note ?? null) : null,
      });
      if (Option.isNone(answer)) return;
      const moved = yield* db.move(floor.userId, proposal.id, "risk_checked", "awaiting_approval", {
        summary: answer.value.value.summary,
        expiresAt: new Date(floor.now + floor.guardrails.approvalTtlSec * 1000),
      });
      if (moved) {
        yield* say(floor, "manager", `${proposal.poolName ?? "A pool"} is ready for your approval.`, "info", {
          poolAddress: proposal.poolAddress,
          proposalId: proposal.id,
        });
      }
    }
  });
