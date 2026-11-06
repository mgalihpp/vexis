import { AGENT_KINDS, type AgentKind, AutoRebalanceConfig, VolumeWatchConfig } from "@vexis/db/agents";
import { getDb } from "@vexis/db/client";
import {
  addAgentPool,
  deleteAgent,
  forUser,
  getAgent,
  getRebalanceWallet,
  getTelegramLinks,
  insertAgent,
  listAgentPools,
  listAgents,
  listAlerts,
  listPoolsOfKind,
  listRebalances,
  lockUserAgents,
  removeAgentPool,
  updateAgent,
} from "@vexis/db/queries";
import { decryptSecret } from "@vexis/db/secret";
import { poolTokens } from "@/features/analytics/analytics.server";
import {
  type AgentsData,
  type AgentView,
  type AlertsData,
  MAX_POOLS,
  type PoolView,
  poolLimit,
  type RebalancesData,
  type TelegramView,
} from "./agents";
import { rpcHost } from "./wallet.server";

// Every function takes the signed-in user's id from the viewer middleware and goes through `forUser`, so no
// query can touch another user's rows. Writes address an agent by id: a user has one volume-watch agent but
// may have many auto-rebalance agents.

const DAY_MS = 24 * 3_600_000;
const ALERT_PAGE = 100;

const scope = (userId: string) => forUser(getDb(), userId);

export async function loadAgents(userId: string): Promise<AgentsData> {
  const s = scope(userId);
  const now = Date.now();
  const rows = await listAgents(s);
  const has = (kind: AgentKind) => rows.some((r) => r.kind === kind);
  const [alerts, rebalances, wallet] = await Promise.all([
    has("volume-watch") ? listAlerts(s, { limit: 500 }) : [],
    has("auto-rebalance") ? listRebalances(s, { limit: 500 }) : [],
    has("auto-rebalance") ? getRebalanceWallet(s) : undefined,
  ]);

  const agents = await Promise.all(
    rows.map(async (row): Promise<AgentView> => {
      const pools = await listAgentPools(s, row.id);
      const tokens = await Promise.all(pools.map((p) => poolTokens(p.poolAddress)));
      // An in-range fee claim is not an out-of-range event, so it stays out of the counts.
      const events = row.kind === "volume-watch" ? alerts : rebalances.filter((r) => r.action === "rebalance");
      const mine = events.filter((e) => e.agentId === row.id);
      const base = {
        id: row.id,
        enabled: row.enabled,
        paused: row.paused,
        pausedReason: row.pausedReason,
        pools: pools.map((p, i): PoolView => {
          const t = tokens[i];
          return {
            id: p.id,
            address: p.poolAddress,
            label: p.label,
            lastAlertAt: p.lastAlertAt?.getTime() ?? null,
            tokens: t ? [t.x, t.y] : null,
          };
        }),
        alerts24h: mine.filter((e) => now - e.at.getTime() < DAY_MS).length,
        lastAlertAt: mine[0]?.at.getTime() ?? null,
      };
      if (row.kind === "volume-watch") {
        const parsed = VolumeWatchConfig.safeParse(row.config);
        return { ...base, kind: "volume-watch", config: parsed.success ? parsed.data : VolumeWatchConfig.parse({}) };
      }
      const parsed = AutoRebalanceConfig.safeParse(row.config);
      return {
        ...base,
        kind: "auto-rebalance",
        config: parsed.success ? parsed.data : AutoRebalanceConfig.parse({}),
        wallet: wallet?.publicKey ?? null,
        rpcHost: rpcHost(wallet?.rpcUrl ?? null),
      };
    }),
  );
  return { agents, now };
}

/** The pair's symbols and icons per pool, looked up once per distinct address. */
async function tokensFor(addresses: string[]) {
  const unique = [...new Set(addresses)];
  const found = await Promise.all(unique.map((a) => poolTokens(a)));
  return new Map(unique.map((a, i) => [a, found[i] ?? null]));
}

/** The agent's own pool labels, so a history row names its pool the way the agent does. */
async function poolLabels(userId: string, agentId: string) {
  const pools = await listAgentPools(scope(userId), agentId);
  return new Map(pools.flatMap((p) => (p.label ? [[p.poolAddress, p.label] as const] : [])));
}

/** One agent's history; an agent the user does not own reads as empty. */
export async function loadRebalances(userId: string, agentId: string): Promise<RebalancesData> {
  const s = scope(userId);
  const [agent, rows, labels] = await Promise.all([
    getAgent(s, agentId),
    listRebalances(s, { limit: ALERT_PAGE, agentId }),
    poolLabels(userId, agentId),
  ]);
  const config = AutoRebalanceConfig.safeParse(agent?.config);
  const tokens = await tokensFor(rows.map((r) => r.poolAddress));
  return {
    now: Date.now(),
    feeMode: config.success ? config.data.feeMode : "keep",
    rebalances: rows.map((r) => {
      const t = tokens.get(r.poolAddress) ?? null;
      return {
        id: r.id,
        action: r.action,
        feeSol: r.feeSol,
        poolAddress: r.poolAddress,
        poolLabel: labels.get(r.poolAddress) ?? (t ? `${t.x.symbol}-${t.y.symbol}` : null),
        tokens: t ? [t.x, t.y] : null,
        positionAddress: r.positionAddress,
        activeBin: r.activeBin,
        lowerBin: r.lowerBin,
        upperBin: r.upperBin,
        newLowerBin: r.newLowerBin,
        newUpperBin: r.newUpperBin,
        live: r.live,
        signature: r.signature,
        txError: r.txError,
        delivered: r.delivered,
        error: r.error,
        at: r.at.getTime(),
      };
    }),
  };
}

