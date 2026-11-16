import type { ProposalRow } from "@vexis/db/office-queries";
import { REFUSAL_TEXT } from "@vexis/shared/office";
import { Clock, Effect } from "effect";
import { type Office, say } from "./ask.ts";
import { Db, type PolledBot } from "./services/db.ts";
import { Telegram } from "./services/telegram.ts";
import { cardButtons, cardText, HELP_TEXT, type Inbound, readUpdate, settledText } from "./telegram.ts";

/**
 * Puts a proposal that now waits for the owner on their office bot. No linked bot means no card, and the web panel
 * still works; a failed send never blocks the proposal, the feed just says the card did not arrive.
 */
export const sendCard = (office: Office, proposal: ProposalRow) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const bot = yield* db.officeBot(office.userId);
    if (bot._tag === "missing") return;
    const where = { poolAddress: proposal.poolAddress, proposalId: proposal.id };
    const undelivered = (why: string) =>
      say(office, "manager", `The Telegram card was not delivered (${why}). Decide here instead.`, "warn", where);
    if (bot._tag === "unreadable") return yield* undelivered("the bot token needs to be linked again");
    yield* (yield* Telegram).send(bot.token, bot.chatId, cardText(proposal), cardButtons(proposal.id)).pipe(
      Effect.flatMap((messageId) => db.setCard(office.userId, proposal.id, messageId)),
      Effect.catchTag("TelegramError", (error) =>
        Effect.logWarning(`office ${office.userId}: card not sent: ${error.message}`).pipe(
          Effect.andThen(undelivered("Telegram did not accept it")),
        ),
      ),
    );
  });

const RESUME_TEXT = {
  no_office: "There is no office on this account.",
  running: "The office is already running.",
  resumed: "The office is running again.",
  locked: "This pause cannot be lifted from here.",
  changed: "The pause changed meanwhile. Try /resume again.",
} as const;

const handle = (bot: PolledBot, inbound: Inbound, now: number) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const tg = yield* Telegram;
    const reply = (text: string) => tg.send(bot.token, bot.chatId, text).pipe(Effect.asVoid);
    switch (inbound._tag) {
      case "ignore":
        return;
      case "dismiss":
        return yield* tg.answer(bot.token, inbound.callbackId, "");
      case "decide": {
        const result = yield* db.decide(bot.userId, inbound.proposalId, inbound.decision, new Date(now));
        const done = inbound.decision === "approve" ? "Approved" : "Rejected";
        return yield* tg.answer(bot.token, inbound.callbackId, result.ok ? done : REFUSAL_TEXT[result.refusal]);
      }
      case "command":
        switch (inbound.command) {
          case "stop": {
            const rejected = yield* db.kill(bot.userId);
            if (rejected === null) return yield* reply(RESUME_TEXT.no_office);
            return yield* reply(`Office stopped. ${rejected} proposal(s) rejected. Send /resume to start again.`);
          }
          case "resume":
            return yield* reply(RESUME_TEXT[yield* db.resume(bot.userId, new Date(now))]);
          case "help":
            return yield* reply(HELP_TEXT);
        }
    }
  });

/** Edits every card whose proposal stopped waiting, whichever surface decided it, and forgets it. */
const settleCards = (bot: PolledBot) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const tg = yield* Telegram;
    for (const p of yield* db.settledCards(bot.userId)) {
      if (p.telegramMessageId === null) continue;
      // A card that cannot be edited (deleted, or sent from a bot since replaced) is given up, not retried forever.
      yield* tg
        .edit(bot.token, bot.chatId, p.telegramMessageId, settledText(p))
        .pipe(Effect.catchTag("TelegramError", (e) => Effect.logWarning(`card ${p.id} not edited: ${e.message}`)));
      yield* db.setCard(bot.userId, p.id, null);
    }
  });

const pollBot = (bot: PolledBot) =>
  Effect.gen(function* () {
    const { updates, next } = yield* (yield* Telegram).updates(bot.token, bot.offset);
    const now = yield* Clock.currentTimeMillis;
    for (const update of updates) {
      yield* handle(bot, readUpdate(update, bot.chatId), now).pipe(
        Effect.catchTag("TelegramError", (e) => Effect.logWarning(`office ${bot.userId}: reply failed: ${e.message}`)),
      );
    }
    if (next !== null) yield* (yield* Db).setUpdateOffset(bot.userId, next);
    yield* settleCards(bot);
  });

/** One short poll of every linked office bot: button presses, /stop and /resume, then the cards to settle. */
export const pollInbox = Effect.fn("office.inbox")(function* () {
  const bots = yield* (yield* Db).polledBots();
  yield* Effect.forEach(
    bots,
    (bot) =>
      pollBot(bot).pipe(
        Effect.catchTag("TelegramError", (e) => Effect.logWarning(`office ${bot.userId}: poll failed: ${e.message}`)),
        Effect.catchTag("DbError", (e) => Effect.logError(`office ${bot.userId} inbox: ${e.operation}`, e.cause)),
      ),
    { concurrency: 4, discard: true },
  );
});
