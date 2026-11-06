import { createServerFn } from "@tanstack/react-start";
import { AGENT_KINDS, AutoRebalanceConfig, VolumeWatchConfig } from "@vexis/db/agents";
import { z } from "zod";
import { PoolAddress } from "@/features/analytics/analytics.functions";
import { requireViewer } from "@/features/auth/auth.middleware";
import { MAX_POOLS } from "./agents";
import {
  addPool,
  createAgent,
  loadAgents,
  loadAlerts,
  loadRebalances,
  loadTelegram,
  removeAgent,
  removePool,
  saveConfig,
  setAgentState,
} from "./agents.server";
import { BotToken, connectOwnBot, detectOwnBotChat, disconnectTelegram } from "./telegram.server";
import { loadWallet, RpcUrlInput, removeWallet, SecretKeyInput, saveRpcUrl, saveWallet } from "./wallet.server";

const PoolInput = z.object({ address: PoolAddress, label: z.string().trim().min(1).max(80) });
const Kind = z.enum(AGENT_KINDS);
const AgentId = z.object({ agentId: z.string().uuid() });
const KindConfig = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("volume-watch"), config: VolumeWatchConfig }),
  z.object({ kind: z.literal("auto-rebalance"), config: AutoRebalanceConfig }),
]);

export const getAgents = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadAgents(context.viewer.id));

export const getAlerts = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadAlerts(context.viewer.id));

export const getRebalances = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(AgentId)
  .handler(({ context, data }) => loadRebalances(context.viewer.id, data.agentId));

export const getRebalanceWallet = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadWallet(context.viewer.id));

export const saveRebalanceWalletFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ secretKey: SecretKeyInput, rpcUrl: RpcUrlInput }))
  .handler(async ({ context, data }) => ({
    publicKey: await saveWallet(context.viewer.id, data.secretKey, data.rpcUrl),
  }));

export const saveRebalanceRpcUrlFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ rpcUrl: RpcUrlInput }))
  .handler(({ context, data }) => saveRpcUrl(context.viewer.id, data.rpcUrl));

export const removeRebalanceWalletFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .handler(({ context }) => removeWallet(context.viewer.id));

export const getTelegram = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadTelegram(context.viewer.id));

export const connectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ kind: Kind, token: BotToken }))
  .handler(async ({ context, data }) => {
    await connectOwnBot(context.viewer.id, data.kind, data.token);
    return loadTelegram(context.viewer.id);
  });

export const detectTelegramChat = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ kind: Kind }))
  .handler(async ({ context, data }) => {
    await detectOwnBotChat(context.viewer.id, data.kind);
    return loadTelegram(context.viewer.id);
  });

export const disconnectTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ kind: Kind }))
  .handler(async ({ context, data }) => {
    await disconnectTelegram(context.viewer.id, data.kind);
    return loadTelegram(context.viewer.id);
  });

export const createAgentFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(KindConfig.and(z.object({ pools: z.array(PoolInput).min(1).max(MAX_POOLS) })))
  .handler(async ({ context, data }) => ({ id: await createAgent(context.viewer.id, data) }));

export const setAgentRunning = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(AgentId.extend({ enabled: z.boolean().optional(), paused: z.boolean().optional() }))
  .handler(({ context, data: { agentId, ...patch } }) => setAgentState(context.viewer.id, agentId, patch));

/** The kind names which schema the config is checked against; the agent's own kind is checked again on save. */
export const saveAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(KindConfig.and(AgentId))
  .handler(({ context, data }) => saveConfig(context.viewer.id, data.agentId, data.config));

export const deleteAgentFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(AgentId)
  .handler(({ context, data }) => removeAgent(context.viewer.id, data.agentId));

export const addAgentPoolFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(PoolInput.and(AgentId))
  .handler(({ context, data: { agentId, ...pool } }) => addPool(context.viewer.id, agentId, pool));

export const removeAgentPoolFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(AgentId.extend({ poolId: z.string().uuid() }))
  .handler(({ context, data }) => removePool(context.viewer.id, data.agentId, data.poolId));
