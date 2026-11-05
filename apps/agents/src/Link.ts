import { Duration, Effect, Option, Ref } from "effect";
import { Db } from "./Db.ts";
import { type Incoming, Telegram } from "./Telegram.ts";

const START = /^\/start(?:@\w+)?(?:\s+(\S+))?/;

const HELP = "Send /start <code> with the code from the Agents page in Vexis to link your account.";
const LINKED = "Linked ✅ Volume alerts will be sent to this chat.";
const BAD_CODE = "Unknown or expired code. Create a new one on the Agents page.";

/** Answers one `/start <code>` message. Anything else is ignored. */
export const handleIncoming = Effect.fn("Link.handleIncoming")(function* (message: Incoming) {
  const match = START.exec(message.text.trim());
  if (!match) return;

  const db = yield* Db;
  const telegram = yield* Telegram;
  const code = match[1];
  const reply = code
    ? Option.match(yield* db.redeemLink(code, message.chatId, message.username), {
        onSome: () => LINKED,
        onNone: () => BAD_CODE,
      })
    : HELP;
  yield* telegram.send(message.chatId, reply);
});

const POLL_TIMEOUT_SEC = 25;
const RETRY_DELAY = Duration.seconds(5);

/**
 * Link flow without a public endpoint: long-poll `getUpdates` and redeem the codes users send.
 * A failed message is logged and skipped; a failed poll waits and polls again.
 */
export const linkLoop = Effect.gen(function* () {
  const telegram = yield* Telegram;
  const offset = yield* Ref.make(0);

  const poll = Effect.gen(function* () {
    const messages = yield* telegram.updates(yield* Ref.get(offset), POLL_TIMEOUT_SEC);
    yield* Effect.forEach(
      messages,
      (message) =>
        handleIncoming(message).pipe(
          Effect.catch((error) => Effect.logWarning("telegram message failed", error)),
          Effect.andThen(Ref.update(offset, (current) => Math.max(current, message.updateId + 1))),
        ),
      { discard: true },
    );
  }).pipe(
    Effect.catch((error) =>
      Effect.logWarning("telegram poll failed", error).pipe(Effect.andThen(Effect.sleep(RETRY_DELAY))),
    ),
  );

  return yield* Effect.forever(poll);
});
