# Vexis

Vexis is a portfolio tracker and pool analytics app for Meteora DLMM on Solana. Paste a wallet and it reconstructs every closed and active position, with PnL in SOL and USD; pick a pool and it shows the price, volume, TVL, fees and the liquidity in each bin around the active bin. A separate runner watches pools for volume spikes and sends Telegram alerts.

A [Bun](https://bun.sh) workspaces monorepo: `apps/web` is the TanStack Start product, `apps/agents` is the alert runner, `packages/db` is the shared Drizzle schema and queries for Supabase Postgres.

## What makes Vexis special

We should never compromise on these. Everything else is negotiable.

### 1. The numbers are the product

A trader reading a PnL number decides with it. Every amount is shown in parallel SOL and USD, day boundaries are UTC so the server and the browser agree, and a value we cannot know (an unverified token with no price, limit order bonus) renders as a dash and is excluded from totals instead of being guessed. When a number looks wrong, the bug is the priority.

### 2. The API budget is the real constraint

Meteora's data API allows 300 requests per window per IP, and that budget is shared by every process on the machine. This is why closed positions load in the background, why pools are cached on disk, why a pool is refetched only when its `lastClosedAt` changes, and why `get()` in `portfolio/meteora.server.ts` is the one place that talks to the datapi. A feature that adds a request path without thinking about that budget is a defect, even when it works on a small wallet.

### 3. Two runtimes, one product

The web app serves pages; the runner runs one tick a minute. They share the schema, the zod configs, the encrypted bot tokens and the encrypted agent wallets, and they both point at the same database. A change to `agents.config`, `pool_minutes`, `agent_alerts`, `agent_rebalances` or `rebalance_wallets` is a change to both.

## A note from the maintainer

Prefer the smallest thing that makes the behavior unsurprising. Do not preserve complexity because it is already there, and do not add machinery because it looks impressive. Measure the API budget, measure the cache, then write the simplest design that keeps the page honest.

The rest of this file helps you navigate the codebase. Treat it as good defaults, not hard rules; the developer's preference wins.

## A small glossary

- **you** means the agent reading this file.
- **we, us** mean the people who build Vexis.
- **user** means the person using the app.
- **wallet** means a Solana address the user tracks; the app never asks for a signature. The one exception is the **agent wallet**: a hot wallet whose secret key the user hands an auto-rebalance agent (see Agents pages).
- **position** means one DLMM position in one pool, either active or closed.
- **pool** means a DLMM liquidity pool, identified by its address; a pair is two tokens.
- **bin** means one discrete price step inside a pool.
- **base snapshot** is the always-fast part of `loadPortfolio`: closed pool list, active pools, `/portfolio/total`, token info.
- **closed job** and **history job** are the two per-wallet background jobs (closed positions, transaction history).
- **agent** means a user's saved `volume-watch` or `auto-rebalance` configuration, not you.
- **runner** means `apps/agents`, the process that evaluates agents every minute.
- **datapi** means the Meteora DLMM data API behind `METEORA_DATAPI_URL`.

## The three ways to hurt yourself

1. **Killing by pattern.** Never kill a process by matching a name, a script, or a path. This box runs other dev servers, and your own agent process has this worktree's path in its argv. Stop only a PID you captured at spawn, and check that port 3000 is actually yours before you reuse it.
2. **Writing to live state.** `.state/portfolio-cache/` and `.state/*.json` hold caches a running server is using; `bun run db:migrate` writes to the real Supabase database from `DATABASE_URL`. Reading and copying are fine and a good way to get realistic data. Replacing or deleting them, or migrating a database you were not asked to migrate, is not.
3. **Committing a secret.** `.env` is gitignored and must stay that way. It holds `DATABASE_URL`, `BETTER_AUTH_SECRET`, `TOKEN_ENC_KEY` (which decrypts every user's bot token), `WALLET_ENC_KEY` (which decrypts every agent wallet's secret key, so real funds) and optionally `JUPITER_API_KEY` and `SOLANA_TRACKER_API_KEY`. Never print a token into a test, a fixture, a log line, a screenshot or a PR body.

## Hit every surface

The most common defect here is a change that works in the tab you tested and is missing everywhere else. Before calling work done, walk this list and say which entries applied:

- **Entry points.** `/portfolio/$wallet` has Overview, Active, Closed, Balances and Transactions; `/analytics` shares pools and prices with them. A currency or range fix usually belongs in the URL/search schema, not in one tab.
- **Runtimes.** A schema or config change reaches the web app and the runner. A runner-only change still has to render in the Agents pages.
- **Data sources.** The datapi, the discovery API, Jupiter, and the on-chain DLMM SDK fail differently. Every one of them is zod-parsed or guarded at the boundary and degrades to `—` or a message, never to a crash or a fake zero.
- **Currencies.** Every amount carries `sol` and `usd`. A new field that only has one is half a field.
- **Cache shape.** The on-disk cache is versioned (`{ version: 1, ... }`). Changing the shape means bumping the version; a mismatch starts empty on purpose.
- **Reverse states.** If you added a way in, add the way out. Pause needs unpause, delivered needs a retry path, a failed pool needs to be retried by the next job.
- **Docs.** Check whether the change makes existing guidance inaccurate before you add anything new.

## Commands

Bun workspaces monorepo, Windows dev box; Bun is the package manager, test runner and production server. Run from the repo root unless noted.

```bash
bun install
bun run dev:web        # TanStack Start dev server, http://localhost:3000
bun run dev:agents     # the alert runner (needs DATABASE_URL and TOKEN_ENC_KEY)
bun test               # all tests (bun:test), across every workspace
bun test apps/web/src/features/portfolio/portfolio.test.ts   # one file
bun test -t "month calendar"                                  # by test name
bun run typecheck      # tsc --noEmit in every workspace
bun run lint           # biome check .   (lint:fix to apply)
bun run build          # vite build of apps/web, Bun preset by default
bun run docs:fetch     # refresh docs/
bun run db:generate    # drizzle-kit: schema.ts -> packages/db/migrations
bun run db:migrate     # apply migrations to DATABASE_URL (Supabase)
bun run db:isolation   # live check that scoped queries keep users apart
bun run db:invite      # create an invite and print its join link (--email, --days, --uses; --admin <email> promotes)
```

Add shadcn components from `apps/web`: `bunx shadcn@latest add <name>`. The generated files in `src/components/ui`, `src/hooks/use-mobile.ts`, `src/hooks/use-highlighted-code.ts` and `src/lib/highlighter.tsx` are excluded from Biome on purpose so the CLI can overwrite them. Editing them is fine (the tooltip was restyled), but expect `shadcn add --overwrite` to revert your edits.

Build target is a flag, not code: `NITRO_PRESET=node-server bun run build`. Production runs `bun apps/web/.output/server/index.mjs`. The Nitro output links some packages with absolute symlinks, so when you build on one machine and run on another, pack it with `tar -czhf output.tgz .output`.

## Verifying

- `bun run lint`, `bun run typecheck` and `bun test` are what CI runs, in that order, plus `bun run build`. Run them before you push.
- Test the behavior that can break, in the pure module that owns it: `portfolio.ts`, `analytics.ts`, `agents.ts`, `spike.ts`. Those modules exist so the math can be tested without an API, a database or a browser.
- Test at one layer, the lowest one that fails. Do not repeat the same case in a wrapper test or in a second tab's copy of the same logic.
- Extend before you add: when a case already exists in a test file, add a row or an assertion there instead of a new `it`.
- Leave out tests for what types already guarantee, copy text, mock-call mirrors and props rendered to static markup.
- The runner's tests use fake layers and `TestClock` (`apps/agents/test/fakes.ts`); no sleeps and no wall-clock waits.
- Purely visual changes (spacing, colour, alignment) are proved with before/after captures, not with a test.
- A frontend change is verified once in the real client at 3000 with a real wallet that has closed positions, including the loading and progress states. Small wallets finish too fast to show the interesting path.

## Pull requests and deploy

- Conventional commit titles, plain language: `fix(portfolio): closed positions no longer double-count fees`.
- Body: the problem in a sentence or two, then how you fixed it.
- UI changes need before/after images. Never commit PR-only screenshots or assets.
- One request is one PR.
- `.github/workflows/deploy.yml` builds the web app; the runner is started separately with pm2 (`pm2 start "bun apps/agents/src/main.ts" --name vexis-agents`) and the deploy workflow does not start it yet.

## Documentation

- `docs/` is offline reference material (Meteora including `dlmm-openapi.json`, Jupiter, Effect 4, TanStack Start/Router, zod, shadcn, Telegram Mini Apps). It is generated by `scripts/fetch-docs.ts`; never hand-edit it, and check it before guessing a library API.
- Code answers most questions. A local reason the code cannot show goes in one short comment nearby, four lines at most.
- Architecture notes that span files belong in this file or in `README.md`, not in a third place.
- When a documented fact changes, rewrite or remove the old text. Do not append a second account of the new behavior.

## How it works

**Two products share the app.** The header links Portfolio and Analytics. `/` redirects to `/portfolio`.

**Auth is invite-only** (`features/auth`, Better Auth on the `packages/db` tables, email + password):

- `auth.server.ts` builds the instance (Drizzle adapter, `usePlural`, signed cookie cache 5 min, `tanstackStartCookies` last). Sign-up needs a usable invite in the `x-vexis-invite` header: a `before` hook checks it (and its bound email) on `/sign-up/email`, and the user-create `after` hook redeems it, deleting the new user if the last use went elsewhere. So `/api/auth/sign-up/email` is gated the same as the `join` server function.
- `auth.functions.ts` has `getViewer`, `signIn`, `join`, `signOut`; sign-in and join return `AuthResult` error codes instead of throwing, and `login-screen.tsx` maps them to the banner or a field.
- The root `beforeLoad` reads `viewerQuery` (cached 5 min) and redirects to `/login?redirect=…` unless `isPublicPath` (`/landing`, `/login`, `/terms`, `/privacy`, `/api/auth/*`). Public pages render without the app shell. Route guards only steer the UI: every data server function has `.middleware([requireViewer])`; only `getPrices` (root loader, also on `/login`) is open. Sign-out clears the whole query cache.
- Env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (public origin; requests from another origin are rejected), `DATABASE_URL`. `vite.config.ts` loads the repo-root `.env` for dev; production needs them in the process environment.

**Data loading is TanStack Query with SSR** (`@tanstack/react-router-ssr-query`). `getRouter` creates one `QueryClient` per router, so one per SSR request. Each feature keeps `queryOptions` in `<feature>.queries.ts`; a route loader awaits `context.queryClient.ensureQueryData(...)` (or calls `prefetchQuery` without awaiting, to stream secondary data) and the component reads the same options with `useSuspenseQuery`. Don't read `useLoaderData` for server data. A failed refetch keeps the old data on screen. Only network failures (`TypeError`, no response) are retried, three times in the browser and never on the server, because the VPS's provider NAT drops some new connections; the router's error panel reconnects on its own when a page has no data at all.

**Live updates**: refetching is the live-update mechanism. Every query refetches every 15 s while the tab is visible (`LIVE_MS` in `lib/query.ts`), and every 2 s while a background job is running.

**Server boundaries follow TanStack Start's naming convention**, and import protection fails the build if client code imports a `*.server.ts` file:

- `*.functions.ts` — `createServerFn` wrappers, safe to import anywhere (routes call these in loaders).
- `*.server.ts` — server-only code, imported only by `*.functions.ts`.
- plain `.ts` — client-safe types, schemas, pure logic.

In this Start version the validator method is `.validator(zodSchema)`, not `inputValidator`.

**Feature folders**: domain code lives in `apps/web/src/features/<feature>/` (portfolio, analytics, auth, agents, notifications, settings, theme, legal, timezone, landing). Routes in `src/routes` stay thin (search schema, loader, SSR mode, layout). Import with `@/`, no barrel `index.ts` files.

**Portfolio** (`features/portfolio`):

- `meteora.server.ts` reads Meteora's DLMM data API: `/portfolio` (pools with closes) → `/positions/{pool}/pnl?status=closed` per pool, `/portfolio/open`, `/portfolio/total`. Responses are zod-parsed at the boundary into `ClosedPosition` / `ActivePosition` (both carry parallel `sol` and `usd` amounts). Timestamps arrive in seconds and are normalized to ms.
- The API is rate limited (300 requests per window, per IP, so another local server on the same machine eats the same budget). `get()` shares one budget from `x-ratelimit-*` headers and waits out 429s.
- `loadPortfolio` never waits for closed positions. It returns a base snapshot (closed pool list, active pools, `/portfolio/total`, token info; cached 60 s per wallet) plus whatever closed positions are already in the per-pool cache, composed fresh on every call. A background job per wallet (at most one at a time, started at most once per base snapshot) fetches the stale pools, newest `lastClosedAt` first. A pool that fails is logged and stays stale until the next base refresh starts a new job. While a job runs the base snapshot is not refreshed, since the refresh would queue behind the job on the rate limit.
- The per-pool cache lives in `closed-history.server.ts` and is persisted to `$VEXIS_CACHE_DIR` (default `.state/portfolio-cache/<wallet>.json`), read once per wallet and written atomically every 50 pools and at job end. Closed positions never change, so a pool is refetched only when its `lastClosedAt` changes, and a restart is fast for pools already on disk. A missing, corrupt or other-version file starts empty.
- `Portfolio.closedProgress` is derived from the cache on each call: `loaded` pools whose entry matches `lastClosedAt`, `total` closed pools, `running` while the job is in flight. The layout shows a progress notice, the portfolio query refetches every 2 s while running, and a failed-pools notice when it stops short.
- The Transactions tab has no wallet-wide endpoint to read, so a second per-wallet background job calls `/positions/{address}/historical` once per position: active positions first (kept in memory, refetched by every job since they change), then closed positions missing from the history cache, newest `closedAt` first. It never waits for or starts the closed job; it lists positions from the base snapshot and the pool cache, and while the closed job runs it keeps picking up newly discovered positions. Like the closed job, it runs at most once per base snapshot and a failed position waits for the next one.
- Closed-position events are final and persist to `<wallet>.history.json` in the same cache dir (`transaction-history.server.ts`, `{ version: 1, positions }`), written atomically every 200 positions and at job end. Each write rewrites the whole file, so total write volume grows with the square of the save count; 200 keeps a 2,600-position wallet to about 13 writes.
- `loadTransactions` returns at once with the histories fetched so far and `progress` (`total` counts only positions known so far; `running` while either job runs). Fetching newest first makes the loaded rows a recency prefix, so the first pages are right while loading. The tab shows rows as they arrive, a progress notice, polls every 2 s while running, and shows the skeleton only before the first history lands. `loadActivity` (the per-position activity view) is a separate 60 s cache.
- `/portfolio` only lists pools with a close in the last 365 days (`days_back` max). `/portfolio/total` is all-time; once the job is done the layout shows a notice when the loaded count is lower.
- `portfolio.ts` is the pure, tested math: date-range presets, `summarize`, daily buckets, `series` (daily/weekly/monthly with gap filling), cumulative, and the Sunday-first `monthCalendar`. **All day boundaries are UTC** so SSR and hydration render the same thing.
- Filters live in the URL on `/portfolio/$wallet` (`currency`, `range`, `from`/`to` as inclusive `YYYY-MM-DD`, `pairs`); defaults are stripped with `stripSearchParams`. Child tabs read them through `usePortfolioView()`.
- `prices.server.ts` gets SOL/BTC from Jupiter `lite-api` (no key; `JUPITER_API_KEY` switches to `api.jup.ag`), loaded by the root route for the footer.
- `balances.server.ts` backs the Balances tab: Jupiter `/ultra/v1/balances/{wallet}` (native SOL arrives under the key `SOL` and is mapped to the wrapped SOL mint), enriched through `loadTokenInfo`, cached 30 s per wallet. `balances.ts` groups rows by Jupiter's `isVerified`. A token with no Jupiter `usdPrice` (common for junk tokens) keeps `price: null`, shows a dash for FDV, Price and Value, and is excluded from every total; the table says so under it.

**Analytics** (`features/analytics`, route `/analytics`): one server function (`getAnalytics`) resolves a pool (`?pool=`, else the top non-blacklisted pool by 24h volume) and fetches, in parallel: pool detail and same-pair sibling pools (`/pools?filter_by=token_x=… && token_y=…`, both directions) from the datapi; OHLCV and volume history for the chosen timeframe (96 bars; the API rejects spans over 100) plus a 7-day 4h history for the sparkline and 7d volume; Jupiter token metadata per mint; **Meteora's pool-discovery API** (`pool-discovery-api.datapi.meteora.ag/pools?query=<address>&timeframe=24h`) for active TVL, LP, position, swap, trader and net-deposit counts; and **on-chain data via the DLMM SDK** (bins around the active bin, max and total fee). It reuses `get()` from `portfolio/meteora.server.ts` for the shared rate-limit budget. `analytics.ts` is the pure, tested math (timeframes, currency conversion, `binDistribution`). The chart is custom SVG.

- The SDK needs a Solana RPC (`SOLANA_RPC_URL`, default the public mainnet endpoint) and is loaded with `createRequire` because its ESM build imports directories, which Node (and so `vite dev`) rejects. Bin and fee reads are cached 15 s per pool; a failed read leaves `chain` null and the panels degrade to a message or `—`.
- The datapi's own `max_fee_pct` is 0 for many pools; the real max comes from the SDK's `getFeeInfo()`.
- Buy/sell volume in the top stats row comes from Jupiter and is token-wide (marked `*`); the discovery API has no buy/sell split. Limit order bonus is not available anywhere and shows a dash.
- Timeframe is a loader dependency; currency, metric and token toggles are client-side search params.
- The Traders section (`traders.server.ts`, pure logic in `traders.ts`) never touches the datapi budget. Recent trades are the pool's own swaps from GeckoTerminal (`/networks/solana/pools/{pool}/trades`, free and keyless, about 30 requests a minute per IP), cached 1 min per pool, with buy and sell read against the pool's non-quote token. The trader lists come from the Solana Tracker Data API with `SOLANA_TRACKER_API_KEY`: for the non-quote token (none when both sides are SOL, USDC or USDT, so only recent trades show) the top traders sorted by invested and by PnL (`/v2/pnl/tokens/{mint}/traders`, unioned by wallet) and KOL trades (`/trades/kols/{mint}`), three requests kept a day per mint. The free plan is 2,500 requests a month, so the server sends at most 80 a UTC day (about 26 new tokens); past that, or without a key, the section shows the last lists it has and says why. Lists, the day's request count and the known-wallet registry persist to `.state/solana-tracker.json` (`{ version: 1, ... }`, written atomically, lists older than 7 days pruned) so a restart costs nothing. Labels come from one rule table (`traderTags`): KOL and bot from the API's identity (`bot`, `arbitrage` tags), whale at $10k in one swap or total bought or $50k held, smart money at $100k lifetime PnL. KOL, bot and lifetime PnL belong to the wallet, so every wallet a list marks that way is kept in the registry (`knownWallets`) and tags recent trades in any pool for free; whale is per token and is not kept. Hold status and the KOL / whale / smart group flows are derived from balance, sell counts and last buy/sell; a KOL seen only in KOL trades has no balance, so its status is a dash. Trader SOL values use the current SOL price.

**Database** (`packages/db`, see its README): Supabase Postgres through the transaction pooler (port 6543), so the postgres-js client sets `prepare: false`. drizzle-kit uses `DATABASE_MIGRATE_URL` (session pooler, port 5432) if set, else `DATABASE_URL`. Auth tables use Better Auth's core column names (`users`, `sessions`, `accounts`, `verifications`, text ids) plus `users.role`, `invites` (hashed token, optional email, max uses, expiry, revoke) and `invite_redemptions`. User-owned tables (`user_settings`, `wallets`, `telegram_links`, `agents`, `agent_pools`, `agent_alerts`, `rebalance_wallets`, `agent_rebalances`) all carry an indexed, cascading `user_id`, and app code reaches them only through `queries.server.ts` helpers that take `forUser(db, session.userId)`. `agent_pools`, `agent_alerts` and `agent_rebalances` have a composite FK to `agents(id, user_id)`, so a child row cannot pair one user's agent with another user. A user has at most one volume-watch agent (partial unique index `agents_user_volume_watch_unique`) and any number of auto-rebalance agents, each with exactly one `agent_pools` row; two auto-rebalance agents of one user on the same pool are refused in the create transaction (`lockUserAgents`), since both would act on the same position. `agents.config` is jsonb validated by the zod schema for its kind in `agents.ts` (volume-watch: mult 3, baseline 30, minUsd 5000, interval 60 s, cooldown 300 s; auto-rebalance: strategy Curve, slippage 50 bps, halfWidth null = keep the current width, cooldown 300 s, dryRun true, feeMode `keep` (or `compound`, `sweep`), feeClaimThresholdSol null = claim only on rebalance, solReserve 0.1 SOL). `rebalance_wallets` holds the secret key and the user's RPC URL, both encrypted with `WALLET_ENC_KEY`; `rpc_url` is null on wallets saved before it was required. `agent_rebalances.action` is `rebalance` or `claim` (an in-range fee claim, whose old and new range are the current one), and `fee_sol` is what the fees were worth when the runner acted. `pool_minutes` is global market data with no `user_id`: each pool is polled once a minute however many users watch it. There is no shared Telegram bot: each user brings their own, one per agent kind (`telegram_links` is keyed by `(user_id, kind)`, and a chat is unique per kind). `telegram_links.bot_token` holds the token AES-256-GCM encrypted (`packages/db/src/secret.ts`, key `TOKEN_ENC_KEY`, needed by both the web app and `apps/agents`); the web app validates it with `getMe` and reads the chat from the bot's waiting messages after the user sends /start, and the runner sends with that token. RLS is on for every table with no policies; the server connects as `postgres` and bypasses it, so RLS only closes the Supabase Data API. `client.server.ts` and `queries.server.ts` are server-only; web imports them only from its own `*.server.ts` files.

**Agents pages** (`features/agents`, routes `/agents`, `/agents/new`, `/agents/$agentId`): one volume-watch agent per user (up to 20 pools) and any number of auto-rebalance agents, one pool each, read and written through `agents.server.ts` (user-scoped `forUser` helpers) behind `agents.functions.ts` (`requireViewer`) and `agents.queries.ts`. `AgentView` is a union on `kind`; every write addresses an agent by id, and an auto-rebalance agent is named by its pool pair (`agentName`). Fleet, wizard, detail (overview, pools, alerts or rebalance history, settings) and the empty state all read Postgres; config edits go through the kind's zod schema and `parseAgentConfig`. The wizard offers volume-watch only while the user has none; its auto-rebalance pool step is single-select and leaves out pools another auto-rebalance agent manages. An auto-rebalance agent's pool is fixed at creation, so the way out is Delete in its settings (confirmed; cascades to its pools and history). Telegram is linked per agent kind: the user pastes a BotFather token in that agent's wizard or settings, sends /start to the bot and presses Check (`telegram.server.ts`); linking unpauses every agent of that kind with a Telegram pause. `telegramQuery` returns one view per kind and `TelegramPanel` takes the `kind`. Auto-rebalance needs an agent wallet and an RPC URL (`wallet.server.ts`): the user pastes a base58 secret key and an https mainnet RPC URL once (checked with `getGenesisHash`, 10 s timeout), both encrypted with `WALLET_ENC_KEY` and never returned; only the public key and the RPC's host are read back, and the RPC URL can be replaced on its own. Without a wallet or an RPC URL the agent shows "attention" and the runner skips it; saving the wallet again clears a `wallet_unreadable` pause on every auto-rebalance agent. Settings has a Preview/Live switch (`dryRun`) that asks for confirmation before going live, plus the fee mode, the in-range claim threshold and the SOL reserve; the reserve field and the wallet panel say what the wallet must hold (about 0.1 to 0.2 SOL beyond the position, and one funded position the user opened first). The history shows a Solscan link, Preview, Failed (error on hover) or Sending per row, and claim rows as "Fees claimed" with the fee in SOL. `agents.ts` is the pure, tested part (status, config form parsing, draft checks).

**Runner** (`apps/agents`, `bun run dev:agents` / `start:agents`, needs `DATABASE_URL`, `TOKEN_ENC_KEY` and `WALLET_ENC_KEY` (checked at start); optional `VEXIS_WEB_URL`, `METEORA_DATAPI_URL`, `JUPITER_API_KEY`; the Solana RPC comes from each user's agent wallet, not the environment):

- Effect 4 services with Layers: `Db` (domain operations over `@vexis/db`, drizzle client in `acquireRelease`), `Meteora` (HttpClient + `Schema`), `Telegram` (live, or a console stand-in when no token), `Chain` (DLMM SDK reads), `Zap` (signs and sends a rebalance; the only service that moves funds), `AppConfig`. Errors are `Schema.TaggedError`s in the error channel. The only `runMain` is `main.ts`; tests use fake layers plus `TestClock` (`test/fakes.ts`).
- One tick per minute (`Schedule.fixed`): `cycle` reads runnable `volume-watch` agents, fetches each distinct pool once, batched (`/pools?filter_by=pool_address=[a,b,...]`; the documented `|` separator matches nothing, commas work), stores `pool_minutes` (`volume` = delta of `cumulative_metrics.volume`, null for the first reading, a gap over 1.5 min or a cumulative that went down), then `evaluate`s each (agent, pool) with that user's config. Rows older than 7 days are pruned hourly. `intervalSec` in the config is not used yet: every agent is judged each minute.
- `spike.ts` is the pure, tested rule: median of the last `baseline` non-null minutes before the newest one, spike when `vol1m >= minUsd` and `vol1m / median >= mult`; fewer valid readings than `baseline` means warm-up (no verdict); a stale newest minute is ignored.
- Notify order: claim the per-pool cooldown (`agent_pools.last_alert_at`, row-locked transaction) -> insert `agent_alerts` undelivered -> one Telegram message per agent per tick -> mark delivered, or store the error and hand the cooldown back. No linked chat pauses the agent with `paused_reason = telegram_not_linked`; linking unpauses it. The console stand-in never pauses anyone.
- Alerts are sent with the bot token the user linked for that agent kind (`telegramTarget(userId, kind)` in `Db`). The runner does no Telegram polling.
- Auto-rebalance (`Rebalance.ts`, its own 1-minute schedule) reads each (agent, pool) on-chain through `Chain` (DLMM SDK over the RPC URL the user saved with the wallet, decrypted by `Db.runnableRebalances`, so it costs no datapi budget but one SDK read and one `getBalance` per pool per minute on the user's RPC). `Chain` and `Zap` keep one `Connection` per distinct URL, and errors are scrubbed of it (`rpc.ts`). A wallet without an RPC URL is skipped; one whose URL no longer decrypts pauses the agent with `wallet_unreadable`. `range.ts` is the pure, tested rule, ported from auto-rebalance-dlmm-bot: exactly one funded position (none or several is skipped, never guessed), out of range when the active bin is outside `[lower, upper]` with no drift threshold, new range `active ± halfWidth` or the current half width re-centered. Watches are grouped by wallet: wallets run in parallel (4 at a time), a wallet's pools one after another, so one wallet never has two transactions in flight.
- Out of range with `dryRun` true (the default): claim cooldown -> row (`live` false) -> Telegram preview (naming the fee mode) -> settle; a failed message hands the cooldown back. Nothing decrypts the wallet, and there is no balance gate.
- Out of range with `dryRun` false: `Db.walletSigner` decrypts the secret (the only place anything does) and checks it against the stored public key; if it does not decrypt or match, the agent pauses with `wallet_unreadable`. A wallet holding less native SOL than `solReserve` pauses the agent with `low_sol` and one Telegram message naming balance and reserve. Then claim cooldown -> row (`live` true) -> `Zap.rebalance` -> store `signature` or `tx_error` -> fee step -> Telegram (Solscan link, or the error) -> settle. The fee step compounds (`compound`, deposit into the new range, never spending native SOL below the reserve) or sweeps to SOL (`sweep`, Jupiter) the fees the zap claimed, as read before the zap; a failed fee step is logged and added to the message, and the rebalance stays sent. The cooldown is never handed back once a transaction was attempted, so failures retry at most once per cooldown, and after `REBALANCE_FAILURE_LIMIT` (3) failed live `rebalance` rows in a row the agent pauses with `rebalance_failing` until the user resumes it.
- In range with `dryRun` false, `feeMode` not `keep`, a `feeClaimThresholdSol` and a pool with a SOL side: once the fees are worth the threshold (`fees.ts`, valued at the active bin price), the same checks and cooldown, then a `claim` row -> `Zap.claimFees` -> compound or sweep -> settle -> Telegram. A claim that finds no fee drops its row and hands the cooldown back; a failed claim is reported and retried after the cooldown, never pauses the agent and does not count toward `rebalance_failing`. In preview the claim path only logs. `fees.ts` is the pure, tested fee math, ported from the bot (`feeValueInLamports`, `compoundTopUpAmounts`, `planSweepLegs`, reserve-aware `compoundSpendableBalance`); `fee-execute.ts` sends through `send.ts` like every other leg.
- The send path is ported from auto-rebalance-dlmm-bot; read its `AGENTS.md` "Close the loop" before changing it. `zap-execute.ts`: zap-sdk estimate, missing user ATAs created first (Token-2022 aware, else 3012), legs setup -> init-bin-array -> rebalance-position -> swap -> ledger -> zap-in -> clean-up, with the neighbouring bin arrays zap-sdk assumes created right before zap-in (else 3007). `send.ts`: simulate at 1.4M CU, limit `ceil(used * 1.1)` (swap leg 1.5x with a 400k floor), Helius `getPriorityFeeEstimate` at High (a non-Helius RPC sends with no priority fee and logs a warning), `skipPreflight` send with 1 s poll and 2.5 s resend until the blockhash expires, 3 attempts with a fresh blockhash each. Do not turn it into a static limit or preflight-on. `@solana/web3.js` stays on v1.

## Styling and theme

- The reference UI is shadcn on Tailwind with the browser-default 16px root and the zinc base color, so our classes mean the same px as theirs: body text is `text-xs` (12px), radius `0.45rem`. Match it by measuring the reference UI's computed styles in a browser (`getComputedStyle`), not screenshots, since screenshots on a 125% Windows display are scaled. Only the lime `--brand` differs.
- Tokens in `src/styles.css`: `--brand` (lime `#BAF448` sampled from `public/logo.png` in dark; a deeper lime in light), `--profit`, `--loss`. Profit/loss values were tuned to clear WCAG 4.5:1 on their own tinted calendar cells; re-measure if you change them.
- Theme is light/dark/system, stored in `localStorage` (`vexis-theme`), default dark. `features/theme/theme.ts` exports an inline script that the root route puts in `<head>` to set `.dark` before paint; `<html>` has `suppressHydrationWarning` for that reason. Components must render the same markup for every theme on the server.
- The share-image card (`share-dialog.tsx`, rendered with `html-to-image`) follows the app theme with no background, switches to `.dark` or `.light-card` token scopes for a picked color, and draws textures in `currentColor`.
- `components/ui` exports own their look. Pick a `variant` or `size`; do not restyle one with `className`. If none fits and the look is a generic concept, add a variant to the component; a look that belongs to one feature stays in that feature. Layout classes belong on the parent.
- **Recharts gotcha**: Recharts injects its own `label` prop into custom `<Tooltip content>` elements, so never name a custom tooltip prop `label`.

## Where code lives

- `apps/web/src/routes` — thin route files: search schema, loader, SSR mode, layout.
- `apps/web/src/features` — domain code: portfolio, analytics, auth, agents, notifications, settings, theme, legal, timezone, landing.
- `apps/web/src/components/ui` — shadcn/ui, generated by the CLI.
- `apps/agents` — the volume-spike runner (Effect 4, separate Bun process, pm2 on the VPS).
- `packages/db` — Drizzle schema, postgres-js client, user-scoped query helpers and migrations.
- `docs/` — offline reference docs, generated by `scripts/fetch-docs.ts`; never hand-edit, excluded from Biome.
- `scripts/fetch-docs.ts` — the only thing that writes `docs/`.

## Taste

- Inferred types over annotations. `any` is the enemy.
- Default to no comment. Write one only for a constraint, an external quirk, or an invariant the code cannot show, in one line where you can and four at most. Don't restate names, narrate steps, or explain the fix you just made; the PR carries that.
- React effects are for synchronizing with something outside React. Derive in render and act in handlers instead.
- Do not add a dependency for something forty lines of code can do, and do not reach for a state library when the URL or TanStack Query already holds the state.
- A new amount, timestamp or pool field is added in one place: the zod schema at the API boundary. Everything downstream derives its type from there.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.
