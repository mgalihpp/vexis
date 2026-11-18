import type { ProposalRow } from "@vexis/db/office-queries";
import {
  autopilotVerdict,
  checkManage,
  checkOpen,
  freeSol,
  positionBudget,
  slotOverheadSol,
} from "@vexis/shared/guardrails";
import { PROPOSAL_PARAMS, type ProposalKind, RiskNotes } from "@vexis/shared/office";
import {
  managerPrompt,
  riskPrompt,
  type ScoutPool,
  type StrategistCandidate,
  scoutPrompt,
  strategistPrompt,
} from "@vexis/shared/office-prompts";
import { alertable } from "@vexis/shared/screen";
import { Effect, Option } from "effect";
import { ask, call, llmBudget, type Office, say, sayOnce, seat } from "./ask.ts";
import type { DbError } from "./errors.ts";
import { sendCard } from "./inbox.ts";
import type { OfficePool } from "./pools.ts";
import { Chain } from "./services/chain.ts";
import { Db, type JournalBook } from "./services/db.ts";
import { SCREENER_WINDOW_MS, Screener } from "./services/meteora.ts";
import { OfficeState } from "./services/state.ts";

/** Pools the Scout reads per run, best fee/TVL first; the screen leaves far fewer on most days. */
const SCOUT_POOLS = 40;
const HOUR_MS = 60 * 60_000;

