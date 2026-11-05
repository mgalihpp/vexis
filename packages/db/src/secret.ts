import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Secrets a user hands us (their own Telegram bot token) are stored AES-256-GCM encrypted. The key lives in
// `TOKEN_ENC_KEY` (32 random bytes, base64) in the web app's and the runner's environment, never in the database.

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw) throw new Error("TOKEN_ENC_KEY is not set");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes, base64 encoded");
  return bytes;
}

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64url. A fresh IV for every call. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), body]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Throws when the value was not produced by `encryptSecret` with the same key. */
export function decryptSecret(blob: string): string {
  const [version, iv, tag, body] = blob.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
