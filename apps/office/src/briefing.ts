import { briefingDay, briefingDue, briefingStats, dayKey } from "@vexis/shared/briefing";
import { utcDayStart } from "@vexis/shared/office";
import { briefingPrompt } from "@vexis/shared/office-prompts";
import { Effect, Option } from "effect";
import { ask, type Office, say } from "./ask.ts";
import { sendBriefing } from "./inbox.ts";
import { Db } from "./services/db.ts";
import { briefingText } from "./telegram.ts";

const DAY_MS = 86_400_000;
/** Feed lines the Manager reads, the newest of the day; the counts in the stats still cover every line. */
const FEED_LINES = 120;

/**
 * The Manager's briefing on yesterday (UTC), once a day: numbers from the office's own tables, prose from the Manager's
 * model under the usual LLM budget. Reads no datapi and no chain. The stored row is what makes it run once.
 */
export const dailyBriefing = (office: Office) =>
  Effect.gen(function* () {
    if (!office.models.manager) return;
    const db = yield* Db;
    const day = briefingDay(office.now, office.row.createdAt);
    if (day === null) return;
    const lastBriefed = yield* db.lastBriefedDay(office.userId);
    const attempts = yield* db.attempts(office.userId, briefingPrompt.version, utcDayStart(office.now));
    if (!briefingDue(day, lastBriefed, attempts, office.now)) return;

    const activity = yield* db.dayActivity(office.userId, day, new Date(day.getTime() + DAY_MS));
    const open = yield* db.openJournal(office.userId);
    const stats = briefingStats({
      day,
      proposals: activity.proposals,
      closes: activity.closes,
      open,
      runs: activity.runs,
      messages: activity.messages,
    });
    const answer = yield* ask(office, "manager", briefingPrompt, {
      stats,
      proposals: activity.proposals.map((p) => ({
        kind: p.kind,
        poolName: p.poolName,
        status: p.status,
        decidedBy: p.decidedBy,
      })),
      feed: activity.messages.slice(-FEED_LINES).map((m) => ({ agent: m.agent, text: m.text, tone: m.tone })),
    });
    if (Option.isNone(answer)) return;
    const { value, runId } = answer.value;
    const row = yield* db.insertBriefing(office.userId, { day: dayKey(day), stats, ...value, runId });
    if (!row) return;
    yield* say(office, "manager", `Briefing for ${row.day}: ${value.headline}`, "info");
    yield* sendBriefing(office, briefingText({ ...value, stats }));
  });
