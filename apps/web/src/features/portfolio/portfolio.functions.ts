import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadActivity, loadPortfolio } from "./meteora.server";
import { loadPrices } from "./prices.server";

export const WalletAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address");

export const getPortfolio = createServerFn({ method: "GET" })
  .validator(z.object({ wallet: WalletAddress }))
  .handler(({ data }) => loadPortfolio(data.wallet));

export const getPositionActivity = createServerFn({ method: "GET" })
  .validator(z.object({ position: WalletAddress }))
  .handler(({ data }) => loadActivity(data.position));

export const getPrices = createServerFn({ method: "GET" }).handler(() => loadPrices());
