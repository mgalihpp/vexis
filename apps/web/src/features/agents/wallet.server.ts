import { Keypair } from "@solana/web3.js";
import { getDb } from "@vexis/db/client";
import { forUser, getRebalanceWallet, removeRebalanceWallet, saveRebalanceWallet } from "@vexis/db/queries";
import { encryptSecret } from "@vexis/db/secret";
import bs58 from "bs58";
import { z } from "zod";
import { SECRET_KEY_PATTERN } from "./agents";

// The auto-rebalance wallet's secret key comes in once, is encrypted with WALLET_ENC_KEY and is never sent back
// or logged. Errors name what was wrong with it, never the value.

export const SecretKeyInput = z.string().trim().regex(SECRET_KEY_PATTERN, "Paste the wallet's base58 secret key");

function keypairOf(secret: string) {
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(secret);
  } catch {
    throw new Error("That is not a base58 secret key");
  }
  if (bytes.length !== 64) throw new Error("A secret key is 64 bytes; this one is not");
  try {
    return Keypair.fromSecretKey(bytes);
  } catch {
    throw new Error("That secret key does not match its public key");
  }
}

/** Saves (or replaces) the wallet and returns its public key. */
export async function saveWallet(userId: string, secret: string) {
  const publicKey = keypairOf(secret).publicKey.toBase58();
  await saveRebalanceWallet(forUser(getDb(), userId), publicKey, encryptSecret(secret, "WALLET_ENC_KEY"));
  return publicKey;
}

/** The runner skips an auto-rebalance agent without a wallet; saving one again resumes it. */
export async function removeWallet(userId: string) {
  await removeRebalanceWallet(forUser(getDb(), userId));
}

export async function loadWallet(userId: string) {
  const row = await getRebalanceWallet(forUser(getDb(), userId));
  return { publicKey: row?.publicKey ?? null };
}
