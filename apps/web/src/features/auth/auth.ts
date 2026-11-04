// Client-safe auth model: the form schemas, the viewer shape, and the error codes the server returns.

import { z } from "zod";

export const SignInInput = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export const JoinInput = SignInInput.extend({
  invite: z.string().trim().min(1),
  password: z.string().min(8).max(128),
});

export type AuthMode = "sign-in" | "join";

export interface Viewer {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
}

/** Why a sign-in or join failed. Network failures never reach the server, so the client adds that one. */
export type AuthError = "credentials" | "invite" | "invite-email" | "email-taken" | "weak-password" | "server";

export type AuthResult = { ok: true } | { ok: false; error: AuthError };

export const AUTH_ERROR_MESSAGE: Record<AuthError | "network", string> = {
  credentials: "Email or password is incorrect.",
  invite: "Invite code is invalid or has expired.",
  "invite-email": "This invite is for a different email.",
  "email-taken": "An account with this email already exists.",
  "weak-password": "Use at least 8 characters.",
  server: "Something went wrong. Try again.",
  network: "Can’t reach the server. Try again.",
};

/** Pages a signed-out visitor may open. Everything else redirects to /login. */
export function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/terms" || pathname === "/privacy" || pathname.startsWith("/api/auth/");
}

/** Only same-site paths, so a crafted ?redirect= can't send someone to another origin after login. */
export function safeRedirect(target: string | undefined) {
  if (!target?.startsWith("/") || target.startsWith("//") || isPublicPath(target)) return "/";
  return target;
}
