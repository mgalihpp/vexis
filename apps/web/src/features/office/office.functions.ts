import { createServerFn } from "@tanstack/react-start";
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
import { PoolAddress } from "@/features/analytics/analytics.functions";
import { requireViewer } from "@/features/auth/auth.middleware";
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

export const getOffice = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => loadOffice(context.viewer.id));

export const getOfficeEnabled = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(({ context }) => hasOffice(context.viewer.id));

export const saveScreenFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ preset: z.enum(PRESETS), custom: PoolFilter.optional() }))
  .handler(({ context, data }) => saveScreen(context.viewer.id, data.preset, data.custom));

export const getOfficeFeed = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ agent: z.enum(OFFICE_AGENTS).optional(), pool: PoolAddress.optional() }))
  .handler(({ context, data }) => loadFeed(context.viewer.id, data));

export const decideProposalFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ proposalId: z.string().uuid(), decision: z.enum(["approve", "reject"]) }))
  .handler(({ context, data }) => decideProposal(context.viewer.id, data.proposalId, data.decision));

export const killSwitchFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .handler(async ({ context }) => ({ rejected: await killSwitch(context.viewer.id) }));

export const resumeOfficeFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .handler(({ context }) => resumeOffice(context.viewer.id));

export const closePositionFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ journalId: z.string().uuid() }))
  .handler(({ context, data }) => closePosition(context.viewer.id, data.journalId));

export const saveLiveFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ live: z.boolean() }))
  .handler(({ context, data }) => saveLive(context.viewer.id, data.live));

export const saveModeFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ mode: z.enum(OFFICE_MODES) }))
  .handler(({ context, data }) => saveMode(context.viewer.id, data.mode));

export const saveModelsFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ models: OfficeModels }))
  .handler(({ context, data }) => saveModels(context.viewer.id, data.models));

export const saveGuardrailsFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ guardrails: Guardrails }))
  .handler(({ context, data }) => saveGuardrails(context.viewer.id, data.guardrails));

export const saveKeySourceFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ keySource: z.enum(KEY_SOURCES) }))
  .handler(({ context, data }) => saveKeySource(context.viewer.id, data.keySource));

export const saveLlmKeyFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(Provider.extend({ key: ApiKey }))
  .handler(({ context, data }) => saveLlmKey(context.viewer.id, data.provider, data.key));

export const removeLlmKeyFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(Provider)
  .handler(({ context, data }) => removeLlmKey(context.viewer.id, data.provider));

export const saveOfficeWalletFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .validator(z.object({ secretKey: SecretKeyInput, rpcUrl: RpcUrlInput }))
  .handler(({ context, data }) => saveOfficeWallet(context.viewer.id, data.secretKey, data.rpcUrl));

export const removeOfficeWalletFn = createServerFn({ method: "POST" })
  .middleware([requireViewer])
  .handler(({ context }) => removeOfficeWallet(context.viewer.id));
