import { decryptSecret, decryptSecretExact, encryptSecret, isSealed, openWalletSecret, sealSecret } from "./secret.ts";

export type Rewrap =
  | { readonly state: "current"; readonly plain?: string }
  | { readonly state: "rewrap"; readonly next: string; readonly plain: string }
  | { readonly state: "unreadable" };

/** A wallet secret key: sealed already, or a `v1` value under `WALLET_ENC_KEY` that becomes a sealed box. */
export function rewrapWalletSecret(blob: string): Rewrap {
  if (isSealed(blob)) return { state: "current" };
  try {
    const plain = openWalletSecret(blob);
    return { state: "rewrap", next: sealSecret(plain), plain };
  } catch {
    return { state: "unreadable" };
  }
}

/** An RPC URL or LLM key: current when it opens with the key's own value, else re-encrypted under it. */
export function rewrapSymmetric(blob: string, key: "RPC_ENC_KEY" | "LLM_ENC_KEY"): Rewrap {
  try {
    return { state: "current", plain: decryptSecretExact(blob, key) };
  } catch {}
  try {
    const plain = decryptSecret(blob, key);
    return { state: "rewrap", next: encryptSecret(plain, key), plain };
  } catch {
    return { state: "unreadable" };
  }
}
