import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { EventKind } from "@vexis/bot-state";
import { z } from "zod";
import { requireViewer } from "@/features/auth/auth.middleware";
import { botStore } from "./bots.server";

const DAY_MS = 86_400_000;

export const getFleet = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(async () => {
    const store = await botStore();
    const now = Date.now();
    return { now, bots: await Promise.all(store.sources.map((s) => store.summary(s, now))) };
  });

// Reads every journal in full, so routes stream it instead of blocking on it.
export const getFleetActivity = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .handler(async () => {
    const store = await botStore();
    const since = Date.now() - DAY_MS;
    return Promise.all(store.sources.map((s) => store.activity(s, since)));
  });

const BotInput = z.object({ botId: z.string() });

export const getBot = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(BotInput)
  .handler(async ({ data }) => {
    const store = await botStore();
    const source = store.find(data.botId);
    if (!source) throw notFound();
    const now = Date.now();
    return { now, bot: await store.summary(source, now) };
  });

export const getBotEvents = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(
    BotInput.extend({
      kinds: z.array(EventKind).optional(),
      limit: z.number().int().min(1).max(500),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ data }) => {
    const store = await botStore();
    const source = store.find(data.botId);
    if (!source) throw notFound();
    const all = await store.events(source);
    const kinds = data.kinds?.length ? new Set(data.kinds) : null;
    const matching = (kinds ? all.filter((e) => kinds.has(e.kind)) : all).reverse();
    return {
      now: Date.now(),
      total: matching.length,
      events: matching.slice(data.offset, data.offset + data.limit),
    };
  });
