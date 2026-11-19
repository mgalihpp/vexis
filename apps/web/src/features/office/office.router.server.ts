import {
  Guardrails,
  KEY_SOURCES,
  LLM_PROVIDERS,
  OFFICE_AGENTS,
  OFFICE_MODES,
  OfficeModels,
} from "@vexis/shared/office";
import { PoolFilter, PRESETS } from "@vexis/shared/screen";
import { z } from "zod";
import { RpcUrlInput, SecretKeyInput } from "@/features/agents/wallet.server";
import { PoolAddress } from "@/lib/address";
import { router, viewerProcedure } from "@/trpc/init.server";
import {
  closePosition,
  decideProposal,
  hasOffice,
  killSwitch,
  loadFeed,
  loadOffice,
  removeLlmKey,
  removeOfficeWallet,
  resumeOffice,
  saveGuardrails,
  saveKeySource,
  saveLive,
  saveLlmKey,
  saveMode,
  saveModels,
  saveOfficeWallet,
  saveScreen,
} from "./office.server";

const Provider = z.object({ provider: z.enum(LLM_PROVIDERS) });
// Keys are opaque per provider; this only keeps out pasted whitespace and obvious junk.
const ApiKey = z
  .string()
  .trim()
  .min(20, "That API key is too short")
  .max(400)
  .regex(/^\S+$/, "An API key has no spaces");

export const officeRouter = router({
  get: viewerProcedure.query(({ ctx }) => loadOffice(ctx.viewer.id)),
  enabled: viewerProcedure.query(({ ctx }) => hasOffice(ctx.viewer.id)),
  feed: viewerProcedure
    .input(z.object({ agent: z.enum(OFFICE_AGENTS).optional(), pool: PoolAddress.optional() }))
    .query(({ ctx, input }) => loadFeed(ctx.viewer.id, input)),
  saveScreen: viewerProcedure
    .input(z.object({ preset: z.enum(PRESETS), custom: PoolFilter.optional() }))
    .mutation(({ ctx, input }) => saveScreen(ctx.viewer.id, input.preset, input.custom)),
  decide: viewerProcedure
    .input(z.object({ proposalId: z.string().uuid(), decision: z.enum(["approve", "reject"]) }))
    .mutation(({ ctx, input }) => decideProposal(ctx.viewer.id, input.proposalId, input.decision)),
  killSwitch: viewerProcedure.mutation(async ({ ctx }) => ({ rejected: await killSwitch(ctx.viewer.id) })),
  resume: viewerProcedure.mutation(({ ctx }) => resumeOffice(ctx.viewer.id)),
  closePosition: viewerProcedure
    .input(z.object({ journalId: z.string().uuid() }))
    .mutation(({ ctx, input }) => closePosition(ctx.viewer.id, input.journalId)),
  saveLive: viewerProcedure
    .input(z.object({ live: z.boolean() }))
    .mutation(({ ctx, input }) => saveLive(ctx.viewer.id, input.live)),
  saveMode: viewerProcedure
    .input(z.object({ mode: z.enum(OFFICE_MODES) }))
    .mutation(({ ctx, input }) => saveMode(ctx.viewer.id, input.mode)),
  saveModels: viewerProcedure
    .input(z.object({ models: OfficeModels }))
    .mutation(({ ctx, input }) => saveModels(ctx.viewer.id, input.models)),
  saveGuardrails: viewerProcedure
    .input(z.object({ guardrails: Guardrails }))
    .mutation(({ ctx, input }) => saveGuardrails(ctx.viewer.id, input.guardrails)),
  saveKeySource: viewerProcedure
    .input(z.object({ keySource: z.enum(KEY_SOURCES) }))
    .mutation(({ ctx, input }) => saveKeySource(ctx.viewer.id, input.keySource)),
  saveLlmKey: viewerProcedure
    .input(Provider.extend({ key: ApiKey }))
    .mutation(({ ctx, input }) => saveLlmKey(ctx.viewer.id, input.provider, input.key)),
  removeLlmKey: viewerProcedure
    .input(Provider)
    .mutation(({ ctx, input }) => removeLlmKey(ctx.viewer.id, input.provider)),
  saveWallet: viewerProcedure
    .input(z.object({ secretKey: SecretKeyInput, rpcUrl: RpcUrlInput }))
    .mutation(({ ctx, input }) => saveOfficeWallet(ctx.viewer.id, input.secretKey, input.rpcUrl)),
  removeWallet: viewerProcedure.mutation(({ ctx }) => removeOfficeWallet(ctx.viewer.id)),
});
