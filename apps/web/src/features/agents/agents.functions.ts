import { createServerFn } from "@tanstack/react-start";
import { VolumeWatchConfig } from "@vexis/db/agents";
import { z } from "zod";
import { PoolAddress } from "@/features/analytics/analytics.functions";
import { requireViewer } from "@/features/auth/auth.middleware";
import { MAX_POOLS } from "./agents";
import {
  addPool,
  createAgent,
  loadAgents,
  loadAlerts,
  loadTelegram,
  removePool,
  saveConfig,
  setAgentState,
} from "./agents.server";
import { BotToken, connectOwnBot, detectOwnBotChat, disconnectTelegram } from "./telegram.server";

const PoolInput = z.object({ address: PoolAddress, label: z.string().trim().min(1).max(80) });

export const getAgents = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadAgents(context.viewer.id));

export const getAlerts = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadAlerts(context.viewer.id));

export const getTelegram = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadTelegram(context.viewer.id));

export const connectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ token: BotToken }))
  .handler(async ({ context, data }) => {
    await connectOwnBot(context.viewer.id, data.token);
    return loadTelegram(context.viewer.id);
  });

export const detectTelegramChat = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .handler(async ({ context }) => {
    await detectOwnBotChat(context.viewer.id);
    return loadTelegram(context.viewer.id);
  });

export const disconnectTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .handler(async ({ context }) => {
    await disconnectTelegram(context.viewer.id);
    return loadTelegram(context.viewer.id);
  });

export const createVolumeAgent = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ pools: z.array(PoolInput).min(1).max(MAX_POOLS), config: VolumeWatchConfig }))
  .handler(({ context, data }) => createAgent(context.viewer.id, data));

export const setAgentRunning = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ enabled: z.boolean().optional(), paused: z.boolean().optional() }))
  .handler(({ context, data }) => setAgentState(context.viewer.id, data));

export const saveAgentConfig = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(VolumeWatchConfig)
  .handler(({ context, data }) => saveConfig(context.viewer.id, data));

export const addAgentPoolFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(PoolInput)
  .handler(({ context, data }) => addPool(context.viewer.id, data));

export const removeAgentPoolFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ poolId: z.string().uuid() }))
  .handler(({ context, data }) => removePool(context.viewer.id, data.poolId));
