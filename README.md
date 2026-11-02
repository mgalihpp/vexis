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

[Live app](https://stunobagent.my.id) · [Run locally](#run-locally) · [Deploy](#deploy)

</div>

## Features

**Portfolio.** Paste a Solana wallet to see its DLMM positions from Meteora's data API. The Overview tab has PnL totals, a daily, weekly or monthly chart and a month calendar. Active, Closed, Balances and Transactions get a tab each. Every amount shows in SOL or USD, and the date range and pair filter live in the URL so a view can be shared.

**Analytics.** Pick any DLMM pool to see its price chart, volume, TVL, fees, LP and trader counts, and the liquidity in each bin around the active bin. Bin and fee data are read on-chain with the DLMM SDK.

**Alerts.** Browser notifications when a position opens, closes or goes out of range, and per-pool volume spike alerts. Settings has the alert sound, including a custom one.

**Bot dashboard.** `/bots` and the Telegram Mini App at `/tg` show health, position and activity for the rebalance bots, read from the files each bot already writes.

## Tech stack

| Layer   | Tools                                                                |
| ------- | -------------------------------------------------------------------- |
| Runtime | Bun (package manager, test runner, production server)                |
| App     | TanStack Start, TanStack Router, TanStack Query with SSR, React 19   |
| Build   | Vite 8, Nitro                                                        |
| UI      | Tailwind CSS v4, shadcn/ui, Recharts, lucide-react                   |
| Data    | zod at every API boundary, Effect 4, zustand                         |
| Solana  | `@meteora-ag/dlmm`, `@solana/web3.js`, Meteora data API, Jupiter API |
| Tooling | TypeScript, Biome, `bun:test`                                        |

## Run locally

Requires [Bun](https://bun.sh) 1.4 or newer.

```bash
git clone https://github.com/mgalihpp/vexis.git
cd vexis
bun install
bun run dev:web
```

The app runs at http://localhost:3000. To fill `/bots` with fake data, also run `bun run dev:worker`, which writes simulated bot journals into `.state/`.

| Command              | What it does                             |
| -------------------- | ---------------------------------------- |
| `bun run dev:web`    | Dev server on port 3000                  |
| `bun run dev:worker` | Bot simulator writing into `.state/`     |
| `bun test`           | All tests in every workspace             |
| `bun run typecheck`  | `tsc --noEmit` in every workspace        |
| `bun run lint`       | Biome check (`lint:fix` applies fixes)   |
| `bun run build`      | Production build into `apps/web/.output` |
| `bun run docs:fetch` | Refresh the offline docs in `docs/`      |

## Configuration

Every variable is optional.

| Variable             | Default                               | Purpose                                          |
| -------------------- | ------------------------------------- | ------------------------------------------------ |
| `JUPITER_API_KEY`    | none (uses `lite-api.jup.ag`)         | Switches price and balance calls to `api.jup.ag` |
| `SOLANA_RPC_URL`     | `https://api.mainnet-beta.solana.com` | RPC for on-chain bin and fee reads               |
| `METEORA_DATAPI_URL` | `https://dlmm.datapi.meteora.ag`      | Meteora DLMM data API base URL                   |
| `VEXIS_CACHE_DIR`    | `.state/portfolio-cache` at repo root | Where closed positions and history are cached    |
| `VEXIS_BOTS_FILE`    | `bots.json` at the repo root          | Bot registry read by `/bots` and `/tg`           |
| `NITRO_PRESET`       | `bun`                                 | Build target, for example `node-server`          |

Meteora's API allows 300 requests per window per IP. A large wallet loads its closed positions in the background, and the page shows progress until it finishes. The cache on disk makes later loads fast.

## Project structure

```
apps/
  web/                  TanStack Start app, the product
    src/routes/         thin route files: search params, loader, SSR mode
    src/features/       domain code: portfolio, analytics, notifications, settings, bots, telegram, theme
    src/components/ui/  shadcn/ui, generated by the CLI
  worker/               bot simulator
packages/
  bot-state/            shared bot model, journal parsers, health rules, file store
docs/                   offline reference docs, generated by scripts/fetch-docs.ts
bots.json               bot registry; each dir is relative to this file
```

Inside a feature, `*.functions.ts` holds `createServerFn` wrappers that any file may import, `*.server.ts` holds server-only code, and plain `.ts` files hold client-safe types and pure logic. TanStack Start fails the build if client code imports a `.server.ts` file. Imports use the `@/` alias, and there are no barrel `index.ts` files.

## Routes

| Route                | Page                                                     |
| -------------------- | -------------------------------------------------------- |
| `/`                  | Redirects to `/portfolio`                                |
| `/portfolio`         | Wallet search with favorite and recent wallets           |
| `/portfolio/$wallet` | Overview, Active, Closed, Balances and Transactions tabs |
| `/analytics`         | Pool analytics; `?pool=` picks the pool                  |
| `/bots`              | Bot fleet status                                         |
| `/bots/$botId`       | One bot's activity feed and journal                      |
| `/tg`                | Telegram Mini App, rendered on the client only           |

## Deploy

```bash
bun run build
VEXIS_BOTS_FILE=/path/to/bots.json bun apps/web/.output/server/index.mjs
```

The server listens on `PORT` (default 3000). `/bots` reads bot files from disk, so run the app on the host the bots write to.

Nitro links some packages in `.output/server/node_modules/.nf3` with absolute symlinks. When you build on one machine and run on another, pack the output with `tar -czhf output.tgz .output` so the archive holds real files instead of links.

## Bot heartbeat

Each bot writes its own journal (`journal.jsonl` for tiang, `activity.jsonl` for auto-rebalance) and a `HALT` file when halted. Neither journal changes on a healthy idle cycle, so each bot also rewrites `snapshot.json` in its state dir every cycle, writing a temp file and renaming it:

```json
{
  "at": 1793426383384,
  "pool": "<pool address>",
  "pair": "HYPE-SOL",
  "activeBin": 4521,
  "position": { "address": "<position>", "lower": 4520, "upper": 4522 },
  "wallet": { "sol": "4.200", "x": "0", "y": "0" }
}
```

A bot without this file shows "No heartbeat". The schema is `Snapshot` in `packages/bot-state/src/model.ts`.
