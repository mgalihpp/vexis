import { describe, expect, it } from "bun:test";
import {
  CreateInvite,
  escapeLike,
  inviteStatus,
  isAdminRole,
  originAllowed,
  redact,
  roleChangeRefusal,
  slide,
} from "./admin";

const base = { actorId: "a", targetId: "b", adminIds: ["a", "b"] } as const;

describe("roleChangeRefusal", () => {
  it.each([
    ["promoting a member", { ...base, adminIds: ["a"], from: "member", to: "admin" }, null],
    ["demoting another admin", { ...base, from: "admin", to: "member" }, null],
    ["demoting yourself", { ...base, targetId: "a", from: "admin", to: "member" }, "self"],
    ["changing your own role", { ...base, targetId: "a", from: "member", to: "admin" }, "self"],
    ["no change", { ...base, from: "admin", to: "admin" }, "unchanged"],
    // The lock shows only b as admin: removing b leaves nobody, whoever asks.
    [
      "the last admin, by a stale actor",
      { ...base, actorId: "x", adminIds: ["b"], from: "admin", to: "member" },
      "last-admin",
    ],
  ] as const)("%s", (_, input, expected) => {
    expect(roleChangeRefusal(input)).toBe(expected);
  });
});

describe("isAdminRole", () => {
  it("accepts only the admin role", () => {
    expect([
      isAdminRole("admin"),
      isAdminRole("member"),
      isAdminRole(""),
      isAdminRole(null),
      isAdminRole(undefined),
    ]).toEqual([true, false, false, false, false]);
  });
});

describe("inviteStatus", () => {
  const now = Date.parse("2026-11-17T00:00:00Z");
  const future = new Date(now + 1000);
  const past = new Date(now - 1000);
  it.each([
    [{ revokedAt: past, expiresAt: future, useCount: 0, maxUses: 1 }, "revoked"],
    [{ revokedAt: null, expiresAt: future, useCount: 1, maxUses: 1 }, "redeemed"],
    [{ revokedAt: null, expiresAt: past, useCount: 1, maxUses: 1 }, "redeemed"],
    [{ revokedAt: null, expiresAt: past, useCount: 0, maxUses: 1 }, "expired"],
    [{ revokedAt: null, expiresAt: future, useCount: 3, maxUses: 10 }, "active"],
  ] as const)("%j is %s", (invite, status) => {
    expect(inviteStatus(invite, now)).toBe(status);
  });
});

describe("CreateInvite", () => {
  it("bounds every field and needs an email to send", () => {
    expect(CreateInvite.safeParse({}).data).toMatchObject({ days: 7, uses: 1, send: false });
    expect(CreateInvite.safeParse({ days: 0 }).success).toBe(false);
    expect(CreateInvite.safeParse({ days: 91 }).success).toBe(false);
    expect(CreateInvite.safeParse({ uses: 101 }).success).toBe(false);
    expect(CreateInvite.safeParse({ note: "x".repeat(201) }).success).toBe(false);
    expect(CreateInvite.safeParse({ send: true }).success).toBe(false);
    expect(CreateInvite.safeParse({ send: true, email: " A@B.co " }).data?.email).toBe("a@b.co");
  });
});

describe("escapeLike", () => {
  it("makes wildcards literal", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("originAllowed", () => {
  const expectedOrigin = "https://vexis.app";
  it.each([
    [{ origin: "https://vexis.app", secFetchSite: null }, true],
    [{ origin: "https://evil.example", secFetchSite: "cross-site" }, false],
    [{ origin: "http://vexis.app", secFetchSite: null }, false],
    [{ origin: null, secFetchSite: "same-origin" }, true],
    [{ origin: null, secFetchSite: "cross-site" }, false],
    [{ origin: null, secFetchSite: null }, true],
  ])("%j", (input, expected) => {
    expect(originAllowed({ ...input, expectedOrigin })).toBe(expected);
  });
});

describe("slide", () => {
  it("refuses past the limit without counting the refusal, and frees up as the window moves", () => {
    const limit = { max: 2, windowMs: 1000 };
    const a = slide([], 0, limit);
    const b = slide(a.times, 100, limit);
    const c = slide(b.times, 200, limit);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, false]);
    expect(c.times).toEqual([0, 100]);
    expect(slide(c.times, 1050, limit).ok).toBe(true);
  });
});

describe("redact", () => {
  it("keeps the host of a URL, never its path or key", () => {
    expect(
      redact("fetch failed https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage"),
    ).toBe("fetch failed api.telegram.org/…");
    expect(redact("RPC https://user:pass@mainnet.helius-rpc.com/?api-key=abc123 429")).toBe(
      "RPC mainnet.helius-rpc.com/… 429",
    );
  });
  it("hides a bare bot token and a base58 secret, and caps the length", () => {
    expect(redact("bad 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw token")).toBe("bad … token");
    expect(redact(`key ${"5".repeat(64)} leaked`)).toBe("key … leaked");
    expect(redact("word ".repeat(100)).length).toBe(200);
  });
  it("leaves ordinary errors alone", () => {
    expect(redact("custom program error 0x1771")).toBe("custom program error 0x1771");
  });
});
