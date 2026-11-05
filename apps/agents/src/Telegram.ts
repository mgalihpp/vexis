import { Context, Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { TelegramError } from "./errors.ts";

/**
 * Sends a message through a user's own Telegram bot. There is no shared bot: every user brings a token
 * (stored encrypted, see `@vexis/db/secret`), and the web app links their chat.
 */
export class Telegram extends Context.Service<
  Telegram,
  {
    send(chatId: bigint, text: string, botToken: string): Effect.Effect<void, TelegramError>;
  }
>()("vexis/agents/Telegram") {
  static readonly layer = Layer.effect(
    Telegram,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;

      const send = Effect.fn("Telegram.send")(function* (chatId: bigint, text: string, botToken: string) {
        const client = http.pipe(
          HttpClient.mapRequest(HttpClientRequest.prependUrl(`https://api.telegram.org/bot${botToken}`)),
          HttpClient.filterStatusOk,
        );
        // Request URLs carry the token, so errors are reduced to a scrubbed message.
        yield* HttpClientRequest.post("/sendMessage").pipe(
          HttpClientRequest.bodyJson({
            chat_id: Number(chatId),
            text,
            link_preview_options: { is_disabled: true },
          }),
          Effect.flatMap(client.execute),
          Effect.timeout("15 seconds"),
          Effect.mapError(
            (cause) =>
              new TelegramError({ method: "sendMessage", cause: new Error(String(cause).replaceAll(botToken, "***")) }),
          ),
        );
      });

      return Telegram.of({ send });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}
