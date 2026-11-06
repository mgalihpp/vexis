import { AGENT_KINDS, TELEGRAM_PAUSES } from "@vexis/db/agents";
import { getDb } from "@vexis/db/client";
import {
  forUser,
  getAgent,
  getTelegramLink,
  linkOwnBotChat,
  removeTelegramLink,
  saveOwnBot,
  updateAgent,
} from "@vexis/db/queries";
import { decryptSecret, encryptSecret } from "@vexis/db/secret";
import { z } from "zod";
import { BOT_TOKEN_PATTERN } from "./agents";

// A user's own Telegram bot. The token is checked with `getMe`, stored encrypted, and the chat is read from the
// messages waiting on that bot, so no per-bot polling is needed. The runner sends with the same token.

export const BotToken = z.string().trim().regex(BOT_TOKEN_PATTERN, "That does not look like a bot token");

const Me = z.object({ ok: z.literal(true), result: z.object({ username: z.string() }) });
const Updates = z.object({
  ok: z.literal(true),
  result: z.array(
    z.object({
      update_id: z.number(),
      message: z
        .object({
          chat: z.object({ id: z.number(), type: z.string() }),
          from: z.object({ username: z.string().optional() }).optional(),
        })
        .optional(),
    }),
  ),
});

/** Calls the Bot API. Failures never carry the token, since it is part of the URL. */
async function call<T>(token: string, method: string, schema: z.ZodType<T>, params?: Record<string, string>) {
  const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error("Could not reach Telegram. Try again.");
  }
  if (response.status === 401 || response.status === 404) throw new Error("Telegram rejected that token");
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("Telegram sent an unexpected answer");
  return parsed.data;
}

export async function connectOwnBot(userId: string, token: string) {
  const me = await call(BotToken.parse(token), "getMe", Me);
  await saveOwnBot(forUser(getDb(), userId), encryptSecret(token.trim()), me.result.username);
}

/** Reads the newest private chat on the user's bot and links it. Throws when nobody has written to the bot yet. */
export async function detectOwnBotChat(userId: string) {
  const s = forUser(getDb(), userId);
  const link = await getTelegramLink(s);
  if (!link?.botToken) throw new Error("Connect your bot first");

  const { result } = await call(decryptSecret(link.botToken), "getUpdates", Updates, {
    limit: "100",
    allowed_updates: JSON.stringify(["message"]),
  });
  const latest = [...result].reverse().find((u) => u.message?.chat.type === "private")?.message;
  if (!latest) throw new Error(`No message yet. Open @${link.botUsername ?? "your bot"} in Telegram and send /start.`);

  const linked = await linkOwnBotChat(s, BigInt(latest.chat.id), latest.from?.username);
  if (!linked) throw new Error("Connect your bot first");
  // The runner paused the agent while it had no usable chat or token; now it has both. A pause the user chose stays.
  for (const kind of AGENT_KINDS) {
    const agent = await getAgent(s, kind);
    if (agent?.paused && agent.pausedReason && TELEGRAM_PAUSES.includes(agent.pausedReason)) {
      await updateAgent(s, kind, { paused: false, pausedReason: null });
    }
  }
}

export async function disconnectTelegram(userId: string) {
  await removeTelegramLink(forUser(getDb(), userId));
}
