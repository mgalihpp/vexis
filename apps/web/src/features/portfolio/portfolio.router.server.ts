import { z } from "zod";
import { WalletAddress } from "@/lib/address";
import { publicProcedure, router, viewerProcedure } from "@/trpc/init.server";
import { loadBalances } from "./balances.server";
import { loadActivity, loadPortfolio, loadTransactions } from "./meteora.server";
import { loadPrices } from "./prices.server";

const Wallet = z.object({ wallet: WalletAddress });

export const portfolioRouter = router({
  get: viewerProcedure.input(Wallet).query(({ input }) => loadPortfolio(input.wallet)),
  activity: viewerProcedure
    .input(z.object({ position: WalletAddress }))
    .query(({ input }) => loadActivity(input.position)),
  transactions: viewerProcedure.input(Wallet).query(({ input }) => loadTransactions(input.wallet)),
  balances: viewerProcedure.input(Wallet).query(({ input }) => loadBalances(input.wallet)),
  prices: publicProcedure.query(() => loadPrices()),
});
