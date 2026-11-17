// The admin page's rules, pure so the web app and the database layer agree and tests need no database: who may
// change whose role, what state an invite is in, how an origin is judged, and how errors lose their secrets.

import { z } from "zod";

// --- what an admin may do ----------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  "invite.create",
  "invite.send",
  "invite.revoke",
  "invite.extend",
  "role.change",
  "office.enable",
  "office.disable",
  "office.cap",
  "office.stop_all",
  "office.resume_all",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const PAGE_SIZE = 10;
export const MAX_PAGE = 10_000;

export const Page = z.number().int().min(1).max(MAX_PAGE).default(1);
export const Search = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((q) => (q ? q : undefined));

export const INVITE_FILTERS = ["all", "active", "redeemed", "expired"] as const;
export const USER_FILTERS = ["all", "admins", "office"] as const;
export const OFFICE_FILTERS = ["all", "live", "paused"] as const;
export const AGENT_VIEWS = ["paused", "attention"] as const;
export const FAILURE_VIEWS = ["failed", "alerts", "transactions"] as const;

export const InviteList = z.object({
  filter: z.enum(INVITE_FILTERS).default("all"),
  q: Search,
  page: Page,
});
export const UserList = z.object({ filter: z.enum(USER_FILTERS).default("all"), q: Search, page: Page });
export const OfficeList = z.object({ filter: z.enum(OFFICE_FILTERS).default("all"), q: Search });
export const AuditList = z.object({ page: Page });

export const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const CreateInvite = z
  .object({
    email: Email.optional(),
    days: z.number().int().min(1).max(90).default(7),
    uses: z.number().int().min(1).max(100).default(1),
    note: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((n) => (n ? n : undefined)),
    send: z.boolean().default(false),
  })
  .refine((v) => !v.send || v.email !== undefined, { message: "Sending needs an email", path: ["email"] });
export type CreateInvite = z.infer<typeof CreateInvite>;

export const MAX_VEXIS_DAILY_USD = 1000;
export const EnableOffice = z.object({
  email: Email,
  vexisDailyUsd: z.number().min(0).max(MAX_VEXIS_DAILY_USD).default(0.5),
});
export const OfficeCap = z.object({
  userId: z.string().min(1).max(100),
  vexisDailyUsd: z.number().min(0).max(MAX_VEXIS_DAILY_USD),
});

export const STOP_PHRASE = "STOP";

// --- roles ---------------------------------------------------------------------------------------

export type Role = "admin" | "member";
export type RoleRefusal = "self" | "last-admin" | "unchanged";

/**
 * Whether `actor` may set `target` to `to`. `adminIds` is every admin read under a row lock in the same
 * transaction. Nobody changes their own role (so nobody locks themselves out by accident), and the last admin
 * can never be removed, even by another admin racing with the first.
 */
export function roleChangeRefusal(input: {
  actorId: string;
  targetId: string;
  from: Role;
  to: Role;
  adminIds: readonly string[];
}): RoleRefusal | null {
  if (input.from === input.to) return "unchanged";
  if (input.actorId === input.targetId) return "self";
  if (input.from === "admin" && input.to === "member") {
    const remaining = input.adminIds.filter((id) => id !== input.targetId);
    if (remaining.length === 0) return "last-admin";
  }
  return null;
}

/** The only roles that pass the admin check. Anything else, including a missing user, is not an admin. */
export const isAdminRole = (role: string | null | undefined): role is "admin" => role === "admin";

// --- invites -------------------------------------------------------------------------------------

export type InviteState = { revokedAt: Date | null; expiresAt: Date; useCount: number; maxUses: number };
export type InviteStatus = "revoked" | "redeemed" | "expired" | "active";

/** Mirrors `findUsableInvite`: usable while not revoked, not expired and with uses left. */
export function inviteStatus(i: InviteState, now: number): InviteStatus {
  if (i.revokedAt) return "revoked";
  if (i.useCount >= i.maxUses) return "redeemed";
  if (i.expiresAt.getTime() <= now) return "expired";
  return "active";
}

/** `%`, `_` and `\` are wildcards in LIKE; a search for them must find them literally. */
export const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

// --- origin ---------------------------------------------------------------------------------------

/**
 * Server functions are plain endpoints, so a mutation checks where it came from. Browsers send `Origin` on every
 * POST; without it, `Sec-Fetch-Site` says whether the page was cross-site. Better Auth's own origin check only
 * covers /api/auth/*.
 */
export function originAllowed(input: {
  origin: string | null;
  secFetchSite: string | null;
  expectedOrigin: string;
}): boolean {
  if (input.origin !== null) return input.origin === input.expectedOrigin;
  return input.secFetchSite === null || input.secFetchSite === "same-origin" || input.secFetchSite === "none";
}

// --- rate limit ------------------------------------------------------------------------------------

export type Limit = { max: number; windowMs: number };

/** Sliding window: the times still inside the window, and whether one more fits. A refused call is not counted. */
export function slide(times: readonly number[], now: number, limit: Limit) {
  const kept = times.filter((t) => now - t < limit.windowMs);
  if (kept.length >= limit.max) return { ok: false as const, times: kept };
  return { ok: true as const, times: [...kept, now] };
}

// --- secrets in error text -------------------------------------------------------------------------

/**
 * Error text from the runtimes (Telegram, RPC, Jupiter) can carry a bot token inside a URL or an RPC URL with its
 * API key. The admin page shows only the host of any URL, and never a token-shaped string.
 */
export function redact(text: string, max = 200): string {
  const out = text
    .replace(/https?:\/\/([^\s/?#"')]+)[^\s"')]*/gi, (_, host: string) => `${host.replace(/^.*@/, "")}/…`)
    .replace(/\bbot\d{6,}:[A-Za-z0-9_-]{20,}/g, "bot…")
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, "…")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{40,}\b/g, "…")
    .replace(/\b(?:sk|pk|key|api)[-_][A-Za-z0-9_-]{16,}/gi, "…");
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}
