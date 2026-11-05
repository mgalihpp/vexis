import { Config, Context, Duration, Effect, Layer, Option, Redacted, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { TelegramError } from "./errors.ts";

/** The part of a Telegram update the runner reads: a text message and who sent it. */
export type Incoming = {
  readonly updateId: number;
  readonly chatId: bigint;
  readonly username: string | undefined;
  readonly text: string;
};

const Updates = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.Array(
    Schema.Struct({
      update_id: Schema.Number,
      message: Schema.optional(
        Schema.Struct({
          chat: Schema.Struct({ id: Schema.Number }),
          from: Schema.optional(Schema.Struct({ username: Schema.optional(Schema.String) })),
          text: Schema.optional(Schema.String),
        }),
      ),
    }),
  ),
});

/** Telegram Bot API, or a console stand-in when no bot token is configured. */
export class Telegram extends Context.Service<
  Telegram,
  {
    /** False for the console stand-in: nobody has a chat there, so agents must not be paused. */
    readonly requiresLink: boolean;
    /** `botToken` is the user's own bot; without it the shared bot sends. */
    send(chatId: bigint, text: string, botToken?: string): Effect.Effect<void, TelegramError>;
    /** Long-polls `getUpdates`; text messages only. `offset` is the next update id wanted. */
    updates(offset: number, timeoutSec: number): Effect.Effect<ReadonlyArray<Incoming>, TelegramError>;
  }
>()("vexis/agents/Telegram") {
  static readonly layerLive = (shared: Option.Option<Redacted.Redacted>) =>
    Layer.effect(
      Telegram,
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient;
        const sharedSecret = Option.map(shared, Redacted.value);
        const clientFor = (secret: string) =>
          http.pipe(
            HttpClient.mapRequest(HttpClientRequest.prependUrl(`https://api.telegram.org/bot${secret}`)),
            HttpClient.filterStatusOk,
          );

        // Request URLs carry the token, so errors are reduced to a scrubbed message.
        const fail = (method: string, secret: string) => (cause: unknown) =>
          new TelegramError({ method, cause: new Error(String(cause).replaceAll(secret, "***")) });

        const send = Effect.fn("Telegram.send")(function* (chatId: bigint, text: string, botToken?: string) {
          const secret = botToken ?? Option.getOrUndefined(sharedSecret);
          if (secret === undefined)
            return yield* Effect.logInfo(`[telegram:console] to ${chatId}
${text}`);
          const client = clientFor(secret);
          yield* HttpClientRequest.post("/sendMessage").pipe(
            HttpClientRequest.bodyJson({
              chat_id: Number(chatId),
              text,
              link_preview_options: { is_disabled: true },
            }),
            Effect.flatMap(client.execute),
            Effect.timeout("15 seconds"),
            Effect.mapError(fail("sendMessage", secret)),
          );
        });

        const updates = Effect.fn("Telegram.updates")(function* (offset: number, timeoutSec: number) {
          // Without a shared bot there is nobody to poll; users bring their own and link through the web app.
          if (Option.isNone(sharedSecret)) return yield* Effect.sleep(Duration.seconds(timeoutSec)).pipe(Effect.as([]));
          const client = clientFor(sharedSecret.value);
          const response = yield* client
            .get("/getUpdates", {
              urlParams: { offset, timeout: timeoutSec, allowed_updates: JSON.stringify(["message"]) },
            })
            .pipe(
              Effect.flatMap(HttpClientResponse.schemaBodyJson(Updates)),
              Effect.timeout(Duration.sum(Duration.seconds(timeoutSec), Duration.seconds(15))),
              Effect.mapError(fail("getUpdates", sharedSecret.value)),
            );
          return response.result.flatMap((u): Incoming[] =>
            u.message?.text === undefined
              ? []
              : [
                  {
                    updateId: u.update_id,
                    chatId: BigInt(u.message.chat.id),
                    username: u.message.from?.username,
                    text: u.message.text,
                  },
                ],
          );
        });

        return Telegram.of({ requiresLink: true, send, updates });
      }),
    ).pipe(Layer.provide(FetchHttpClient.layer));

  /** Live. The shared bot is `TELEGRAM_BOT_TOKEN`; without it only users' own bots can send. */
  static readonly layer = Layer.unwrap(
    Effect.gen(function* () {
      const token = yield* Config.Redacted("TELEGRAM_BOT_TOKEN").pipe(Config.option);
      if (Option.isNone(token)) {
        yield* Effect.logWarning("TELEGRAM_BOT_TOKEN is not set: only users with their own bot get Telegram alerts");
      }
      return Telegram.layerLive(token);
    }),
  );
}
