import { AutoRebalanceConfig, TELEGRAM_KINDS, VolumeWatchConfig } from "@vexis/shared/agents";
import { PoolFilter } from "@vexis/shared/screen";
import { z } from "zod";
import { PoolAddress } from "@/lib/address";
import { router, viewerProcedure } from "@/trpc/init.server";
import { MAX_POOLS } from "./agents";
import {
  addPool,
  alertOnFilter,
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
const TelegramKind = z.enum(TELEGRAM_KINDS);
const AgentId = z.object({ agentId: z.string().uuid() });
const KindConfig = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("volume-watch"), config: VolumeWatchConfig }),
  z.object({ kind: z.literal("auto-rebalance"), config: AutoRebalanceConfig }),
]);

const walletRouter = router({
  get: viewerProcedure.query(({ ctx }) => loadWallet(ctx.viewer.id)),
  save: viewerProcedure
    .input(z.object({ secretKey: SecretKeyInput, rpcUrl: RpcUrlInput }))
    .mutation(async ({ ctx, input }) => ({
      publicKey: await saveWallet(ctx.viewer.id, input.secretKey, input.rpcUrl),
    })),
  saveRpcUrl: viewerProcedure
    .input(z.object({ rpcUrl: RpcUrlInput }))
    .mutation(({ ctx, input }) => saveRpcUrl(ctx.viewer.id, input.rpcUrl)),
  remove: viewerProcedure.mutation(({ ctx }) => removeWallet(ctx.viewer.id)),
});

const telegramRouter = router({
  get: viewerProcedure.query(({ ctx }) => loadTelegram(ctx.viewer.id)),
  connect: viewerProcedure.input(z.object({ kind: TelegramKind, token: BotToken })).mutation(async ({ ctx, input }) => {
    await connectOwnBot(ctx.viewer.id, input.kind, input.token);
    return loadTelegram(ctx.viewer.id);
  }),
  detect: viewerProcedure.input(z.object({ kind: TelegramKind })).mutation(async ({ ctx, input }) => {
    await detectOwnBotChat(ctx.viewer.id, input.kind);
    return loadTelegram(ctx.viewer.id);
  }),
  disconnect: viewerProcedure.input(z.object({ kind: TelegramKind })).mutation(async ({ ctx, input }) => {
    await disconnectTelegram(ctx.viewer.id, input.kind);
    return loadTelegram(ctx.viewer.id);
  }),
});

export const agentsRouter = router({
  list: viewerProcedure.query(({ ctx }) => loadAgents(ctx.viewer.id)),
  alerts: viewerProcedure.query(({ ctx }) => loadAlerts(ctx.viewer.id)),
  rebalances: viewerProcedure.input(AgentId).query(({ ctx, input }) => loadRebalances(ctx.viewer.id, input.agentId)),
  create: viewerProcedure
    .input(KindConfig.and(z.object({ pools: z.array(PoolInput).max(MAX_POOLS) })))
    .mutation(async ({ ctx, input }) => ({ id: await createAgent(ctx.viewer.id, input) })),
  /** The screener's "Alert on pools like these" for a user who already has a volume-watch agent. */
  alertOnFilter: viewerProcedure
    .input(z.object({ custom: PoolFilter }))
    .mutation(async ({ ctx, input }) => ({ id: await alertOnFilter(ctx.viewer.id, input.custom) })),
  setRunning: viewerProcedure
    .input(AgentId.extend({ enabled: z.boolean().optional(), paused: z.boolean().optional() }))
    .mutation(({ ctx, input: { agentId, ...patch } }) => setAgentState(ctx.viewer.id, agentId, patch)),
  /** The kind names which schema the config is checked against; the agent's own kind is checked again on save. */
  saveConfig: viewerProcedure
    .input(KindConfig.and(AgentId))
    .mutation(({ ctx, input }) => saveConfig(ctx.viewer.id, input.agentId, input.config)),
  remove: viewerProcedure.input(AgentId).mutation(({ ctx, input }) => removeAgent(ctx.viewer.id, input.agentId)),
  addPool: viewerProcedure
    .input(PoolInput.and(AgentId))
    .mutation(({ ctx, input: { agentId, ...pool } }) => addPool(ctx.viewer.id, agentId, pool)),
  removePool: viewerProcedure
    .input(AgentId.extend({ poolId: z.string().uuid() }))
    .mutation(({ ctx, input }) => removePool(ctx.viewer.id, input.agentId, input.poolId)),
  wallet: walletRouter,
  telegram: telegramRouter,
});
