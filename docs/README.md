# Reference docs

Local copies of the docs this project builds on, for people and agents working offline. Refresh with `bun run docs:fetch`. Each source is replaced wholesale, so do not edit files here by hand. The source list lives in `scripts/fetch-docs.ts`.

| Folder             | What it covers                                                       | Start with                         |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------- |
| `meteora/`         | Meteora docs (DLMM, DAMM, DBC), plus the DLMM TypeScript SDK README  | `dlmm-sdk.md`, then `llms.txt`     |
| `jupiter/`         | Jupiter developer docs (Swap, Ultra, Price, Tokens, Trigger APIs)    | `llms.txt`                         |
| `effect/`          | Effect 4 (`effect-smol`) guide for writing Effect code               | `LLMS.md`                          |
| `tanstack-start/`  | TanStack Start (React): server functions, SSR modes, deployment      | `llms.txt`, `docs/framework/react` |
| `tanstack-router/` | TanStack Router (React): file routes, search params, loaders         | `llms.txt`, `docs/framework/react` |
| `shadcn/`          | shadcn/ui component index                                            | `llms.txt`                         |
| `zod/`             | Zod 4, full docs                                                     | `llms-full.txt`                    |
| `react-hook-form/` | React Hook Form index                                                | `llms.txt`                         |
| `zustand/`         | Zustand index                                                        | `llms.txt`                         |
| `bun/`             | Bun runtime, package manager and test runner index                   | `llms.txt`                         |
| `telegram/`        | Telegram Mini Apps (WebApp API, initData validation, theme, buttons) | `mini-apps.md`                     |

The `llms.txt` files are indexes that link to pages online. The `llms-full.txt` files hold the full text. `telegram/mini-apps.md` is converted from HTML, so tables there are flattened.
