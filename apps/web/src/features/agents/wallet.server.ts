import { Keypair } from "@solana/web3.js";
import { WALLET_UNREADABLE } from "@vexis/db/agents";
import { getDb } from "@vexis/db/client";
import {
  forUser,
  getRebalanceWallet,
  removeRebalanceWallet,
  resumeAgentsPausedFor,
  saveRebalanceRpcUrl,
  saveRebalanceWallet,
} from "@vexis/db/queries";
import { decryptSecret, encryptSecret } from "@vexis/db/secret";
import bs58 from "bs58";
import { z } from "zod";
import { SECRET_KEY_PATTERN } from "./agents";

// The auto-rebalance wallet's secret key and RPC URL come in once, are encrypted with WALLET_ENC_KEY and are never
// sent back or logged: only the public key and the RPC's host are read back. Errors name what was wrong with a
// value, never the value.

export const SecretKeyInput = z.string().trim().regex(SECRET_KEY_PATTERN, "Paste the wallet's base58 secret key");

export const RpcUrlInput = z
  .string()
  .trim()
  .max(500, "That RPC URL is too long")
  .refine((v) => URL.canParse(v) && new URL(v).protocol === "https:", "The RPC URL must start with https://");

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const GenesisReply = z.object({ result: z.string() });

/** Asks the RPC for its genesis hash, so a devnet URL or a typo is caught before the runner relies on it. */
async function checkRpcUrl(url: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getGenesisHash" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Could not reach that RPC, or it took longer than 10 seconds");
  }
  if (response.status === 401 || response.status === 403)
    throw new Error("That RPC rejected the request; check its API key");
  if (!response.ok) throw new Error(`That RPC answered with HTTP ${response.status}`);
  const parsed = GenesisReply.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("That URL did not answer like a Solana RPC");
  if (parsed.data.result !== MAINNET_GENESIS) throw new Error("That RPC is not on Solana mainnet");
}

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

/** Saves (or replaces) the wallet with its RPC URL and returns the public key. */
export async function saveWallet(userId: string, secret: string, rpcUrl: string) {
  const publicKey = keypairOf(secret).publicKey.toBase58();
  await checkRpcUrl(rpcUrl);
  const s = forUser(getDb(), userId);
  await saveRebalanceWallet(s, {
    publicKey,
    encryptedSecret: encryptSecret(secret, "WALLET_ENC_KEY"),
    encryptedRpcUrl: encryptSecret(rpcUrl, "WALLET_ENC_KEY"),
  });
  // The runner paused these because the old key no longer decrypted; this one does. A pause the user chose stays.
  await resumeAgentsPausedFor(s, "auto-rebalance", [WALLET_UNREADABLE]);
  return publicKey;
}

/** Replaces only the RPC URL, keeping the saved key. */
export async function saveRpcUrl(userId: string, rpcUrl: string) {
  await checkRpcUrl(rpcUrl);
  const saved = await saveRebalanceRpcUrl(forUser(getDb(), userId), encryptSecret(rpcUrl, "WALLET_ENC_KEY"));
  if (!saved) throw new Error("Save the wallet first");
}

/** The runner skips an auto-rebalance agent without a wallet; saving one again resumes it. */
export async function removeWallet(userId: string) {
  await removeRebalanceWallet(forUser(getDb(), userId));
}

/** The host of a stored RPC URL; null when there is none or it no longer decrypts (the user saves it again). */
export function rpcHost(encrypted: string | null) {
  if (!encrypted) return null;
  try {
    return new URL(decryptSecret(encrypted, "WALLET_ENC_KEY")).host;
  } catch (error) {
    // A missing or malformed key is a server misconfiguration, not a stale URL; let it surface.
    if (error instanceof Error && error.message.startsWith("WALLET_ENC_KEY")) throw error;
    return null;
  }
}

export async function loadWallet(userId: string) {
  const row = await getRebalanceWallet(forUser(getDb(), userId));
  return { publicKey: row?.publicKey ?? null, rpcHost: rpcHost(row?.rpcUrl ?? null) };
}
