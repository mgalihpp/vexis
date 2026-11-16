import { getDb } from "@vexis/db/client";
import {
  AgentModel,
  activeModels,
  type Guardrails,
  type KeySource,
  KILL_SWITCH,
  LLM_AGENTS,
  LLM_PROVIDERS,
  type LlmProvider,
  type OfficeAgent,
  type OfficeModels,
  OPEN_STATUSES,
  PROPOSAL_PARAMS,
  parseGuardrails,
  RiskNotes,
  utcDayStart,
  type WalletSource,
} from "@vexis/db/office";
import {
  clearPause,
  closeJournal,
  getOfficeConfig,
  getProposal,
  journalPnl,
  latestRuns,
  listJournal,
  listMessages,
  listProposals,
  llmSpendToday,
  type MessageRow,
  moveProposal,
  type OfficeConfigRow,
  type ProposalRow,
  proposalCountsSince,
  rejectUnexecuted,
  updateOfficeConfig,
} from "@vexis/db/office-queries";
import { forUser, getRebalanceWallet } from "@vexis/db/queries";
import { encryptSecret } from "@vexis/db/secret";
import { checkRpcUrl, keypairOf, rpcHost } from "@/features/agents/wallet.server";
import type { ConfigView, MessageView, OfficeData, ProposalView } from "./office";
import { pauseView } from "./office";

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
  const [open, recent, messages, runs, positions, pnl, spend, counts, userWallet] = await Promise.all([
    listProposals(s, { statuses: OPEN_STATUSES, limit: 100 }),
    listProposals(s, { limit: 10 }),
    listMessages(s, { limit: 60 }),
    latestRuns(s, 50),
    listJournal(s, { openOnly: true, limit: 100 }),
    journalPnl(s, utcDayStart(now)),
    llmSpendToday(s, now),
    proposalCountsSince(s, utcDayStart(now)),
    getRebalanceWallet(s),
  ]);
  const proposals = [...new Map([...open, ...recent].map((p) => [p.id, p])).values()];

  const view: ConfigView = {
    mode: config.mode,
    paused: config.paused,
    pausedReason: config.pausedReason,
    pausedUntil: config.pausedUntil?.getTime() ?? null,
    guardrails: parseGuardrails(config.guardrails),
    models: activeModels(config.keySource, modelsOf(config.models)),
    keySource: config.keySource,
    vexisDailyUsd: config.vexisDailyUsd,
    savedKeys: savedKeysOf(config.llmKeys),
    walletSource: config.walletSource,
    userWallet: userWallet ? { publicKey: userWallet.publicKey, rpcHost: rpcHost(userWallet.rpcUrl) } : null,
    officeWallet: config.officePublicKey
      ? { publicKey: config.officePublicKey, rpcHost: rpcHost(config.officeRpcUrl) }
      : null,
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
      error: r.error,
      at: r.at.getTime(),
    })),
    positions: positions.map((j) => ({
      id: j.id,
      poolAddress: j.poolAddress,
      poolName: j.poolName,
      simulated: j.simulated,
      amountSol: j.amountSol,
      amountUsd: j.amountUsd,
      openReason: j.openReason,
      openedAt: j.openedAt.getTime(),
    })),
    pnl,
    spend: spend.map((r) => ({ provider: r.provider, keySource: r.keySource, usd: r.usd, runs: r.runs })),
    today: Object.fromEntries(counts.map((c) => [c.status, c.count])),
  };
}

export async function loadFeed(userId: string, filter: { agent?: OfficeAgent; pool?: string }) {
  const rows = await listMessages(scope(userId), { agent: filter.agent, poolAddress: filter.pool, limit: 100 });
  return rows.map(messageView);
}

// --- approvals ---------------------------------------------------------------------------------

/**
 * The owner's decision on a waiting proposal. An approval is refused once the proposal expired or while the
 * office is paused; a proposal another actor moved first (expired, killed) is refused too.
 */
export async function decideProposal(userId: string, proposalId: string, decision: "approve" | "reject") {
  const s = scope(userId);
  const [config, proposal] = await Promise.all([getOfficeConfig(s), getProposal(s, proposalId)]);
  if (!config) throw new Error(NO_OFFICE);
  if (!proposal) throw new Error("Proposal not found");
  const decided = new Error("This proposal was already decided");
  if (proposal.status !== "awaiting_approval") throw decided;
  if (decision === "approve") {
    const now = Date.now();
    if (proposal.expiresAt.getTime() <= now) throw new Error("This proposal expired");
    const pause = pauseView({ ...config, pausedUntil: config.pausedUntil?.getTime() ?? null }, now);
    if (pause.state === "paused") throw new Error("The office is paused; nothing can be approved");
  }
  const to = decision === "approve" ? "approved" : "rejected";
  const moved = await moveProposal(s, proposalId, "awaiting_approval", to, { decidedBy: "owner" });
  if (!moved) throw decided;
}

