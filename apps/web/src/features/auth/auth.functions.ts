import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";
import { type AuthError, type AuthResult, JoinInput, SignInInput } from "./auth";
import { getAuth, getViewerFromHeaders, INVITE_HEADER, inviteRejection } from "./auth.server";

function toAuthError(error: unknown, fallback: AuthError): AuthResult {
  const invite = inviteRejection(error);
  if (invite) return { ok: false, error: invite };
  if (!(error instanceof APIError)) {
    console.error("[auth]", error);
    return { ok: false, error: "server" };
  }
  const code = String(error.body?.code ?? "");
  if (code.startsWith("USER_ALREADY_EXISTS")) return { ok: false, error: "email-taken" };
  if (code.startsWith("PASSWORD_TOO")) return { ok: false, error: "weak-password" };
  if (code === "INVALID_EMAIL_OR_PASSWORD" || error.statusCode === 401) return { ok: false, error: "credentials" };
  return { ok: false, error: fallback };
}

export const getViewer = createServerFn({ method: "GET" }).handler(() =>
  getViewerFromHeaders(new Headers(getRequestHeaders())),
);

export const signIn = createServerFn({ method: "POST" })
  .validator(SignInInput)
  .handler(async ({ data }): Promise<AuthResult> => {
    try {
      await getAuth().api.signInEmail({ body: data, headers: new Headers(getRequestHeaders()) });
      return { ok: true };
    } catch (error) {
      return toAuthError(error, "credentials");
    }
  });

export const join = createServerFn({ method: "POST" })
  .validator(JoinInput)
  .handler(async ({ data }): Promise<AuthResult> => {
    const headers = new Headers(getRequestHeaders());
    headers.set(INVITE_HEADER, data.invite);
    try {
      await getAuth().api.signUpEmail({
        body: { email: data.email, password: data.password, name: data.email.split("@")[0] ?? data.email },
        headers,
      });
      return { ok: true };
    } catch (error) {
      return toAuthError(error, "server");
    }
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await getAuth().api.signOut({ headers: new Headers(getRequestHeaders()) });
});
