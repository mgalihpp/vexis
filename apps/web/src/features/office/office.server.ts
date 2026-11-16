import { getDb } from "@vexis/db/client";
import {
  AgentModel,
  activeModels,
  type Guardrails,
  type KeySource,
  LLM_AGENTS,
  LLM_PROVIDERS,
  type LlmProvider,
  type OfficeAgent,
  type OfficeModels,
  type OfficeScreen,
  OPEN_STATUSES,
  PROPOSAL_PARAMS,
  parseGuardrails,
  parseScreen,
  REFUSAL_TEXT,
  RiskNotes,
  utcDayStart,
  type WalletSource,
} from "@vexis/db/office";
import {
  closeJournal,
  decideProposal as decide,
  getOfficeConfig,
  insertProposal,
  journalPnl,
  killOffice,
  latestRuns,
  listJournal,
  listMessages,
  listProposals,
  listThreads,
  llmSpendToday,
  type MessageRow,
  type OfficeConfigRow,
  type ProposalRow,
  proposalCountsSince,
  resumeOffice as resume,
  updateOfficeConfig,
} from "@vexis/db/office-queries";
import { forUser, getRebalanceWallet } from "@vexis/db/queries";
import { encryptSecret, sealSecret } from "@vexis/db/secret";
import { checkRpcUrl, keypairOf } from "@/features/agents/wallet.server";
import type { ConfigView, MessageView, OfficeData, ProposalView } from "./office";

// Every function takes the signed-in user's id from the viewer middleware and goes through `forUser`, so the
// office of one user is never read or written by another. API keys, the office wallet's secret and its RPC URL
// are encrypted on the way in and never read back.

const scope = (userId: string) => forUser(getDb(), userId);

const NO_OFFICE = "The office is not enabled for this account";

/** A model the price table no longer lists reads as not running, like the runner sees it. */
function modelsOf(raw: Record<string, unknown>): OfficeModels {
  return Object.fromEntries(
    LLM_AGENTS.map((agent) => {
      const parsed = AgentModel.safeParse(raw[agent]);
      return [agent, parsed.success ? parsed.data : null];
    }),
  ) as OfficeModels;
}

const savedKeysOf = (keys: OfficeConfigRow["llmKeys"]) => LLM_PROVIDERS.filter((p) => Boolean(keys[p]));

function proposalView(row: ProposalRow): ProposalView {
  const params = PROPOSAL_PARAMS[row.kind].safeParse(row.params);
  const risk = RiskNotes.safeParse(row.riskNotes);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    poolAddress: row.poolAddress,
    poolName: row.poolName,
    rationale: row.rationale,
    summary: row.summary,
    proposedBy: row.proposedBy,
    decidedBy: row.decidedBy,
    params: params.success ? params.data : null,
    risk: risk.success ? risk.data : null,
    expiresAt: row.expiresAt.getTime(),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  } as ProposalView;
}

const messageView = (m: MessageRow): MessageView => ({
  id: m.id,
  agent: m.agent,
  text: m.text,
  tone: m.tone,
  poolAddress: m.poolAddress,
  proposalId: m.proposalId,
  at: m.at.getTime(),
});

