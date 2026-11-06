import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Secrets a user hands us are stored AES-256-GCM encrypted. Each kind has its own key (32 random bytes, base64) in the
// environment, never in the database: `TOKEN_ENC_KEY` for Telegram bot tokens, `WALLET_ENC_KEY` for the auto-rebalance
// wallet's secret key, so a leaked token key does not open a wallet.

export type SecretKey = "TOKEN_ENC_KEY" | "WALLET_ENC_KEY";

const VERSION = "v1";

function key(name: SecretKey): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set`);
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded`);
  return bytes;
}

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64url. A fresh IV for every call. */
export function encryptSecret(plain: string, keyName: SecretKey = "TOKEN_ENC_KEY"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(keyName), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), body]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Throws when the value was not produced by `encryptSecret` with the same key. */
export function decryptSecret(blob: string, keyName: SecretKey = "TOKEN_ENC_KEY"): string {
  const [version, iv, tag, body] = blob.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(keyName), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
