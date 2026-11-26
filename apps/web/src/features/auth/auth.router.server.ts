import { APIError } from "better-auth/api";
import { TURNSTILE_HEADER, turnstileSiteKey } from "@/features/turnstile/turnstile.server";
import { publicProcedure, router } from "@/trpc/init.server";
import { type AuthError, type AuthResult, JoinInput, SignInInput } from "./auth";
import { getAuth, getViewerFromHeaders, hookRejection, INVITE_HEADER } from "./auth.server";

function toAuthError(error: unknown, fallback: AuthError): AuthResult {
  const rejected = hookRejection(error);
  if (rejected) return { ok: false, error: rejected };
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

function withCaptcha(source: Headers, captcha: string | undefined) {
  const headers = new Headers(source);
  headers.delete(TURNSTILE_HEADER);
  if (captcha) headers.set(TURNSTILE_HEADER, captcha);
  return headers;
}

export const authRouter = router({
  viewer: publicProcedure.query(({ ctx }) => getViewerFromHeaders(ctx.headers)),
  /** The Turnstile site key for the login form, or null when Turnstile is off. */
  captcha: publicProcedure.query(() => turnstileSiteKey()),
  signIn: publicProcedure.input(SignInInput).mutation(async ({ ctx, input }): Promise<AuthResult> => {
    const { captcha, ...body } = input;
    try {
      await getAuth().api.signInEmail({ body, headers: withCaptcha(ctx.headers, captcha) });
      return { ok: true };
    } catch (error) {
      return toAuthError(error, "credentials");
    }
  }),
  join: publicProcedure.input(JoinInput).mutation(async ({ ctx, input }): Promise<AuthResult> => {
    const headers = withCaptcha(ctx.headers, input.captcha);
    headers.set(INVITE_HEADER, input.invite);
    try {
      await getAuth().api.signUpEmail({
        body: { email: input.email, password: input.password, name: input.email.split("@")[0] ?? input.email },
        headers,
      });
      return { ok: true };
    } catch (error) {
      return toAuthError(error, "server");
    }
  }),
  signOut: publicProcedure.mutation(async ({ ctx }) => {
    await getAuth().api.signOut({ headers: ctx.headers });
  }),
});
