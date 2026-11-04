// Server-only Better Auth instance. Email + password only, and sign-up needs a usable invite: the invite code
// travels in the INVITE_HEADER request header, so the same gate covers both our `join` server function and a
// direct POST to /api/auth/sign-up/email.

import { getDb } from "@vexis/db/client";
import { findUsableInvite, redeemInvite } from "@vexis/db/queries";
import { accounts, sessions, users, verifications } from "@vexis/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import type { Viewer } from "./auth";

export const INVITE_HEADER = "x-vexis-invite";

const INVITE_REJECTED = "INVITE_REJECTED";
const INVITE_OTHER_EMAIL = "INVITE_OTHER_EMAIL";

function rejectInvite(): never {
  throw new APIError("FORBIDDEN", { code: INVITE_REJECTED, message: "Invite code is invalid or has expired." });
}

// Says only that the email differs, never which email the invite is for.
function rejectOtherEmail(): never {
  throw new APIError("FORBIDDEN", { code: INVITE_OTHER_EMAIL, message: "This invite is for a different email." });
}

function createAuth() {
  const db = getDb();
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128, autoSignIn: true },
    user: { additionalFields: { role: { type: "string", input: false, defaultValue: "member" } } },
    // Every server function checks the session; the signed cookie cache spares the database most of those reads.
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;
        const token = ctx.headers?.get(INVITE_HEADER);
        const email = String(ctx.body?.email ?? "").toLowerCase();
        const invite = token ? await findUsableInvite(db, token) : undefined;
        if (!invite) rejectInvite();
        if (invite.email && invite.email.toLowerCase() !== email) rejectOtherEmail();
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // The before hook only checked the invite; this takes the use. If another sign-up took the last use in
          // between, the new user is removed again so no account exists without a redeemed invite.
          after: async (user, ctx) => {
            const token = ctx?.headers?.get(INVITE_HEADER);
            const redeemed = token ? await redeemInvite(db, token, { id: user.id, email: user.email }) : false;
            if (!redeemed) {
              await db.delete(users).where(eq(users.id, user.id));
              rejectInvite();
            }
          },
        },
      },
    },
    plugins: [tanstackStartCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  instance ??= createAuth();
  return instance;
}

export async function getViewerFromHeaders(headers: Headers): Promise<Viewer | null> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  const { id, email, name, role } = session.user;
  return { id, email, name, role: role === "admin" ? "admin" : "member" };
}

/** Which invite check a sign-up failed, if any. */
export function inviteRejection(error: unknown): "invite" | "invite-email" | null {
  if (!(error instanceof APIError)) return null;
  if (error.body?.code === INVITE_REJECTED) return "invite";
  if (error.body?.code === INVITE_OTHER_EMAIL) return "invite-email";
  return null;
}
