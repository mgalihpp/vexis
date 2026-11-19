import { z } from "zod";
import { loadRecentVolume } from "@/features/analytics/analytics.server";
import { loadOpenPositions } from "@/features/portfolio/meteora.server";
import { WalletAddress } from "@/lib/address";
import { router, viewerProcedure } from "@/trpc/init.server";
import { SPIKE_TIMEFRAMES, type Watch } from "./notifications";

// Every wallet and pool costs Meteora requests from the shared rate-limit budget.
const MAX_WATCHED = 20;

export const notificationsRouter = router({
  // One failure must not hide the rest of the poll, so each settles to null on its own.
  watch: viewerProcedure
    .input(
      z.object({
        wallets: z.array(WalletAddress).max(MAX_WATCHED),
        pools: z.array(WalletAddress).max(MAX_WATCHED),
        timeframe: z.enum(SPIKE_TIMEFRAMES),
      }),
    )
    .query(
      async ({ input }): Promise<Watch> => ({
        wallets: await Promise.all(
          input.wallets.map(async (wallet) => ({
            wallet,
            positions: await loadOpenPositions(wallet).catch(() => null),
          })),
        ),
        pools: await Promise.all(
          input.pools.map(async (pool) => ({
            pool,
            bars: await loadRecentVolume(pool, input.timeframe)
              .then((points) => points.map(({ t, volume }) => ({ t, volume })))
              .catch(() => null),
          })),
        ),
      }),
    ),
});
