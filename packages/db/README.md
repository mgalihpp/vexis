# @vexis/db

Drizzle ORM schema and client for Vexis on Supabase Postgres. Multi-user, invite-only; nothing a user owns is shared with another user.

## Setup

Put `DATABASE_URL` in the repo-root `.env` (see `.env.example`): Supabase's transaction pooler, port 6543. The client uses `postgres` (postgres-js) with `prepare: false`, since the transaction pooler does not support prepared statements.

```bash
bun run db:generate    # schema.ts -> migrations/NNNN_*.sql
bun run db:migrate     # apply pending migrations
bun run db:studio      # drizzle-kit studio
bun run db:isolation   # live check that user A cannot see user B's rows
```

drizzle-kit reads `DATABASE_MIGRATE_URL` if set and otherwise `DATABASE_URL`. Migrations apply fine through the transaction pooler (the first one did), so `DATABASE_MIGRATE_URL` is unset. If drizzle-kit ever misbehaves there (`studio`, introspection, long DDL), point `DATABASE_MIGRATE_URL` at the session pooler: same host and user, port 5432.

Never edit a migration that has been applied; change `schema.ts` and generate a new one.

## Exports

- `@vexis/db/schema`: tables and enums. Client-safe types (`typeof wallets.$inferSelect`).
- `@vexis/db/agents`: agent kinds and their zod config schemas (`VolumeWatchConfig`, `AutoRebalanceConfig`). Client-safe.
- `@vexis/db/client`: `createDb(url)`, `getDb()` (process-wide, from `DATABASE_URL`), `closeDb()`. Server-only.
- `@vexis/db/queries`: user-scoped helpers. Server-only.

The web app imports `client` and `queries` only from its own `*.server.ts` files.

## Tables

| Table                                            | Owner  | Notes                                                                                       |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| `users`, `sessions`, `accounts`, `verifications` | auth   | Better Auth's core column names, text ids. `users.role` is `admin` or `member`.             |
| `invites`                                        | admin  | SHA-256 `token_hash`, optional `email`, `max_uses`/`use_count`, `expires_at`, `revoked_at`. |
| `invite_redemptions`                             | user   | `used_by`/`used_at`, one per user.                                                          |
| `user_settings`                                  | user   | `timezone` (IANA), `currency` (`usd`/`sol`).                                                |
| `wallets`                                        | user   | Unique per `(user_id, address)`.                                                            |
| `telegram_links`                                 | user   | One bot (encrypted token) and linked chat per `(user_id, kind)`.                            |
| `agents`                                         | user   | One per `(user_id, kind)`; `enabled`, `paused`, `config` jsonb (zod-validated).             |
| `agent_pools`                                    | user   | Pools an agent watches; `last_alert_at` for the cooldown.                                   |
| `agent_alerts`                                   | user   | `vol_1m`, `baseline`, `ratio`, `delivered`, `error`, `at`.                                  |
| `rebalance_wallets`                              | user   | One per user: public key, secret key encrypted with `WALLET_ENC_KEY`.                       |
| `agent_rebalances`                               | user   | Old and new bin range, `live`, `signature`, `tx_error`, `delivered`, `error`, `at`.         |
| `pool_minutes`                                   | global | Per-minute volume per pool, shared by everyone.                                             |

## Isolation

Every user-owned table has `user_id` (FK, cascade, indexed). The app reaches those tables only through `queries.server.ts` helpers that take a `UserScope` (`forUser(db, session.userId)`) and filter by it. `agent_pools`, `agent_alerts` and `agent_rebalances` reference `agents(id, user_id)` with a composite FK, so a row can never pair one user's agent with another user's id.

RLS is enabled on every table with no policies. The server connects as `postgres`, which bypasses RLS, so RLS does not scope the app's queries; it closes the Supabase Data API (anon and authenticated keys) to every table. App-level scoping is enough because no client ever talks to Postgres directly. If that changes (Supabase client in the browser, Realtime), add policies first.

## Agents runner

The runner (`apps/agents`) reads `agents` where `enabled and not paused` (partial index `agents_runnable_idx`), collects the distinct `agent_pools.pool_address`, polls each pool once per interval into `pool_minutes`, evaluates each user's rule against those shared rows, and writes `agent_alerts` plus `agent_pools.last_alert_at`. Auto-rebalance agents join `rebalance_wallets` for the public key, read each pool on-chain and write `agent_rebalances`, sharing `last_alert_at` as their cooldown. A live agent (`config.dryRun` false) is the only reader of `rebalance_wallets.secret_key`: the runner decrypts it with `WALLET_ENC_KEY` to sign, then stores the `signature` or `tx_error` on the row. It runs as a trusted process, so it reads across users by design; anything it does on a user's behalf still carries that row's `user_id`.
