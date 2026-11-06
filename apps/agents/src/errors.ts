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

/** An on-chain read through the DLMM SDK failed (RPC down, rate limited, or not a DLMM pool). */
export class ChainError extends Schema.TaggedError<ChainError>()("ChainError", {
  poolAddress: Schema.String,
  cause: Schema.Defect(),
}) {}

/** A live rebalance failed: building the zap, or a leg that failed to simulate or land. Never carries a secret. */
export class ZapError extends Schema.TaggedError<ZapError>()("ZapError", {
  message: Schema.String,
}) {}
