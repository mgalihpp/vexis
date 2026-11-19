import { z } from "zod";

export const SolanaAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address");
export const WalletAddress = SolanaAddress;
export const PoolAddress = SolanaAddress;
