import type { Keypair } from "@solana/web3.js";
import { checkManage, openMoneyChecks, storedDayCapital } from "@vexis/db/guardrails";
import {
  EXECUTION_FAILING,
  type GuardrailCheck,
  Guardrails,
  isPaused,
  OFFICE_SLIPPAGE_BPS,
  PROPOSAL_PARAMS,
  type ProposalKind,
  pauseOf,
  RiskNotes,
  utcDayStart,
} from "@vexis/db/office";
import { Clock, Effect } from "effect";
import { lamportsToSol, solToLamports } from "../rebalance/fees.ts";
import { Chain } from "../services/chain.ts";
import { Db } from "../services/db.ts";
import { type OfficeConfigRow, OfficeDb, type OfficeWallet, type ProposalRow } from "../services/office-db.ts";
import { WalletLock } from "../services/wallet-lock.ts";
import { Zap } from "../services/zap.ts";

/** Wallets executed at once. A wallet's proposals run one after another, under the same lock as auto-rebalance. */
const WALLET_CONCURRENCY = 4;

type Ready = Extract<OfficeWallet, { _tag: "ready" }>;
type Office = { readonly row: OfficeConfigRow; readonly g: Guardrails; readonly wallet: Ready };

const nameOf = (p: ProposalRow) => p.poolName ?? p.poolAddress.slice(0, 6);
const leadingFailures = (rows: ReadonlyArray<{ readonly status: string }>) => {
  const ok = rows.findIndex((r) => r.status !== "failed");
  return ok === -1 ? rows.length : ok;
};

const say = (p: ProposalRow, agent: "executor" | "manager", text: string, tone: "info" | "good" | "warn" | "bad") =>
  Effect.gen(function* () {
    yield* (yield* OfficeDb).message(p.userId, {
      agent,
      text,
      tone,
      poolAddress: p.poolAddress,
      proposalId: p.id,
    });
  });

/**
 * One minute of the office's Executor: every approved proposal, re-checked against the guardrails right before it
 * runs, then simulated (Preview) or signed and sent (Live). Only the runner moves an office's funds.
 */
export const officeExecutor = Effect.fn("office.executor")(function* () {
  const db = yield* OfficeDb;
  const lock = yield* WalletLock;
  const waiting = new Set(yield* db.usersWithApproved());
  if (waiting.size === 0) return;
  const byWallet = new Map<string, Office[]>();
  for (const row of (yield* db.offices()).filter((o) => waiting.has(o.userId))) {
    const g = Guardrails.safeParse(row.guardrails);
    if (!g.success) {
      yield* Effect.logWarning(`office ${row.userId}: guardrails do not parse, nothing executed`);
      continue;
    }
    const wallet = yield* db.wallet(row);
    if (wallet._tag !== "ready") {
      yield* refuseAll(row.userId, wallet._tag === "missing" ? "no wallet or RPC URL" : "the RPC URL does not decrypt");
      continue;
    }
    byWallet.set(wallet.owner, [...(byWallet.get(wallet.owner) ?? []), { row, g: g.data, wallet }]);
  }
  yield* Effect.forEach(
    byWallet,
    ([owner, offices]) =>
      lock.withWallet(
        owner,
        Effect.forEach(offices, (office) =>
          runOffice(office).pipe(
            Effect.catchTag("DbError", (error) =>
              Effect.logError(`office ${office.row.userId} executor failed: ${error.operation}`, error.cause),
            ),
          ),
        ),
      ),
    { concurrency: WALLET_CONCURRENCY, discard: true },
  );
});

/** Approved proposals that cannot run at all go back to the owner as rejected, not left waiting forever. */
const refuseAll = (userId: string, why: string) =>
  Effect.gen(function* () {
    const db = yield* OfficeDb;
    for (const p of yield* db.proposals(userId, ["approved"])) {
      const notes: RiskNotes = { checks: [{ rule: "wallet", ok: false, value: why }], llm: null };
      if (yield* db.move(userId, p.id, "approved", "rejected", { decidedBy: "risk", riskNotes: notes })) {
        yield* say(p, "executor", `Did not run the ${p.kind} of ${nameOf(p)}: ${why}.`, "bad");
      }
    }
  });

const runOffice = (office: Office) =>
  Effect.gen(function* () {
    const db = yield* OfficeDb;
    const { userId } = office.row;
    for (const p of yield* db.proposals(userId, ["approved"])) {
      const now = yield* Clock.currentTimeMillis;
      // A daily-loss or failure pause stops what was approved before it; the kill switch already rejected them.
      if (isPaused(pauseOf(office.row), now)) {
        if (yield* db.move(userId, p.id, "approved", "rejected", { decidedBy: "system" })) {
          yield* say(p, "executor", `The office is paused, so the ${p.kind} of ${nameOf(p)} did not run.`, "warn");
        }
        continue;
      }
      const stop = yield* execute(office, p, now).pipe(
        Effect.catchTag("ChainError", (error) =>
          Effect.logWarning(`office ${userId}: read for ${p.id} failed, retrying next minute`, error.cause).pipe(
            Effect.as(false),
          ),
        ),
      );
      if (stop) return;
    }
  });

