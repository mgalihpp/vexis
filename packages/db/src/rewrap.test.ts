import { afterEach, beforeEach, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { encryptSecret, generateWalletKeypair, openWalletSecret } from "@vexis/shared/secret";
import { rewrapSymmetric, rewrapWalletSecret } from "./rewrap.ts";

const NAMES = [
  "TOKEN_ENC_KEY",
  "LLM_ENC_KEY",
  "RPC_ENC_KEY",
  "WALLET_ENC_KEY",
  "WALLET_PUBLIC_KEY",
  "WALLET_PRIVATE_KEY",
];
const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
const rand = () => randomBytes(32).toString("base64");
const pair = generateWalletKeypair();

beforeEach(() => {
  for (const n of NAMES) delete process.env[n];
  process.env.WALLET_ENC_KEY = rand();
  process.env.TOKEN_ENC_KEY = rand();
  process.env.WALLET_PUBLIC_KEY = pair.publicKey;
  process.env.WALLET_PRIVATE_KEY = pair.privateKey;
});
afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
});

test("a v1 wallet secret becomes a sealed box the runner opens, and a second pass leaves it alone", () => {
  const old = encryptSecret("wallet-secret", "WALLET_ENC_KEY");
  const first = rewrapWalletSecret(old);
  if (first.state !== "rewrap") throw new Error("expected a rewrap");
  expect(first.next.startsWith("v2.")).toBe(true);
  expect(openWalletSecret(first.next)).toBe("wallet-secret");
  expect(rewrapWalletSecret(first.next)).toEqual({ state: "current" });
  expect(rewrapWalletSecret("garbage")).toEqual({ state: "unreadable" });
});

test("RPC URLs and LLM keys move to their own key once it is set", () => {
  const old = encryptSecret("https://rpc.test/?k=1", "WALLET_ENC_KEY");
  const llm = encryptSecret("sk-test", "TOKEN_ENC_KEY");
  process.env.RPC_ENC_KEY = rand();
  process.env.LLM_ENC_KEY = rand();
  const rpc = rewrapSymmetric(old, "RPC_ENC_KEY");
  const key = rewrapSymmetric(llm, "LLM_ENC_KEY");
  if (rpc.state !== "rewrap" || key.state !== "rewrap") throw new Error("expected rewraps");
  expect(rpc.plain).toBe("https://rpc.test/?k=1");
  expect(rewrapSymmetric(rpc.next, "RPC_ENC_KEY")).toEqual({ state: "current", plain: "https://rpc.test/?k=1" });
  expect(rewrapSymmetric(key.next, "LLM_ENC_KEY").state).toBe("current");
  expect(rewrapSymmetric("v1.a.b.c", "RPC_ENC_KEY")).toEqual({ state: "unreadable" });
});
