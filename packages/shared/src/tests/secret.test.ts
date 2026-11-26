import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  decryptSecret,
  decryptSecretExact,
  encryptSecret,
  generateWalletKeypair,
  openSealedSecret,
  openWalletSecret,
  sealSecret,
  walletPublicKeyOf,
} from "../secret.ts";

const TOKEN = "123456789:AAH-example_token_value_0123456789abc";
const NAMES = [
  "TOKEN_ENC_KEY",
  "LLM_ENC_KEY",
  "RPC_ENC_KEY",
  "WALLET_ENC_KEY",
  "WALLET_PUBLIC_KEY",
  "WALLET_PRIVATE_KEY",
];
const rand = () => randomBytes(32).toString("base64");

describe("secret", () => {
  const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  beforeEach(() => {
    for (const n of NAMES) delete process.env[n];
    process.env.TOKEN_ENC_KEY = rand();
  });
  afterEach(() => {
    for (const n of NAMES) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  test("round-trips and never stores the plain value", () => {
    const blob = encryptSecret(TOKEN);
    expect(blob).not.toContain(TOKEN);
    expect(decryptSecret(blob)).toBe(TOKEN);
    expect(encryptSecret(TOKEN)).not.toBe(blob);
  });

  test("a tampered blob or another key is rejected", () => {
    const blob = encryptSecret(TOKEN);
    const [v, iv, tag, body] = blob.split(".");
    expect(() => decryptSecret([v, iv, tag, `${body?.slice(0, -2)}AA`].join("."))).toThrow();
    process.env.TOKEN_ENC_KEY = rand();
    expect(() => decryptSecret(blob)).toThrow();
  });

  test("a missing or short key is an error", () => {
    delete process.env.TOKEN_ENC_KEY;
    expect(() => encryptSecret(TOKEN)).toThrow("TOKEN_ENC_KEY is not set");
    process.env.TOKEN_ENC_KEY = Buffer.from("short").toString("base64");
    expect(() => encryptSecret(TOKEN)).toThrow("32 bytes");
  });

  test("a split key falls back to the key it was split from, and only that one", () => {
    process.env.WALLET_ENC_KEY = rand();
    const old = encryptSecret("https://rpc.test/?k=1", "WALLET_ENC_KEY");
    // RPC_ENC_KEY unset: encrypts with the legacy key, so nothing breaks before the new key is deployed.
    expect(decryptSecret(encryptSecret("a", "RPC_ENC_KEY"), "RPC_ENC_KEY")).toBe("a");
    process.env.RPC_ENC_KEY = rand();
    const fresh = encryptSecret("https://rpc.test/?k=2", "RPC_ENC_KEY");
    expect(decryptSecret(old, "RPC_ENC_KEY")).toBe("https://rpc.test/?k=1");
    expect(decryptSecret(fresh, "RPC_ENC_KEY")).toBe("https://rpc.test/?k=2");
    expect(() => decryptSecretExact(old, "RPC_ENC_KEY")).toThrow();
    expect(decryptSecretExact(fresh, "RPC_ENC_KEY")).toBe("https://rpc.test/?k=2");
    // The bot token key never opens an RPC URL, nor the other way round.
    expect(() => decryptSecret(fresh)).toThrow();
    expect(() => decryptSecret(encryptSecret(TOKEN), "RPC_ENC_KEY")).toThrow();
  });
});

describe("sealed wallet secret", () => {
  const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  const pair = generateWalletKeypair();
  beforeEach(() => {
    for (const n of NAMES) delete process.env[n];
    process.env.WALLET_PUBLIC_KEY = pair.publicKey;
  });
  afterEach(() => {
    for (const n of NAMES) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  test("the runner's private key opens what the public key sealed, and the blob hides the value", () => {
    const blob = sealSecret(TOKEN);
    expect(blob.startsWith("v2.")).toBe(true);
    expect(blob).not.toContain(TOKEN);
    expect(sealSecret(TOKEN)).not.toBe(blob);
    expect(walletPublicKeyOf(pair.privateKey)).toBe(pair.publicKey);
    process.env.WALLET_PRIVATE_KEY = pair.privateKey;
    expect(openSealedSecret(blob)).toBe(TOKEN);
    expect(openWalletSecret(blob)).toBe(TOKEN);
  });

  test("a process with only the public key cannot open it", () => {
    const blob = sealSecret(TOKEN);
    expect(() => openSealedSecret(blob)).toThrow("WALLET_PRIVATE_KEY is not set");
    expect(() => openWalletSecret(blob)).toThrow();
    // Nor does any symmetric key a web process holds.
    process.env.WALLET_ENC_KEY = rand();
    process.env.TOKEN_ENC_KEY = rand();
    expect(() => openWalletSecret(blob)).toThrow();
    expect(() => decryptSecret(blob, "WALLET_ENC_KEY")).toThrow();
  });

  test("another private key, a tampered body or a swapped ephemeral key is detected", () => {
    const blob = sealSecret(TOKEN);
    const [v, epk, iv, tag, body] = blob.split(".");
    process.env.WALLET_PRIVATE_KEY = generateWalletKeypair().privateKey;
    expect(() => openSealedSecret(blob)).toThrow();
    process.env.WALLET_PRIVATE_KEY = pair.privateKey;
    expect(() => openSealedSecret([v, epk, iv, tag, `${body?.slice(0, -2)}AA`].join("."))).toThrow();
    const other = sealSecret(TOKEN).split(".")[1];
    expect(() => openSealedSecret([v, other, iv, tag, body].join("."))).toThrow();
  });

  test("a value from before the sealed scheme still opens through WALLET_ENC_KEY", () => {
    process.env.WALLET_ENC_KEY = rand();
    process.env.WALLET_PRIVATE_KEY = pair.privateKey;
    const old = encryptSecret(TOKEN, "WALLET_ENC_KEY");
    expect(openWalletSecret(old)).toBe(TOKEN);
    expect(() => openSealedSecret(old)).toThrow("Unrecognised");
  });
});
