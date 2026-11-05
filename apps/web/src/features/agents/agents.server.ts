import { VolumeWatchConfig as ConfigSchema, defaultAgentConfig } from "@vexis/db/agents";
import { getDb } from "@vexis/db/client";
import {
  addAgentPool,
  ensureAgent,
  forUser,
  getAgent,
  getTelegramLink,
  listAgentPools,
  listAlerts,
  removeAgentPool,
  updateAgent,
} from "@vexis/db/queries";
import { decryptSecret } from "@vexis/db/secret";
import { poolTokens } from "@/features/analytics/analytics.server";
import { type AgentsData, type AgentView, type AlertsData, MAX_POOLS, type TelegramView } from "./agents";

// Every function takes the signed-in user's id from the viewer middleware and goes through `forUser`, so no
// query can touch another user's rows.

const KIND = "volume-watch" as const;
const DAY_MS = 24 * 3_600_000;
const ALERT_PAGE = 100;

const scope = (userId: string) => forUser(getDb(), userId);

export async function loadAgents(userId: string): Promise<AgentsData> {
  const s = scope(userId);
  const now = Date.now();
  const row = await getAgent(s, KIND);
  if (!row) return { agents: [], now };

  const [pools, alerts] = await Promise.all([listAgentPools(s, row.id), listAlerts(s, { limit: 500 })]);
  const tokens = await Promise.all(pools.map((p) => poolTokens(p.poolAddress)));
  const parsed = ConfigSchema.safeParse(row.config);
  const mine = alerts.filter((a) => a.agentId === row.id);
  const agent: AgentView = {
    id: row.id,
    kind: row.kind,
    enabled: row.enabled,
    paused: row.paused,
    pausedReason: row.pausedReason,
    config: parsed.success ? parsed.data : defaultAgentConfig(KIND),
    pools: pools.map((p, i) => {
      const t = tokens[i];
      return {
        id: p.id,
        address: p.poolAddress,
        label: p.label,
        lastAlertAt: p.lastAlertAt?.getTime() ?? null,
        tokens: t ? [t.x, t.y] : null,
      };
    }),
    alerts24h: mine.filter((a) => now - a.at.getTime() < DAY_MS).length,
    lastAlertAt: mine[0]?.at.getTime() ?? null,
  };
  return { agents: [agent], now };
}

export async function loadAlerts(userId: string): Promise<AlertsData> {
  const s = scope(userId);
  const [alerts, labels] = await Promise.all([listAlerts(s, { limit: ALERT_PAGE }), loadPoolLabels(userId)]);
  const addresses = [...new Set(alerts.map((a) => a.poolAddress))];
  const found = await Promise.all(addresses.map((a) => poolTokens(a)));
  const tokens = new Map(addresses.map((a, i) => [a, found[i] ?? null]));
  return {
    now: Date.now(),
    alerts: alerts.map((a) => {
      const t = tokens.get(a.poolAddress) ?? null;
      return {
        id: a.id,
        agentId: a.agentId,
        poolAddress: a.poolAddress,
        poolLabel: labels.get(a.poolAddress) ?? (t ? `${t.x.symbol}-${t.y.symbol}` : null),
        tokens: t ? [t.x, t.y] : null,
        vol1m: a.vol1m,
        baseline: a.baseline,
        ratio: a.ratio,
        delivered: a.delivered,
        error: a.error,
        at: a.at.getTime(),
      };
    }),
  };
}

async function loadPoolLabels(userId: string) {
  const s = scope(userId);
  const row = await getAgent(s, KIND);
  const pools = row ? await listAgentPools(s, row.id) : [];
  return new Map(pools.flatMap((p) => (p.label ? [[p.poolAddress, p.label] as const] : [])));
}

export async function loadTelegram(userId: string): Promise<TelegramView> {
  const link = await getTelegramLink(scope(userId));
  if (!link) return { bot: null, relink: null };
  // A token saved under an older TOKEN_ENC_KEY can never be used again, so it counts as no bot: the page asks for
  // the token once more, and connecting overwrites the row.
  if (!readable(link.botToken)) return { bot: null, relink: link.botUsername };
  return {
    bot: { username: link.botUsername, linked: link.chatId != null, chatUsername: link.username },
    relink: null,
  };
}

function readable(encrypted: string) {
  try {
    decryptSecret(encrypted);
    return true;
  } catch (error) {
    // A missing or malformed key is a server misconfiguration, not a stale token; let it surface.
    if (error instanceof Error && error.message.startsWith("TOKEN_ENC_KEY")) throw error;
    return false;
  }
}

export interface NewAgentInput {
  pools: { address: string; label: string }[];
  config: unknown;
}

/** Creates the user's agent (or reuses it), saves the config, adds the pools and turns it on. */
export async function createAgent(userId: string, input: NewAgentInput) {
  if (input.pools.length === 0 || input.pools.length > MAX_POOLS) {
    throw new Error(`Pick between 1 and ${MAX_POOLS} pools`);
  }
  await getDb().transaction(async (tx) => {
    const s = forUser(tx, userId);
    const agent = await ensureAgent(s, KIND);
    await updateAgent(s, KIND, { config: input.config, enabled: true, paused: false, pausedReason: null });
    for (const pool of input.pools) await addAgentPool(s, agent.id, pool.address, pool.label);
  });
}

/** Turning on or resuming clears the runner's pause reason; pausing by hand has none. */
export async function setAgentState(userId: string, patch: { enabled?: boolean; paused?: boolean }) {
  const resuming = patch.enabled === true || patch.paused === false;
  const row = await updateAgent(scope(userId), KIND, {
    ...patch,
    ...(resuming ? { pausedReason: null } : {}),
  });
  if (!row) throw new Error("No agent yet");
}

export async function saveConfig(userId: string, config: unknown) {
  const row = await updateAgent(scope(userId), KIND, { config });
  if (!row) throw new Error("No agent yet");
}

export async function addPool(userId: string, pool: { address: string; label: string }) {
  const s = scope(userId);
  const agent = await getAgent(s, KIND);
  if (!agent) throw new Error("No agent yet");
  const existing = await listAgentPools(s, agent.id);
  if (existing.length >= MAX_POOLS && !existing.some((p) => p.poolAddress === pool.address)) {
    throw new Error(`An agent watches at most ${MAX_POOLS} pools`);
  }
  await addAgentPool(s, agent.id, pool.address, pool.label);
}

export async function removePool(userId: string, poolId: string) {
  await removeAgentPool(scope(userId), poolId);
}
