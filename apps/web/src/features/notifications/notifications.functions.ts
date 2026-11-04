import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadRecentVolume } from "@/features/analytics/analytics.server";
import { requireViewer } from "@/features/auth/auth.middleware";
import { loadOpenPositions } from "@/features/portfolio/meteora.server";
import { WalletAddress } from "@/features/portfolio/portfolio.functions";
import { SPIKE_TIMEFRAMES, type Watch } from "./notifications";

// Every wallet and pool costs Meteora requests from the shared rate-limit budget.
const MAX_WATCHED = 20;

// One failure must not hide the rest of the poll, so each settles to null on its own.
export const getWatch = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(
    z.object({
      wallets: z.array(WalletAddress).max(MAX_WATCHED),
      pools: z.array(WalletAddress).max(MAX_WATCHED),
      timeframe: z.enum(SPIKE_TIMEFRAMES),
    }),
  )
  .handler(
    async ({ data }): Promise<Watch> => ({
      wallets: await Promise.all(
        data.wallets.map(async (wallet) => ({
          wallet,
          positions: await loadOpenPositions(wallet).catch(() => null),
        })),
      ),
      pools: await Promise.all(
        data.pools.map(async (pool) => ({
          pool,
          bars: await loadRecentVolume(pool, data.timeframe)
            .then((points) => points.map(({ t, volume }) => ({ t, volume })))
            .catch(() => null),
        })),
      ),
    }),
  );
