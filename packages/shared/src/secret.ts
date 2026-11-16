import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
} from "node:crypto";

// Two schemes, so that the process which stores a secret is not the one that can read it back.
//
// Symmetric (`v1`, AES-256-GCM, a 32-byte base64 key in the environment, never in the database) for secrets the
// server must read again: `TOKEN_ENC_KEY` for Telegram bot tokens, `LLM_ENC_KEY` for users' LLM keys and
// `RPC_ENC_KEY` for RPC URLs (they carry an API key). The last two fall back to the key they were split from
// (`TOKEN_ENC_KEY`, `WALLET_ENC_KEY`), so data written before the split still opens until `db:rewrap` moves it.
//
// Sealed box (`v2`, X25519 + HKDF + AES-256-GCM) for agent wallet secret keys. The web app and the office runtime
// hold only `WALLET_PUBLIC_KEY` and can seal; only the runner holds `WALLET_PRIVATE_KEY` and can open.

export type SecretKey = "TOKEN_ENC_KEY" | "LLM_ENC_KEY" | "RPC_ENC_KEY" | "WALLET_ENC_KEY";

const LEGACY_KEY: Partial<Record<SecretKey, SecretKey>> = {
  LLM_ENC_KEY: "TOKEN_ENC_KEY",
  RPC_ENC_KEY: "WALLET_ENC_KEY",
};

const VERSION = "v1";
const SEALED_VERSION = "v2";
const SEALED_INFO = "vexis wallet secret v2";

function raw32(name: string): Buffer | null {
  const raw = process.env[name];
  if (!raw) return null;
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded`);
  return bytes;
}

function required32(name: string): Buffer {
  const bytes = raw32(name);
  if (!bytes) throw new Error(`${name} is not set`);
  return bytes;
}

/** The keys a name opens with: its own, then the one it was split from. */
function candidates(name: SecretKey): Buffer[] {
  const legacy = LEGACY_KEY[name];
  const keys = [raw32(name), legacy ? raw32(legacy) : null].filter((k): k is Buffer => k !== null);
  if (keys.length === 0) throw new Error(`${name} is not set`);
  return keys;
}

function open(blob: string, key: Buffer): string {
  const [version, iv, tag, body] = blob.split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64url. A fresh IV for every call. Uses the split-from key when the new one is unset. */
export function encryptSecret(plain: string, keyName: SecretKey = "TOKEN_ENC_KEY"): string {
  const [key] = candidates(keyName);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key as Buffer, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), body]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Throws when the value was not produced by `encryptSecret` with this key (or, for a split key, the one it was split from). */
export function decryptSecret(blob: string, keyName: SecretKey = "TOKEN_ENC_KEY"): string {
  let failure: unknown;
  for (const key of candidates(keyName)) {
    try {
      return open(blob, key);
    } catch (error) {
      failure ??= error;
    }
  }
  throw failure;
}

/** Like `decryptSecret` but only with the key's own value, so `db:rewrap` can tell what is already migrated. */
export function decryptSecretExact(blob: string, keyName: SecretKey): string {
  return open(blob, required32(keyName));
}

const SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");

const publicObject = (raw: Buffer) =>
  createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
const privateObject = (raw: Buffer) =>
  createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
const rawPublic = (key: KeyObject) => (key.export({ format: "der", type: "spki" }) as Buffer).subarray(-32);

function sealedKey(shared: Buffer, ephemeralPublic: Buffer, recipientPublic: Buffer): Buffer {
  const salt = Buffer.concat([ephemeralPublic, recipientPublic]);
  return Buffer.from(hkdfSync("sha256", shared, salt, SEALED_INFO, 32));
}

/** A fresh keypair, base64 raw 32 bytes each: the public half for the web app and office, the private half for the runner only. */
export function generateWalletKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKey: rawPublic(publicKey).toString("base64"),
    privateKey: (privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).subarray(-32).toString("base64"),
  };
}

/** The base64 public key that goes with a base64 private key; throws when it is not a 32-byte key. */
export function walletPublicKeyOf(privateKeyBase64: string): string {
  const bytes = Buffer.from(privateKeyBase64, "base64");
  if (bytes.length !== 32) throw new Error("WALLET_PRIVATE_KEY must be 32 bytes, base64 encoded");
  return rawPublic(createPublicKey(privateObject(bytes))).toString("base64");
}

/** `v2.<ephemeral public>.<iv>.<tag>.<ciphertext>`. Needs only `WALLET_PUBLIC_KEY`; nothing here can read it back. */
export function sealSecret(plain: string): string {
  const recipient = required32("WALLET_PUBLIC_KEY");
  const eph = generateKeyPairSync("x25519");
  const ephPublic = rawPublic(eph.publicKey);
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: publicObject(recipient) });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealedKey(shared, ephPublic, recipient), iv);
  cipher.setAAD(ephPublic);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [SEALED_VERSION, ephPublic, iv, cipher.getAuthTag(), body]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Needs `WALLET_PRIVATE_KEY`, which only the runner has. Throws on a value sealed to another key or altered. */
export function openSealedSecret(blob: string): string {
  const [version, epk, iv, tag, body] = blob.split(".");
  if (version !== SEALED_VERSION || !epk || !iv || !tag || !body) throw new Error("Unrecognised secret format");
  const priv = required32("WALLET_PRIVATE_KEY");
  const ephPublic = Buffer.from(epk, "base64url");
  if (ephPublic.length !== 32) throw new Error("Unrecognised secret format");
  const recipient = rawPublic(createPublicKey(privateObject(priv)));
  const shared = diffieHellman({ privateKey: privateObject(priv), publicKey: publicObject(ephPublic) });
  const decipher = createDecipheriv(
    "aes-256-gcm",
    sealedKey(shared, ephPublic, recipient),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(ephPublic);
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export const isSealed = (blob: string) => blob.startsWith(`${SEALED_VERSION}.`);

/** A stored wallet secret key, sealed (`v2`) or still `v1` under `WALLET_ENC_KEY`. Runner and `db:rewrap` only. */
export function openWalletSecret(blob: string): string {
  return isSealed(blob) ? openSealedSecret(blob) : decryptSecret(blob, "WALLET_ENC_KEY");
}
