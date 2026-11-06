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
  removePool,
  saveConfig,
  setAgentState,
} from "./agents.server";
import { BotToken, connectOwnBot, detectOwnBotChat, disconnectTelegram } from "./telegram.server";
import { loadWallet, removeWallet, SecretKeyInput, saveWallet } from "./wallet.server";

const PoolInput = z.object({ address: PoolAddress, label: z.string().trim().min(1).max(80) });
const Kind = z.enum(AGENT_KINDS);
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
  .handler(({ context }) => loadRebalances(context.viewer.id));

export const getRebalanceWallet = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadWallet(context.viewer.id));

export const saveRebalanceWalletFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ secretKey: SecretKeyInput }))
  .handler(async ({ context, data }) => ({ publicKey: await saveWallet(context.viewer.id, data.secretKey) }));

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
  .handler(({ context, data }) => createAgent(context.viewer.id, data));

export const setAgentRunning = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ kind: Kind, enabled: z.boolean().optional(), paused: z.boolean().optional() }))
  .handler(({ context, data: { kind, ...patch } }) => setAgentState(context.viewer.id, kind, patch));

export const saveAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(KindConfig)
  .handler(({ context, data }) => saveConfig(context.viewer.id, data.kind, data.config));

export const addAgentPoolFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(PoolInput.extend({ kind: Kind }))
  .handler(({ context, data: { kind, ...pool } }) => addPool(context.viewer.id, kind, pool));

export const removeAgentPoolFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ poolId: z.string().uuid() }))
  .handler(({ context, data }) => removePool(context.viewer.id, data.poolId));
