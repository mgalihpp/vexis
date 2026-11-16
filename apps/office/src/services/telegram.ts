import { Context, Effect, Layer } from "effect";
import { z } from "zod";
import { TelegramError } from "../errors.ts";
import { type Button, Update } from "../telegram.ts";

const Ok = <T extends z.ZodType>(result: T) => z.object({ ok: z.literal(true), result });
const Sent = Ok(z.object({ message_id: z.number() }));
const Updates = Ok(z.array(z.object({ update_id: z.number().int() }).passthrough()));
const Any = Ok(z.unknown());

/**
 * The owner's own office bot: approval cards out, button presses and commands in. Every request URL carries the
 * token, so errors are reduced to a message with the token scrubbed out.
 */
export class Telegram extends Context.Service<
  Telegram,
  {
    /** Returns the message id, so the card can be edited later. */
    send(
      token: string,
      chatId: number,
      text: string,
      buttons?: readonly Button[],
    ): Effect.Effect<number, TelegramError>;
    /** Replaces the text and drops the buttons. */
    edit(token: string, chatId: number, messageId: number, text: string): Effect.Effect<void, TelegramError>;
    /**
     * Updates from `offset` on, without waiting, and the offset that confirms them all (null when there were none).
     * An update whose fields the office does not know is skipped but still confirmed.
     */
    updates(
      token: string,
      offset: number | null,
    ): Effect.Effect<{ readonly updates: ReadonlyArray<Update>; readonly next: number | null }, TelegramError>;
    /** Stops the button's spinner, with a short toast when `text` is not empty. */
    answer(token: string, callbackId: string, text: string): Effect.Effect<void, TelegramError>;
  }
>()("vexis/office/Telegram") {
  static readonly layer = Layer.succeed(
    Telegram,
    (() => {
      const call = <T>(token: string, method: string, body: Record<string, unknown>, schema: z.ZodType<T>) =>
        Effect.tryPromise({
          try: async (signal) => {
            const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
              signal,
            });
            const json: unknown = await response.json().catch(() => null);
            const parsed = schema.safeParse(json);
            if (!parsed.success) throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)?.slice(0, 200)}`);
            return parsed.data;
          },
          catch: (cause) => new TelegramError({ message: `${method}: ${String(cause)}`.replaceAll(token, "***") }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: "15 seconds",
            orElse: () => Effect.fail(new TelegramError({ message: `${method}: timed out` })),
          }),
        );

      return Telegram.of({
        send: (token, chatId, text, buttons = []) =>
          call(
            token,
            "sendMessage",
            {
              chat_id: chatId,
              text,
              link_preview_options: { is_disabled: true },
              ...(buttons.length > 0 && { reply_markup: { inline_keyboard: [buttons] } }),
            },
            Sent,
          ).pipe(Effect.map((r) => r.result.message_id)),
        edit: (token, chatId, messageId, text) =>
          call(token, "editMessageText", { chat_id: chatId, message_id: messageId, text }, Any).pipe(Effect.asVoid),
        updates: (token, offset) =>
          call(
            token,
            "getUpdates",
            {
              ...(offset !== null && { offset }),
              limit: 100,
              timeout: 0,
              allowed_updates: ["message", "callback_query"],
            },
            Updates,
          ).pipe(
            Effect.map(({ result }) => ({
              updates: result.flatMap((u) => Update.safeParse(u).data ?? []),
              next: result.length > 0 ? Math.max(...result.map((u) => u.update_id)) + 1 : null,
            })),
          ),
        answer: (token, callbackId, text) =>
          call(token, "answerCallbackQuery", { callback_query_id: callbackId, ...(text && { text }) }, Any).pipe(
            Effect.asVoid,
          ),
      });
    })(),
  );
}
