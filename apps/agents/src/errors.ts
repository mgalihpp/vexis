import { Schema } from "effect";

/** A Postgres call failed. `operation` names the Db method. */
export class DbError extends Schema.TaggedError<DbError>()("DbError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/** The Meteora data API failed or answered with something that does not match the schema. */
export class MeteoraError extends Schema.TaggedError<MeteoraError>()("MeteoraError", {
  cause: Schema.Defect(),
}) {}

/** The Telegram Bot API failed or answered with `ok: false`. */
export class TelegramError extends Schema.TaggedError<TelegramError>()("TelegramError", {
  method: Schema.String,
  cause: Schema.Defect(),
}) {}

/** An `agents.config` row that does not parse; the row is skipped, not run. */
export class BadAgentConfig extends Schema.TaggedError<BadAgentConfig>()("BadAgentConfig", {
  agentId: Schema.String,
  cause: Schema.Defect(),
}) {}