// --- pause -------------------------------------------------------------------------------------

/** Pauses the office and rejects every proposal that has not started executing. Returns how many. */
export async function killSwitch(userId: string) {
  return getDb().transaction(async (tx) => {
    const s = forUser(tx, userId);
    const paused = await updateOfficeConfig(s, { paused: true, pausedReason: KILL_SWITCH, pausedUntil: null });
    if (!paused) throw new Error(NO_OFFICE);
    return rejectUnexecuted(s, "kill_switch");
  });
}

/** Lifts a pause the owner may lift; an admin stop or a daily-loss pause before its time stays. */
export async function resumeOffice(userId: string) {
  const s = scope(userId);
  const config = await getOfficeConfig(s);
  if (!config) throw new Error(NO_OFFICE);
  const now = new Date();
  const pause = pauseView({ ...config, pausedUntil: config.pausedUntil?.getTime() ?? null }, now.getTime());
  if (pause.state === "running") return;
  if (!pause.canResume || !pause.reason) throw new Error("This pause cannot be lifted from here");
  if (!(await clearPause(s, pause.reason, now))) throw new Error("The pause changed; reload the page");
}

// --- positions ---------------------------------------------------------------------------------

/** Closes a simulated position by hand. Its PnL stays unknown: nothing was priced. */
export async function closeSimulated(userId: string, journalId: string) {
  const s = scope(userId);
  const open = await listJournal(s, { openOnly: true, limit: 500 });
  const row = open.find((j) => j.id === journalId);
  if (!row) throw new Error("This position is already closed");
  if (!row.simulated) throw new Error("Only simulated positions can be closed here");
  const closed = await closeJournal(s, journalId, { closeReason: "manual", pnlSol: null, pnlUsd: null });
  if (!closed) throw new Error("This position is already closed");
}

// --- settings ----------------------------------------------------------------------------------

async function patch(userId: string, values: Parameters<typeof updateOfficeConfig>[1]) {
  if (!(await updateOfficeConfig(scope(userId), values))) throw new Error(NO_OFFICE);
}

export const saveModels = (userId: string, models: OfficeModels) => patch(userId, { models });

export const saveGuardrails = (userId: string, guardrails: Guardrails) => patch(userId, { guardrails });

export const saveKeySource = (userId: string, keySource: KeySource) => patch(userId, { keySource });

async function keysOf(userId: string) {
  const config = await getOfficeConfig(scope(userId));
  if (!config) throw new Error(NO_OFFICE);
  return config.llmKeys;
}

/** Stores the owner's own API key for a provider, encrypted with TOKEN_ENC_KEY. */
export async function saveLlmKey(userId: string, provider: LlmProvider, key: string) {
  const keys = await keysOf(userId);
  await patch(userId, { llmKeys: { ...keys, [provider]: encryptSecret(key, "TOKEN_ENC_KEY") } });
}

export async function removeLlmKey(userId: string, provider: LlmProvider) {
  const { [provider]: _, ...rest } = await keysOf(userId);
  await patch(userId, { llmKeys: rest });
}

/** Saves the office's own wallet and switches the office to it. Only the public key is ever read back. */
export async function saveOfficeWallet(userId: string, secret: string, rpcUrl: string) {
  const publicKey = keypairOf(secret).publicKey.toBase58();
  await checkRpcUrl(rpcUrl);
  await patch(userId, {
    walletSource: "office",
    officePublicKey: publicKey,
    officeSecretKey: encryptSecret(secret, "WALLET_ENC_KEY"),
    officeRpcUrl: encryptSecret(rpcUrl, "WALLET_ENC_KEY"),
  });
}

export async function removeOfficeWallet(userId: string) {
  await patch(userId, { walletSource: "user", officePublicKey: null, officeSecretKey: null, officeRpcUrl: null });
}

export async function saveWalletSource(userId: string, walletSource: WalletSource) {
  if (walletSource === "office") {
    const config = await getOfficeConfig(scope(userId));
    if (!config?.officePublicKey) throw new Error("Save an office wallet first");
  }
  await patch(userId, { walletSource });
}