/** The guardrails as they stand now, from a fresh balance read. */
const recheck = (office: Office, p: ProposalRow, kind: ProposalKind, walletSol: number, now: number) =>
  Effect.gen(function* () {
    const db = yield* OfficeDb;
    const { userId } = office.row;
    const book = yield* db.book(userId, utcDayStart(now));
    const managed = (yield* db.rebalancePools(userId)).has(p.poolAddress);
    const lastExecutionAt = yield* db.lastExecutionAt(userId, p.poolAddress);
    if (kind === "open") {
      const params = PROPOSAL_PARAMS.open.safeParse(p.params);
      if (!params.success) return [{ rule: "params", ok: false, value: "the parameters do not parse" }];
      return openMoneyChecks(office.g, params.data.amountSol, {
        walletSol,
        dayStartCapital: storedDayCapital(office.row, now),
        book,
        rebalanceManaged: managed,
        lastExecutionAt,
        now,
      });
    }
    return checkManage(office.g, {
      kind,
      officePosition: book.open.some((j) => !j.simulated && j.positionAddress === p.positionAddress),
      walletSol,
      book,
      rebalanceManaged: managed,
      lastExecutionAt,
      now,
    });
  });

type Outcome =
  | { readonly _tag: "done"; readonly signature: string | null; readonly note: string }
  | { readonly _tag: "failed"; readonly error: string };

const done = (signature: string | null, note: string): Outcome => ({ _tag: "done", signature, note });
const failed = (error: string): Outcome => ({ _tag: "failed", error });
const NO_POSITION = failed("the proposal names no position");
const BAD_PARAMS = failed("the parameters do not parse");

/** Runs one approved proposal. True when the office paused itself and the rest must wait. */
const execute = (office: Office, p: ProposalRow, now: number) =>
  Effect.gen(function* () {
    const db = yield* OfficeDb;
    const chain = yield* Chain;
    const { userId, live } = office.row;
    const state = yield* chain.pool(office.wallet.rpcUrl, p.poolAddress, office.wallet.owner);
    const checks: GuardrailCheck[] = yield* recheck(office, p, p.kind, lamportsToSol(state.nativeLamports), now);
    const failed = checks.filter((c) => !c.ok).map((c) => c.rule);
    if (failed.length > 0) {
      const prior = RiskNotes.safeParse(p.riskNotes);
      const notes: RiskNotes = { checks, llm: prior.success ? prior.data.llm : null };
      if (yield* db.move(userId, p.id, "approved", "rejected", { decidedBy: "risk", riskNotes: notes })) {
        yield* say(p, "executor", `Stopped the ${p.kind} of ${nameOf(p)} before signing: ${failed.join(", ")}.`, "bad");
      }
      return false;
    }
    const claimed = yield* db.move(userId, p.id, "approved", "executing", { simulated: !live });
    if (!claimed) return false;

    const outcome = live ? yield* send(office, claimed) : yield* simulate(claimed);
    if (outcome._tag === "done") {
      yield* db.move(userId, p.id, "executing", "done", { signature: outcome.signature });
      yield* say(p, "executor", outcome.note, "good");
      return false;
    }
    yield* db.move(userId, p.id, "executing", "failed", { txError: outcome.error.slice(0, 500) });
    yield* say(p, "executor", `The ${p.kind} of ${nameOf(p)} failed: ${outcome.error}`, "bad");
    const streak = leadingFailures(yield* db.liveExecutions(userId, office.g.maxConsecutiveFailures));
    if (streak < office.g.maxConsecutiveFailures) return false;
    yield* db.pause(userId, EXECUTION_FAILING);
    yield* say(p, "manager", `${streak} executions failed in a row. Pausing the office until you resume it.`, "bad");
    return true;
  });

/** Preview: the MVP's simulation. An open gets a simulated journal row; nothing is signed or sent. */
const simulate = (p: ProposalRow) =>
  Effect.gen(function* () {
    const db = yield* OfficeDb;
    const open = p.kind === "open" ? PROPOSAL_PARAMS.open.safeParse(p.params) : null;
    if (open?.success) {
      yield* db.insertJournal(p.userId, {
        openProposalId: p.id,
        poolAddress: p.poolAddress,
        poolName: p.poolName,
        simulated: true,
        amountSol: open.data.amountSol,
        amountUsd: open.data.solUsd === null ? null : open.data.amountSol * open.data.solUsd,
        openReason: p.rationale,
        pnlSol: null,
        pnlUsd: null,
      });
    }
    const what = open?.success
      ? `opened ${open.data.amountSol} SOL in ${nameOf(p)}`
      : `ran the ${p.kind} on ${nameOf(p)}`;
    return done(null, `Preview: ${what}. Nothing was signed or sent.`);
  });