/** What a tick read once and every desk shares. */
export type Floor = Office & {
  /** Native SOL in the wallet now; null when there is no wallet or the read failed. */
  readonly walletSol: number | null;
  /** Rent of a new position account, read on chain this tick; null when unread. */
  readonly positionRentSol: number | null;
  /** The office's capital at the first read of the UTC day; null until a balance was read today. */
  readonly dayStartCapital: number | null;
  /** The office's open positions and today's closes, read at the start of the tick. */
  readonly book: JournalBook;
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
    if (positionBudget(floor.guardrails, floor) === 0) {
      const text = "Not enough SOL above the reserve for another position's deposit, rent and fees. Waiting.";
      yield* sayOnce(floor, "no-budget", "scout", text, "info");
      return;
    }
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
    if (!floor.rpc || floor.walletSol === null || floor.positionRentSol === null) {
      const why = !floor.rpc
        ? "There is no wallet or RPC URL"
        : floor.walletSol === null
          ? "I could not read the wallet balance"
          : "I could not read the position rent on chain";
      yield* sayOnce(floor, "no-wallet", "strategist", `${why}, so I cannot size a position.`, "warn");
      return;
    }
    const { rpc, guardrails: g } = floor;
    const overheadSol = slotOverheadSol(g, floor.positionRentSol);
    const walletSol = freeSol(floor.walletSol, floor.book.open, overheadSol);
    const maxPositionSol = positionBudget(g, floor) ?? 0;
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
      maxPositionSol,
      overheadSol,
      guardrails: g,
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
    const where = { poolAddress: pick.address };
    const setup = yield* chain
      .openSetup(rpc.url, pick.address, rpc.owner, decision.lowerBin, decision.upperBin)
      .pipe(Effect.option);
    if (Option.isNone(setup)) {
      yield* say(
        floor,
        "strategist",
        `Dropped my ${pick.name} draft: could not quote its setup cost on chain.`,
        "warn",
        where,
      );
      return;
    }
    const setupSol = setup.value.totalSol;
    const budget = positionBudget(g, floor, setupSol) ?? 0;
    // Whole lamports, rounded down, so the trimmed amount never reads above the budget.
    const amountSol = Math.floor(Math.min(decision.amountSol, budget) * 1e9) / 1e9;
    if (amountSol <= 0) {
      const text = `Dropped my ${pick.name} draft: its ${setupSol.toFixed(4)} SOL setup leaves nothing above the reserve.`;
      yield* say(floor, "strategist", text, "info", where);
      return;
    }
    if (setup.value.binArrays > 0 || amountSol < decision.amountSol) {
      const arrays =
        setup.value.binArrays > 0
          ? ` The range needs ${setup.value.binArrays} new bin array(s), ${setup.value.binArraySol.toFixed(4)} SOL that is not refunded.`
          : "";
      const trimmed =
        amountSol < decision.amountSol
          ? ` Trimmed ${decision.amountSol} to ${amountSol.toFixed(4)} SOL to fit the setup cost.`
          : "";
      yield* say(floor, "strategist", `${pick.name}:${arrays}${trimmed}`, "info", where);
    }
    const params = PROPOSAL_PARAMS.open.safeParse({
      strategy: decision.strategy,
      activeBin: pick.activeBin,
      lowerBin: decision.lowerBin,
      upperBin: decision.upperBin,
      amountSol,
      solUsd,
      setupSol,
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

    if (proposal.kind !== "open") return yield* reviewManage(floor, proposal, managed, reject);
    const params = PROPOSAL_PARAMS.open.safeParse(proposal.params);
    if (!params.success) {
      const check = { rule: "params", ok: false, value: "the parameters do not parse" };
      return yield* reject({ checks: [check], llm: null }, `Vetoed ${name}: its parameters do not parse.`);
    }

    const { spent, cap } = yield* llmBudget(floor);
    const checks = checkOpen(floor.guardrails, floor.filter, {
      params: params.data,
      walletSol: floor.walletSol,
      positionRentSol: floor.positionRentSol,
      dayStartCapital: floor.dayStartCapital,
      book: floor.book,
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

/**
 * A rebalance, claim or close of a position the office holds (from the Monitor or the owner) passes the code rules
 * only: no LLM is asked, so a stop loss never waits on a model or a budget.
 */
const reviewManage = (
  floor: Floor,
  proposal: ProposalRow,
  managed: ReadonlySet<string>,
  reject: (notes: RiskNotes, text: string) => Effect.Effect<void, DbError, Db>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const name = proposal.poolName ?? proposal.poolAddress.slice(0, 6);
    const kind = proposal.kind as Exclude<ProposalKind, "open">;
    const params = PROPOSAL_PARAMS[kind].safeParse(proposal.params);
    if (!params.success) {
      const check = { rule: "params", ok: false, value: "the parameters do not parse" };
      return yield* reject(
        { checks: [check], llm: null },
        `Vetoed the ${kind} of ${name}: its parameters do not parse.`,
      );
    }
    // A rebalance's new range may need bin arrays nobody created yet; their rent is read on chain.
    const range = kind === "rebalance" ? PROPOSAL_PARAMS.rebalance.safeParse(proposal.params) : null;
    const setupSol =
      range?.success && floor.rpc
        ? yield* (yield* Chain)
            .rangeArrays(floor.rpc.url, proposal.poolAddress, range.data.lowerBin, range.data.upperBin)
            .pipe(
              Effect.map((q): number | null => q.totalSol),
              Effect.catchTag("ChainError", (error) =>
                Effect.logWarning(`office ${floor.userId}: bin array read failed: ${error.message}`).pipe(
                  Effect.as(null),
                ),
              ),
            )
        : kind === "rebalance"
          ? null
          : 0;
    const checks = checkManage(floor.guardrails, {
      kind,
      officePosition: floor.book.open.some((j) => !j.simulated && j.positionAddress === proposal.positionAddress),
      walletSol: floor.walletSol,
      positionRentSol: floor.positionRentSol,
      setupSol,
      book: floor.book,
      rebalanceManaged: managed.has(proposal.poolAddress),
      lastExecutionAt: yield* db.lastExecutionAt(floor.userId, proposal.poolAddress),
      now: floor.now,
    });
    const failed = checks.filter((c) => !c.ok).map((c) => c.rule);
    if (failed.length > 0) {
      return yield* reject({ checks, llm: null }, `Vetoed the ${kind} of ${name}: ${failed.join(", ")}.`);
    }
    yield* db.move(floor.userId, proposal.id, "draft", "risk_checked", { riskNotes: { checks, llm: null } });
    yield* say(floor, "risk", `The ${kind} of ${name} passed every check.`, "good", {
      poolAddress: proposal.poolAddress,
      proposalId: proposal.id,
    });
  });

/** The card summary for a rebalance, claim or close, written in code: the Monitor's reason is already plain. */
export function manageSummary(proposal: Pick<ProposalRow, "kind" | "params" | "rationale">) {
  switch (proposal.kind) {
    case "rebalance": {
      const p = PROPOSAL_PARAMS.rebalance.safeParse(proposal.params);
      const range = p.success ? ` to bins ${p.data.lowerBin}..${p.data.upperBin}` : "";
      return `Re-center the position${range}. ${proposal.rationale}`;
    }
    case "claim":
      return `Claim the position's fees. ${proposal.rationale}`;
    case "close":
      return `Close the position and swap it back to SOL. ${proposal.rationale}`;
    case "open":
      return proposal.rationale;
  }
}

/**
 * Puts a checked proposal in front of the owner, on the web and on Telegram. Under autopilot, one that moves no more
 * than the limit is then approved on the owner's behalf, through the same lifecycle move as their approval.
 */
const present = (floor: Floor, proposal: ProposalRow, summary: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const moved = yield* db.move(floor.userId, proposal.id, "risk_checked", "awaiting_approval", {
      summary,
      expiresAt: new Date(floor.now + floor.guardrails.approvalTtlSec * 1000),
    });
    if (!moved) return;
    const name = proposal.poolName ?? "A pool";
    const where = { poolAddress: proposal.poolAddress, proposalId: proposal.id };
    const held = floor.book.open.find(
      (j) => j.positionAddress !== null && j.positionAddress === proposal.positionAddress,
    );
    const verdict = autopilotVerdict(floor.row.mode, floor.guardrails, proposal, held?.amountSol ?? null);
    const approved = verdict.approve
      ? yield* db.autopilotApprove(floor.userId, proposal.id, new Date(floor.now))
      : null;
    if (approved && verdict.nominalSol !== null) {
      const limitSol = floor.guardrails.autopilotMaxSol;
      const text = `Autopilot approved the ${KIND_TEXT[proposal.kind]} of ${name}: ${verdict.nominalSol.toFixed(4)} SOL, within the ${limitSol} SOL limit.`;
      yield* say(floor, "manager", text, "good", where);
      return yield* sendCard(floor, approved, { nominalSol: verdict.nominalSol, limitSol });
    }
    const why =
      floor.row.mode !== "autopilot"
        ? ""
        : verdict.nominalSol === null
          ? " Autopilot left it to you: the amount it moves is unknown."
          : verdict.nominalSol > floor.guardrails.autopilotMaxSol
            ? ` Autopilot left it to you: ${verdict.nominalSol.toFixed(4)} SOL is over the ${floor.guardrails.autopilotMaxSol} SOL limit.`
            : "";
    yield* say(floor, "manager", `${name} is ready for your approval.${why}`, "info", where);
    yield* sendCard(floor, moved);
  });

const KIND_TEXT = { open: "open", rebalance: "rebalance", claim: "fee claim", close: "close" } as const;

/** The Manager summarises each checked proposal and puts it in front of the owner, on the web and on Telegram. */
export const presentChecked = (floor: Floor) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const checked = yield* db.proposals(floor.userId, ["risk_checked"]);
    for (const proposal of checked) {
      if (proposal.kind !== "open") {
        yield* present(floor, proposal, manageSummary(proposal));
        continue;
      }
      if (!floor.models.manager) continue;
      const params = PROPOSAL_PARAMS.open.safeParse(proposal.params);
      if (!params.success) continue;
      const notes = RiskNotes.safeParse(proposal.riskNotes);
      const answer = yield* ask(floor, "manager", managerPrompt, {
        poolName: proposal.poolName,
        params: params.data,
        rationale: proposal.rationale,
        riskNote: notes.success ? (notes.data.llm?.note ?? null) : null,
      });
      if (Option.isNone(answer)) return;
      yield* present(floor, proposal, answer.value.value.summary);
    }
  });