export async function loadOffice(userId: string): Promise<OfficeData> {
  const s = scope(userId);
  const config = await getOfficeConfig(s);
  if (!config) return { enabled: false };

  const now = new Date();
  const [open, recent, messages, runs, threads, positions, pnl, spend, counts, userWallet] = await Promise.all([
    listProposals(s, { statuses: OPEN_STATUSES, limit: 100 }),
    listProposals(s, { limit: 10 }),
    listMessages(s, { limit: 60 }),
    latestRuns(s, 50),
    listThreads(s),
    listJournal(s, { openOnly: true, limit: 100 }),
    journalPnl(s, utcDayStart(now)),
    llmSpendToday(s, now),
    proposalCountsSince(s, utcDayStart(now)),
    getRebalanceWallet(s),
  ]);
  const proposals = [...new Map([...open, ...recent].map((p) => [p.id, p])).values()];

  const view: ConfigView = {
    mode: config.mode,
    live: config.live,
    paused: config.paused,
    pausedReason: config.pausedReason,
    pausedUntil: config.pausedUntil?.getTime() ?? null,
    guardrails: parseGuardrails(config.guardrails),
    models: activeModels(config.keySource, modelsOf(config.models)),
    keySource: config.keySource,
    vexisDailyUsd: config.vexisDailyUsd,
    savedKeys: savedKeysOf(config.llmKeys),
    walletSource: config.walletSource,
    userWallet: userWallet ? { publicKey: userWallet.publicKey, rpcHost: userWallet.rpcHost } : null,
    officeWallet: config.officePublicKey ? { publicKey: config.officePublicKey, rpcHost: config.officeRpcHost } : null,
    screen: parseScreen(config),
  };

  return {
    enabled: true,
    now: now.getTime(),
    config: view,
    proposals: proposals.map(proposalView),
    messages: messages.map(messageView),
    runs: runs.map((r) => ({
      agent: r.agent,
      provider: r.provider,
      model: r.model,
      promptVersion: r.promptVersion,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
      error: r.error,
      at: r.at.getTime(),
    })),
    threads: threads.map((t) => ({
      agent: t.agent,
      provider: t.provider,
      model: t.model,
      keySource: t.keySource,
      promptVersion: t.promptVersion,
      system: t.system,
      user: t.userMessage,
      reply: t.reply,
      inputTokens: t.inputTokens,
      outputTokens: t.outputTokens,
      costUsd: t.costUsd,
      durationMs: t.durationMs,
      error: t.error,
      at: t.at.getTime(),
    })),
    positions: positions.map((j) => ({
      id: j.id,
      poolAddress: j.poolAddress,
      poolName: j.poolName,
      simulated: j.simulated,
      amountSol: j.amountSol,
      amountUsd: j.amountUsd,
      valueSol: j.valueSol,
      openReason: j.openReason,
      openedAt: j.openedAt.getTime(),
    })),
    pnl,
    spend: spend.map((r) => ({
      agent: r.agent,
      provider: r.provider,
      model: r.model,
      keySource: r.keySource,
      usd: r.usd,
      runs: r.runs,
    })),
    today: Object.fromEntries(counts.map((c) => [c.status, c.count])),
  };
}

export async function loadFeed(userId: string, filter: { agent?: OfficeAgent; pool?: string }) {
  const rows = await listMessages(scope(userId), { agent: filter.agent, poolAddress: filter.pool, limit: 100 });
  return rows.map(messageView);
}

// --- approvals ---------------------------------------------------------------------------------

/** The owner's decision on a waiting proposal, through the same path as the Telegram card. */
export async function decideProposal(userId: string, proposalId: string, decision: "approve" | "reject") {
  const result = await decide(scope(userId), proposalId, decision, new Date());
  if (!result.ok) throw new Error(REFUSAL_TEXT[result.refusal]);
}

// --- pause -------------------------------------------------------------------------------------

/** Pauses the office and rejects every proposal that has not started executing; `/stop` does the same. */
export async function killSwitch(userId: string) {
  const rejected = await killOffice(scope(userId));
  if (rejected === null) throw new Error(NO_OFFICE);
  return rejected;
}

/** Lifts a pause the owner may lift; an admin stop or a daily-loss pause before its time stays. */
export async function resumeOffice(userId: string) {
  const result = await resume(scope(userId), new Date());
  if (result === "no_office") throw new Error(NO_OFFICE);
  if (result === "locked") throw new Error("This pause cannot be lifted from here");
  if (result === "changed") throw new Error("The pause changed; reload the page");
}

// --- positions ---------------------------------------------------------------------------------

/**
 * Closes a position by hand. A simulated one is marked closed at once, its PnL unknown. A real one becomes a close
 * proposal that goes through the guardrails and comes back for approval, so only the runner ever signs.
 */
export async function closePosition(userId: string, journalId: string) {
  const s = scope(userId);
  const config = await getOfficeConfig(s);
  if (!config) throw new Error(NO_OFFICE);
  const open = await listJournal(s, { openOnly: true, limit: 500 });
  const row = open.find((j) => j.id === journalId);
  if (!row) throw new Error("This position is already closed");
  if (row.simulated) {
    const closed = await closeJournal(s, journalId, { closeReason: "manual", pnlSol: null, pnlUsd: null });
    if (!closed) throw new Error("This position is already closed");
    return;
  }
  if (!row.positionAddress) throw new Error("This position has no on-chain address");
  const proposal = await insertProposal(s, {
    kind: "close",
    poolAddress: row.poolAddress,
    poolName: row.poolName,
    positionAddress: row.positionAddress,
    params: { reason: "manual" },
    rationale: "You asked to close it.",
    proposedBy: "owner",
    expiresAt: new Date(Date.now() + parseGuardrails(config.guardrails).approvalTtlSec * 1000),
  });
  if (!proposal) throw new Error("This pool already has a proposal in progress");
}