/** Live: decrypts the office's wallet through `Db.walletSigner` and sends through `Zap`. */
const send = (office: Office, p: ProposalRow) =>
  Effect.gen(function* () {
    const signer = yield* (yield* Db).walletSigner(office.row.userId, office.row.walletSource);
    if (signer._tag !== "ready") {
      const why = signer._tag === "missing" ? "no wallet secret is saved" : "the wallet secret does not decrypt";
      return failed(why);
    }
    return yield* act(office, p, signer.signer).pipe(
      Effect.catchTag("ZapError", (error) => Effect.succeed(failed(error.message))),
    );
  });

const act = (office: Office, p: ProposalRow, signer: Keypair) =>
  Effect.gen(function* () {
    const db = yield* OfficeDb;
    const zap = yield* Zap;
    const rpc = office.wallet.rpcUrl;
    const now = new Date(yield* Clock.currentTimeMillis);
    const position = p.positionAddress;
    switch (p.kind) {
      case "open": {
        const parsed = PROPOSAL_PARAMS.open.safeParse(p.params);
        if (!parsed.success) return BAD_PARAMS;
        const params = parsed.data;
        const opened = yield* zap.open(rpc, signer, {
          poolAddress: p.poolAddress,
          strategy: params.strategy,
          lowerBin: params.lowerBin,
          upperBin: params.upperBin,
          amountSol: params.amountSol,
          singleSidedSol: params.singleSidedSol,
          slippageBps: OFFICE_SLIPPAGE_BPS,
          reserveLamports: solToLamports(office.g.solReserve),
        });
        yield* db.insertJournal(p.userId, {
          openProposalId: p.id,
          poolAddress: p.poolAddress,
          poolName: p.poolName,
          positionAddress: opened.positionAddress,
          walletAddress: office.wallet.owner,
          simulated: false,
          amountSol: params.amountSol,
          amountUsd: params.solUsd === null ? null : params.amountSol * params.solUsd,
          // Worth its cost until the Monitor's first read, a minute later.
          valueSol: params.amountSol,
          valuedAt: now,
          openReason: p.rationale,
          pnlSol: null,
          pnlUsd: null,
        });
        return done(opened.signature, `Opened ${params.amountSol} SOL in ${nameOf(p)}: ${opened.signature}`);
      }
      case "rebalance": {
        const parsed = PROPOSAL_PARAMS.rebalance.safeParse(p.params);
        if (!parsed.success) return BAD_PARAMS;
        if (!position) return NO_POSITION;
        const params = parsed.data;
        const signature = yield* zap.rebalance(rpc, signer, {
          poolAddress: p.poolAddress,
          positionAddress: position,
          strategy: params.strategy,
          slippageBps: OFFICE_SLIPPAGE_BPS,
          halfWidth: Math.max(1, Math.floor((params.upperBin - params.lowerBin) / 2)),
        });
        return done(signature, `Re-centered ${nameOf(p)}: ${signature}`);
      }
      case "claim": {
        if (!position) return NO_POSITION;
        const signature = yield* zap.claimFees(rpc, signer, { poolAddress: p.poolAddress, positionAddress: position });
        const note = signature ? `Claimed the fees of ${nameOf(p)}: ${signature}` : `${nameOf(p)} had no fees left.`;
        return done(signature, note);
      }
      case "close": {
        const parsed = PROPOSAL_PARAMS.close.safeParse(p.params);
        if (!parsed.success) return BAD_PARAMS;
        if (!position) return NO_POSITION;
        const params = parsed.data;
        const journal = (yield* db.book(p.userId, now)).open.find((j) => j.positionAddress === position);
        const closed = yield* zap.close(rpc, signer, {
          poolAddress: p.poolAddress,
          positionAddress: position,
          swapToSol: true,
          slippageBps: OFFICE_SLIPPAGE_BPS,
        });
        if (journal) {
          yield* db.closeJournal(p.userId, journal.id, {
            closeReason: params.reason,
            closeProposalId: p.id,
            pnlSol: null,
            pnlUsd: null,
          });
        }
        const swap = closed.swapError
          ? ` The swap back to SOL failed (${closed.swapError}); the tokens stay in the wallet.`
          : "";
        return done(closed.signature, `Closed ${nameOf(p)}: ${closed.signature}.${swap}`);
      }
    }
  });
