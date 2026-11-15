import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * The agent wallet's signer from its decrypted base58 secret, or null when it does not decode to a 64-byte key whose
 * public key is the stored one. Null is never retried with another guess: the user saves the wallet again.
 */
export function walletSigner(secret: string, publicKey: string): Keypair | null {
  try {
    const bytes = bs58.decode(secret);
    if (bytes.length !== 64) return null;
    const keypair = Keypair.fromSecretKey(bytes);
    return keypair.publicKey.toBase58() === publicKey ? keypair : null;
  } catch {
    return null;
  }
}
