import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./secret.ts";

const TOKEN = "123456789:AAH-example_token_value_0123456789abc";

describe("secret", () => {
  const saved = process.env.TOKEN_ENC_KEY;
  beforeEach(() => {
    process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64");
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TOKEN_ENC_KEY;
    else process.env.TOKEN_ENC_KEY = saved;
  });

  test("round-trips and never stores the plain value", () => {
    const blob = encryptSecret(TOKEN);
    expect(blob).not.toContain(TOKEN);
    expect(decryptSecret(blob)).toBe(TOKEN);
  });

  test("a fresh IV makes every blob different", () => {
    expect(encryptSecret(TOKEN)).not.toBe(encryptSecret(TOKEN));
  });

  test("a tampered blob or another key is rejected", () => {
    const blob = encryptSecret(TOKEN);
    const [v, iv, tag, body] = blob.split(".");
    expect(() => decryptSecret([v, iv, tag, `${body?.slice(0, -2)}AA`].join("."))).toThrow();
    process.env.TOKEN_ENC_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(blob)).toThrow();
  });

  test("a missing or short key is an error", () => {
    delete process.env.TOKEN_ENC_KEY;
    expect(() => encryptSecret(TOKEN)).toThrow("TOKEN_ENC_KEY is not set");
    process.env.TOKEN_ENC_KEY = Buffer.from("short").toString("base64");
    expect(() => encryptSecret(TOKEN)).toThrow("32 bytes");
  });
});
