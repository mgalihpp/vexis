import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { safeRedirect } from "@/features/auth/auth";
import { LoginScreen } from "@/features/auth/components/login-screen";

const LoginSearch = z.object({
  mode: z.literal("join").optional().catch(undefined),
  /** Invite links open the join form with the code filled in: /login?mode=join&invite=… */
  invite: z.string().optional().catch(undefined),
  redirect: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/login")({
  validateSearch: LoginSearch,
  beforeLoad: ({ context, search }) => {
    if (context.viewer) throw redirect({ to: safeRedirect(search.redirect) });
  },
  head: () => ({ meta: [{ title: "Sign in | Vexis" }] }),
  component: LoginRoute,
});

function LoginRoute() {
  const { mode, invite, redirect: target } = Route.useSearch();
  return <LoginScreen mode={mode ?? (invite ? "join" : "sign-in")} invite={invite} redirect={target} />;
}
