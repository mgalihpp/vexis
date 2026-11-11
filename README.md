<div align="center">

<img src="apps/web/public/favicon.png" alt="Vexis" width="120" height="120" />

# Vexis

Portfolio tracker and pool analytics for Meteora DLMM on Solana.

[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![React 19](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)](https://react.dev)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/start)
[![Vite 8](https://img.shields.io/badge/Vite_8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com)
[![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana&logoColor=white)](https://solana.com)
[![Meteora DLMM](https://img.shields.io/badge/Meteora-DLMM-BAF448)](https://www.meteora.ag)
[![Biome](https://img.shields.io/badge/Biome-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev)

[Live app](https://stunobagent.my.id) · [Run locally](#running-it-locally) · [Deploy](#deploy)

</div>

Meteora's own UI tells you what you hold right now. It is much less helpful about what you held three months ago. Vexis reads a wallet's whole DLMM history from Meteora's data API and shows it in one place: every closed and active position, PnL in SOL and USD, a chart you can bucket by day, week or month, and a calendar of your trading days.

The second half is pool analytics. Pick any DLMM pool and you get the price chart, volume, TVL, fees, LP and trader counts, and the liquidity sitting in each bin around the active bin. Bins and fees are read on-chain, not estimated.

Alerts come in two flavors. The browser watches your favorite wallets and pools and notifies you when a position opens, closes or goes out of range. Separately, the runner polls pools once a minute and sends a Telegram message when a pool's volume spikes against its own recent median.

## What it does

**Portfolio.** Paste a Solana wallet address. The Overview tab has net P&L, win rate, profit factor, day win % and average win/loss, plus a chart and a month calendar. Active, Closed, Balances and Transactions have their own tabs. Every amount is shown in SOL and USD, and the date range and pair filter live in the URL, so you can send someone a link to the exact view you are looking at.

**Analytics.** Price chart, volume, TVL, fees, LP and trader counts, plus the bin distribution around the active bin, for any pool. A Traders section shows recent swaps and the token's biggest traders, labelled KOL, whale, smart money or bot.

**Screener.** Every DLMM pool worth a look in one list: Fee/TVL, fee pace over the last 24 hours, APR, volume, TVL and risk flags, sortable by any column and filtered by minimum TVL, volume and bin step.

**Alerts.** Two separate things. In the browser, notifications for your favorite wallets and pools: opened, closed, out of range, volume spike. In Telegram, a saved `volume-watch` agent per user: the runner stores one minute of volume per pool, compares it to the median of the previous 30 minutes, and sends a message when the newest minute is both above your USD threshold and above your multiplier (both configurable). Cooldowns stop it from spamming you.

A few things are deliberately honest instead of convenient. A token with no Jupiter price shows a dash and is left out of totals rather than counted at zero. A field nobody can source, like limit order bonus, is a dash. Incomplete data says so instead of pretending to be complete.

## Running it locally

You need [Bun](https://bun.sh) 1.4 or newer and a Postgres database. Supabase works out of the box; the setup is in `packages/db/README.md`.

```bash
git clone https://github.com/mgalihpp/vexis.git
cd vexis
bun install
cp .env.example .env   # fill in DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, TOKEN_ENC_KEY
bun run db:migrate
bun run db:invite --email you@example.com
bun run dev:web
```

The app runs at http://localhost:3000. Sign-up is invite-only, so the invite from `db:invite` is what gets you an account. The dev scripts need different pieces of the same `.env`; the table below says which.

One thing worth knowing before you test with a big wallet: Meteora allows 300 requests per window per IP, and that budget is shared by everything on the machine. Closed positions therefore load in the background while the page shows progress, and they are cached in `.state/portfolio-cache/`. A large wallet takes a few minutes the first time and is instant afterwards.

## Configuration

| Variable                 | Used by     | Default                              | What it does                                              |
| ------------------------ | ----------- | ------------------------------------ | --------------------------------------------------------- |
| `DATABASE_URL`           | web, runner | none                                 | Supabase Postgres, transaction pooler on port 6543        |
| `DATABASE_MIGRATE_URL`   | drizzle-kit | falls back to `DATABASE_URL`         | Session pooler on port 5432, for migrations               |
| `BETTER_AUTH_SECRET`     | web         | none                                 | Long random string used to sign sessions                  |
| `BETTER_AUTH_URL`        | web         | none                                 | Public origin; requests from another origin are rejected  |
| `TOKEN_ENC_KEY`          | web, runner | none                                 | 32 random bytes, base64; encrypts the Telegram bot tokens |
| `WALLET_ENC_KEY`         | web, runner | none                                 | 32 random bytes, base64; encrypts auto-rebalance wallets  |
| `SOLANA_RPC_URL`         | web         | public mainnet endpoint              | RPC for the analytics page's on-chain bin and fee reads   |
| `JUPITER_API_KEY`        | web, runner | none, uses `lite-api.jup.ag`         | Switches Jupiter calls (prices, balances, zap swaps)      |
| `SOLANA_TRACKER_API_KEY` | web         | none, recent trades only             | Solana Tracker key for whale, smart money and KOL lists   |
| `METEORA_DATAPI_URL`     | web, runner | `https://dlmm.datapi.meteora.ag`     | Meteora data API base URL                                 |
| `VEXIS_CACHE_DIR`        | web         | `.state/portfolio-cache` in the repo | Where closed positions and transaction history are cached |
| `VEXIS_WEB_URL`          | runner      | falls back to `BETTER_AUTH_URL`      | Origin used in alert links                                |
| `RESEND_API_KEY`         | web, script | none                                 | Resend key for invite mail (`db:invite --send`, notices)  |
| `MAIL_FROM`              | web, script | `Vexis <invite@stunobagent.my.id>`   | Sender of invite mail                                     |
| `INVITE_NOTIFY_EMAIL`    | web         | none, no notice                      | Gets a one-line mail for each new invite request          |
| `NITRO_PRESET`           | build       | `bun`                                | Build target, for example `node-server`                   |

There is no shared Telegram bot. Each user links their own BotFather bot per agent (Volume spike and Auto-rebalance each have their own): paste the token in the agent's settings, send `/start` to it, and press Check. The token is stored AES-256-GCM encrypted with `TOKEN_ENC_KEY`, which is why the web app and the runner need the same value.

## Scripts

| Command                | What it does                               |
| ---------------------- | ------------------------------------------ |
| `bun run dev:web`      | Dev server on port 3000                    |
| `bun run dev:agents`   | The alert runner, watching for changes     |
| `bun run start:agents` | The alert runner without file watching     |
| `bun test`             | All tests in every workspace               |
| `bun run typecheck`    | `tsc --noEmit` in every workspace          |
| `bun run lint`         | Biome check (`lint:fix` applies fixes)     |
| `bun run build`        | Production build into `apps/web/.output`   |
| `bun run docs:fetch`   | Refresh the offline docs in `docs/`        |
| `bun run db:generate`  | Turn `schema.ts` changes into a migration  |
| `bun run db:migrate`   | Apply migrations                           |
| `bun run db:studio`    | Open Drizzle Studio                        |
| `bun run db:isolation` | Check that scoped queries keep users apart |
| `bun run db:invite`    | Create an invite; `--send`, `--requests`   |

CI runs lint, typecheck, test and build on every PR, so the same four locally is a good sanity check.

## Project layout

```
apps/
  web/                  TanStack Start app, the product
    src/routes/         thin route files: search params, loader, SSR mode
    src/features/       domain code: portfolio, analytics, screener, auth, agents, notifications, settings, theme
    src/components/ui/  shadcn/ui, generated by the CLI
  agents/               volume-spike runner (Effect 4, its own Bun process)
packages/
  db/                   Drizzle schema, queries and migrations for Supabase Postgres
docs/                   offline reference docs, generated by scripts/fetch-docs.ts
```

Routes stay thin. Domain code lives in `src/features/<feature>/`, and inside a feature `*.functions.ts` holds `createServerFn` wrappers that any file may import, `*.server.ts` holds server-only code, and plain `.ts` files hold client-safe types and pure logic. TanStack Start fails the build if client code imports a `.server.ts` file. Imports use the `@/` alias; there are no barrel `index.ts` files.

`packages/db` is worth reading before touching user data. Every user-owned table carries a `user_id`, and the app only reaches those tables through the `forUser(db, userId)` helpers, so a scoped query cannot quietly become unscoped.

## Routes

| Route                | Page                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `/`                  | Redirects to `/portfolio`                                               |
| `/portfolio`         | Wallet search with favorites and recent wallets                         |
| `/portfolio/$wallet` | Overview, Active, Closed, Balances and Transactions                     |
| `/analytics`         | Pool analytics; `?pool=` picks the pool                                 |
| `/screener`          | Pool screener: every pool above $1K TVL and volume, sorted and filtered |
| `/agents`            | Agents; `/agents/new` and `/agents/$agentId` for the wizard and detail  |
| `/login`             | Sign in, or join with an invite                                         |
| `/terms`, `/privacy` | Public pages, readable without an account                               |

## The runner

The web app does not send Telegram messages; `apps/agents` does. It runs one tick a minute: read the runnable agents, fetch every distinct pool once (batched), store that minute's volume, evaluate each agent against its own config, then claim the cooldown and send. Alerts go out with the bot the user linked for that agent, so the runner never polls Telegram.

Auto-rebalance agents run on the same minute. A user can run one per pool; each reads the agent wallet's position in its pool on-chain, through the RPC URL the user saved with the wallet. When the wallet's one funded position has left its range, the agent acts on it. A new agent starts in preview: it records the range it would move to and sends a Telegram preview, and nothing is signed. Once the user switches it to Live in its settings, the runner decrypts the agent wallet and rebalances the position on-chain (withdraw, balancing swap, deposit around the active bin), then compounds or sweeps the claimed fees if the agent is set to, stores the signature and sends a Solscan link. In range, a live agent with a claim threshold claims its fees once they are worth that much SOL. A failed rebalance is reported and retried after the cooldown; three failures in a row pause the agent. A wallet holding less SOL than the agent's reserve pauses it until the user tops up and resumes.

On a VPS it runs next to the web process under pm2:

```bash
pm2 start "bun apps/agents/src/main.ts" --name vexis-agents
```

It needs `DATABASE_URL`, `TOKEN_ENC_KEY` and `WALLET_ENC_KEY`, the same values the web app uses, and refuses to start without a valid `WALLET_ENC_KEY`. It has no RPC of its own: every auto-rebalance read and send goes through the RPC URL each user saved with their agent wallet. Users should give a Helius URL, since live sends take their priority fee from Helius `getPriorityFeeEstimate` and another RPC sends with no priority fee.

## Deploy

```bash
bun run build
bun apps/web/.output/server/index.mjs
```

The server listens on `PORT`, default 3000. Pass `NITRO_PRESET=node-server` to build for a plain Node host instead of Bun.

One gotcha from doing this the hard way: Nitro symlinks some packages into `.output/server/node_modules/.nf3` with absolute paths. If you build on your laptop and run on a server, pack the output with `tar -czhf output.tgz .output` so the archive holds real files instead of links that point at your machine.

## Notes

- `.state/` is a cache, not a database. Deleting it costs you one slow reload per wallet.
- The Meteora API only lists pools with a close in the last 365 days. `/portfolio/total` is all-time, so on a wallet older than that the app tells you when the loaded count is lower than the total.
- Day boundaries are UTC everywhere. That is deliberate; it keeps the server render and the browser render identical.
- `docs/` is generated. Edit `scripts/fetch-docs.ts`, not the files.
