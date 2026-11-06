import { type AgentKind, AutoRebalanceConfig, VolumeWatchConfig } from "@vexis/db/agents";
import { getDb } from "@vexis/db/client";
import {
  addAgentPool,
  ensureAgent,
  forUser,
  getAgent,
  getRebalanceWallet,
  getTelegramLink,
  listAgentPools,
  listAlerts,
  listRebalances,
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
  type RebalancesData,
  type TelegramView,
} from "./agents";

// Every function takes the signed-in user's id from the viewer middleware and goes through `forUser`, so no
// query can touch another user's rows.

const DAY_MS = 24 * 3_600_000;
const ALERT_PAGE = 100;

const scope = (userId: string) => forUser(getDb(), userId);

export async function loadAgents(userId: string): Promise<AgentsData> {
  const s = scope(userId);
  const now = Date.now();
  const [volume, rebalance] = await Promise.all([getAgent(s, "volume-watch"), getAgent(s, "auto-rebalance")]);
  const [alerts, rebalances, wallet] = await Promise.all([
    volume ? listAlerts(s, { limit: 500 }) : [],
    rebalance ? listRebalances(s, { limit: 500 }) : [],
    rebalance ? getRebalanceWallet(s) : undefined,
  ]);

  const view = async (row: NonNullable<typeof volume>, events: { agentId: string; at: Date }[]) => {
    const pools = await listAgentPools(s, row.id);
    const tokens = await Promise.all(pools.map((p) => poolTokens(p.poolAddress)));
    const mine = events.filter((e) => e.agentId === row.id);
    return {
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
  };

  const agents: AgentView[] = [];
  if (volume) {
    const parsed = VolumeWatchConfig.safeParse(volume.config);
    agents.push({
      ...(await view(volume, alerts)),
      kind: "volume-watch",
      config: parsed.success ? parsed.data : VolumeWatchConfig.parse({}),
    });
  }
  if (rebalance) {
    const parsed = AutoRebalanceConfig.safeParse(rebalance.config);
    agents.push({
      ...(await view(rebalance, rebalances)),
      kind: "auto-rebalance",
      config: parsed.success ? parsed.data : AutoRebalanceConfig.parse({}),
      wallet: wallet?.publicKey ?? null,
    });
  }
  return { agents, now };
}

/** The pair's symbols and icons per pool, looked up once per distinct address. */
async function tokensFor(addresses: string[]) {
  const unique = [...new Set(addresses)];
  const found = await Promise.all(unique.map((a) => poolTokens(a)));
  return new Map(unique.map((a, i) => [a, found[i] ?? null]));
}

export async function loadRebalances(userId: string): Promise<RebalancesData> {
  const s = scope(userId);
  const [rows, labels] = await Promise.all([
    listRebalances(s, { limit: ALERT_PAGE }),
    loadPoolLabels(userId, "auto-rebalance"),
  ]);
  const tokens = await tokensFor(rows.map((r) => r.poolAddress));
  return {
    now: Date.now(),
    rebalances: rows.map((r) => {
      const t = tokens.get(r.poolAddress) ?? null;
      return {
        id: r.id,
        poolAddress: r.poolAddress,
        poolLabel: labels.get(r.poolAddress) ?? (t ? `${t.x.symbol}-${t.y.symbol}` : null),
        tokens: t ? [t.x, t.y] : null,
        positionAddress: r.positionAddress,
        activeBin: r.activeBin,
        lowerBin: r.lowerBin,
        upperBin: r.upperBin,
        newLowerBin: r.newLowerBin,
        newUpperBin: r.newUpperBin,
        signature: r.signature,
        delivered: r.delivered,
        error: r.error,
        at: r.at.getTime(),
      };
    }),
  };
}

export async function loadAlerts(userId: string): Promise<AlertsData> {
  const s = scope(userId);
  const [alerts, labels] = await Promise.all([
    listAlerts(s, { limit: ALERT_PAGE }),
    loadPoolLabels(userId, "volume-watch"),
  ]);
  const tokens = await tokensFor(alerts.map((a) => a.poolAddress));
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

async function loadPoolLabels(userId: string, kind: AgentKind) {
  const s = scope(userId);
  const row = await getAgent(s, kind);
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
  kind: AgentKind;
  pools: { address: string; label: string }[];
  config: unknown;
}

/** Creates the user's agent of this kind (or reuses it), saves the config, adds the pools and turns it on. */
export async function createAgent(userId: string, input: NewAgentInput) {
  const { kind } = input;
  if (input.pools.length === 0 || input.pools.length > MAX_POOLS) {
    throw new Error(`Pick between 1 and ${MAX_POOLS} pools`);
  }
  if (kind === "auto-rebalance" && !(await getRebalanceWallet(scope(userId)))) {
    throw new Error("Save the wallet this agent manages first");
  }
  await getDb().transaction(async (tx) => {
    const s = forUser(tx, userId);
    const agent = await ensureAgent(s, kind);
    await updateAgent(s, kind, { config: input.config, enabled: true, paused: false, pausedReason: null });
    for (const pool of input.pools) await addAgentPool(s, agent.id, pool.address, pool.label);
  });
}

/** Turning on or resuming clears the runner's pause reason; pausing by hand has none. */
export async function setAgentState(userId: string, kind: AgentKind, patch: { enabled?: boolean; paused?: boolean }) {
  const resuming = patch.enabled === true || patch.paused === false;
  const row = await updateAgent(scope(userId), kind, {
    ...patch,
    ...(resuming ? { pausedReason: null } : {}),
  });
  if (!row) throw new Error("No agent yet");
}

export async function saveConfig(userId: string, kind: AgentKind, config: unknown) {
  const row = await updateAgent(scope(userId), kind, { config });
  if (!row) throw new Error("No agent yet");
}

export async function addPool(userId: string, kind: AgentKind, pool: { address: string; label: string }) {
  const s = scope(userId);
  const agent = await getAgent(s, kind);
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
