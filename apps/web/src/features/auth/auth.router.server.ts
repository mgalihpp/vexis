import { APIError } from "better-auth/api";
import { publicProcedure, router } from "@/trpc/init.server";
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

export const authRouter = router({
  viewer: publicProcedure.query(({ ctx }) => getViewerFromHeaders(ctx.headers)),
  signIn: publicProcedure.input(SignInInput).mutation(async ({ ctx, input }): Promise<AuthResult> => {
    try {
      await getAuth().api.signInEmail({ body: input, headers: ctx.headers });
      return { ok: true };
    } catch (error) {
      return toAuthError(error, "credentials");
    }
  }),
  join: publicProcedure.input(JoinInput).mutation(async ({ ctx, input }): Promise<AuthResult> => {
    const headers = new Headers(ctx.headers);
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
