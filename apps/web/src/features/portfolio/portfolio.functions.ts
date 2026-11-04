import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireViewer } from "@/features/auth/auth.middleware";
import { loadBalances } from "./balances.server";
import { loadActivity, loadPortfolio, loadTransactions } from "./meteora.server";
import { loadPrices } from "./prices.server";

export const WalletAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address");

export const getPortfolio = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ wallet: WalletAddress }))
  .handler(({ data }) => loadPortfolio(data.wallet));

export const getPositionActivity = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ position: WalletAddress }))
  .handler(({ data }) => loadActivity(data.position));

export const getTransactions = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ wallet: WalletAddress }))
  .handler(({ data }) => loadTransactions(data.wallet));

export const getBalances = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ wallet: WalletAddress }))
  .handler(({ data }) => loadBalances(data.wallet));

export const getPrices = createServerFn({ method: "GET" }).handler(() => loadPrices());
