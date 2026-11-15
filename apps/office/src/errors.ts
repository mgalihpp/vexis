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

/** An on-chain read through the DLMM SDK or the RPC failed. The message never carries the RPC URL. */
export class ChainError extends Schema.TaggedError<ChainError>()("ChainError", {
  message: Schema.String,
}) {}

/** An LLM call failed or answered in a shape its provider does not document. The message never carries the key. */
export class LlmError extends Schema.TaggedError<LlmError>()("LlmError", {
  message: Schema.String,
}) {}

/** An `office_config` row whose guardrails or models do not parse; the office is skipped, not run. */
export class BadOfficeConfig extends Schema.TaggedError<BadOfficeConfig>()("BadOfficeConfig", {
  userId: Schema.String,
  cause: Schema.Defect(),
}) {}