/** Preview or Live for the whole office; the Executor reads it before each approved proposal. */
export const saveLive = (userId: string, live: boolean) => patch(userId, { live });

/** The office's wallet cannot change under real open positions: the Monitor and the Executor would lose them. */
async function refuseWithOpenPositions(userId: string) {
  const open = await listJournal(scope(userId), { openOnly: true, limit: 500 });
  if (open.some((j) => !j.simulated)) throw new Error("Close the office's real positions before changing its wallet");
}

// --- settings ----------------------------------------------------------------------------------

async function patch(userId: string, values: Parameters<typeof updateOfficeConfig>[1]) {
  if (!(await updateOfficeConfig(scope(userId), values))) throw new Error(NO_OFFICE);
}

export const saveModels = (userId: string, models: OfficeModels) => patch(userId, { models });

export const saveGuardrails = (userId: string, guardrails: Guardrails) => patch(userId, { guardrails });

export const saveKeySource = (userId: string, keySource: KeySource) => patch(userId, { keySource });

/** A preset keeps the stored custom filter, so picking Custom again restores it. Custom needs one, given or stored. */
export async function saveScreen(userId: string, preset: OfficeScreen["preset"], custom?: OfficeScreen["custom"]) {
  if (preset === "custom" && !custom) {
    const config = await getOfficeConfig(scope(userId));
    if (!config) throw new Error(NO_OFFICE);
    if (!config.poolFilter) throw new Error("Hand a filter over from the screener first");
  }
  await patch(userId, { poolPreset: preset, ...(custom ? { poolFilter: custom } : {}) });
}

/** Whether the viewer has an office, for the screener's hand-off button. One primary-key read. */
export const hasOffice = async (userId: string) => Boolean(await getOfficeConfig(scope(userId)));

async function keysOf(userId: string) {
  const config = await getOfficeConfig(scope(userId));
  if (!config) throw new Error(NO_OFFICE);
  return config.llmKeys;
}

/** Stores the owner's own API key for a provider, encrypted with LLM_ENC_KEY. */
export async function saveLlmKey(userId: string, provider: LlmProvider, key: string) {
  const keys = await keysOf(userId);
  await patch(userId, { llmKeys: { ...keys, [provider]: encryptSecret(key, "LLM_ENC_KEY") } });
}

export async function removeLlmKey(userId: string, provider: LlmProvider) {
  const { [provider]: _, ...rest } = await keysOf(userId);
  await patch(userId, { llmKeys: rest });
}

/** Saves the office's own wallet and switches the office to it. Only the public key is ever read back. */
export async function saveOfficeWallet(userId: string, secret: string, rpcUrl: string) {
  await refuseWithOpenPositions(userId);
  const publicKey = keypairOf(secret).publicKey.toBase58();
  await checkRpcUrl(rpcUrl);
  await patch(userId, {
    walletSource: "office",
    officePublicKey: publicKey,
    officeSecretKey: sealSecret(secret),
    officeRpcUrl: encryptSecret(rpcUrl, "RPC_ENC_KEY"),
    officeRpcHost: new URL(rpcUrl).host,
  });
}

export async function removeOfficeWallet(userId: string) {
  await refuseWithOpenPositions(userId);
  await patch(userId, {
    walletSource: "user",
    officePublicKey: null,
    officeSecretKey: null,
    officeRpcUrl: null,
    officeRpcHost: null,
  });
}

export async function saveWalletSource(userId: string, walletSource: WalletSource) {
  await refuseWithOpenPositions(userId);
  if (walletSource === "office") {
    const config = await getOfficeConfig(scope(userId));
    if (!config?.officePublicKey) throw new Error("Save an office wallet first");
  }
  await patch(userId, { walletSource });
}