export async function loadAlerts(userId: string): Promise<AlertsData> {
  const s = scope(userId);
  const [alerts, [agent]] = await Promise.all([listAlerts(s, { limit: ALERT_PAGE }), listAgents(s, "volume-watch")]);
  const [labels, tokens] = await Promise.all([
    agent ? poolLabels(userId, agent.id) : new Map<string, string>(),
    tokensFor(alerts.map((a) => a.poolAddress)),
  ]);
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

export async function loadTelegram(userId: string): Promise<Record<AgentKind, TelegramView>> {
  const links = await getTelegramLinks(scope(userId));
  const view = (kind: AgentKind): TelegramView => {
    const link = links.find((l) => l.kind === kind);
    if (!link) return { bot: null, relink: null };
    // A token saved under an older TOKEN_ENC_KEY can never be used again, so it counts as no bot: the page asks
    // for the token once more, and connecting overwrites the row.
    if (!readable(link.botToken)) return { bot: null, relink: link.botUsername };
    return {
      bot: { username: link.botUsername, linked: link.chatId != null, chatUsername: link.username },
      relink: null,
    };
  };
  return Object.fromEntries(AGENT_KINDS.map((k) => [k, view(k)])) as Record<AgentKind, TelegramView>;
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
  kind: AgentKind;
  pools: { address: string; label: string }[];
  config: unknown;
}

/**
 * Creates an agent with its pools, turned on, and returns its id. A user has one volume-watch agent, and any number of
 * auto-rebalance agents with one pool each, never two on the same pool (both would act on the same position).
 */
export async function createAgent(userId: string, input: NewAgentInput) {
  const { kind, pools } = input;
  const max = poolLimit(kind);
  if (pools.length === 0 || pools.length > max) {
    throw new Error(max === 1 ? "An auto-rebalance agent manages exactly one pool" : `Pick between 1 and ${max} pools`);
  }
  if (kind === "auto-rebalance" && !(await getRebalanceWallet(scope(userId)))) {
    throw new Error("Save the wallet this agent manages first");
  }
  return getDb().transaction(async (tx) => {
    const s = forUser(tx, userId);
    await lockUserAgents(s);
    if (kind === "volume-watch" && (await listAgents(s, kind)).length > 0) {
      throw new Error("You already have a volume spike agent; add pools to it instead");
    }
    if (kind === "auto-rebalance") {
      const managed = new Set((await listPoolsOfKind(s, kind)).map((p) => p.poolAddress));
      if (pools.some((p) => managed.has(p.address))) {
        throw new Error("Another auto-rebalance agent already manages this pool");
      }
    }
    const agent = await insertAgent(s, kind, { enabled: true, config: input.config });
    for (const pool of pools) await addAgentPool(s, agent.id, pool.address, pool.label);
    return agent.id;
  });
}

/** Turning on or resuming clears the runner's pause reason; pausing by hand has none. */
export async function setAgentState(userId: string, agentId: string, patch: { enabled?: boolean; paused?: boolean }) {
  const resuming = patch.enabled === true || patch.paused === false;
  const row = await updateAgent(scope(userId), agentId, { ...patch, ...(resuming ? { pausedReason: null } : {}) });
  if (!row) throw new Error("Agent not found");
}

export async function saveConfig(userId: string, agentId: string, config: unknown) {
  const row = await updateAgent(scope(userId), agentId, { config });
  if (!row) throw new Error("Agent not found");
}

export async function removeAgent(userId: string, agentId: string) {
  if (!(await deleteAgent(scope(userId), agentId))) throw new Error("Agent not found");
}

/** Only a volume-watch agent's pools change after creation; an auto-rebalance agent's pool is fixed. */
async function watchedPools(userId: string, agentId: string) {
  const s = scope(userId);
  const agent = await getAgent(s, agentId);
  if (!agent) throw new Error("Agent not found");
  if (agent.kind === "auto-rebalance") {
    throw new Error("An auto-rebalance agent keeps its pool; create another agent for a new pool");
  }
  return listAgentPools(s, agentId);
}

export async function addPool(userId: string, agentId: string, pool: { address: string; label: string }) {
  const existing = await watchedPools(userId, agentId);
  if (existing.length >= MAX_POOLS && !existing.some((p) => p.poolAddress === pool.address)) {
    throw new Error(`An agent watches at most ${MAX_POOLS} pools`);
  }
  await addAgentPool(scope(userId), agentId, pool.address, pool.label);
}

export async function removePool(userId: string, agentId: string, poolId: string) {
  await watchedPools(userId, agentId);
  await removeAgentPool(scope(userId), agentId, poolId);
}
