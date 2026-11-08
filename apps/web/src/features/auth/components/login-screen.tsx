import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { cn } from "cn";
import { CheckIcon, LoaderCircleIcon } from "lucide-react";
import { type ComponentProps, type FormEvent, useId, useState } from "react";
import { Logo } from "@/components/icons";
import { isNetworkError } from "@/lib/query";
import { AUTH_ERROR_MESSAGE, type AuthError, type AuthMode, safeRedirect } from "../auth";
import { join, signIn } from "../auth.functions";
import { viewerQuery } from "../auth.queries";

type FormError = AuthError | "network" | "terms";

const COPY = {
  "sign-in": { title: "Sign in", submit: "Sign in", switchText: "Have an invite?", switchAction: "Join" },
  join: { title: "Join", submit: "Join", switchText: "Already a member?", switchAction: "Sign in" },
} as const;

/** Errors about the whole form go in the banner; the rest sit under the field they are about. */
const BANNER_ERRORS: FormError[] = ["credentials", "email-taken", "server", "network"];

export function LoginScreen({ mode, invite, redirect }: { mode: AuthMode; invite?: string; redirect?: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(invite ?? "");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);
  const copy = COPY[mode];
  const ready = agreed && email.length > 0 && password.length > 0 && (mode === "sign-in" || code.length > 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!agreed) return setError("terms");
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      const result =
        mode === "join"
          ? await join({ data: { email, password, invite: code } })
          : await signIn({ data: { email, password } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      queryClient.removeQueries({ queryKey: viewerQuery.queryKey });
      await router.invalidate();
      await navigate({ to: safeRedirect(redirect) });
    } catch (e) {
      setError(isNetworkError(e) ? "network" : "server");
    } finally {
      setPending(false);
    }
  }

  const switchTo = mode === "sign-in" ? "join" : undefined;
  const banner = error && BANNER_ERRORS.includes(error) ? AUTH_ERROR_MESSAGE[error as AuthError | "network"] : null;
  const credentialsWrong = error === "credentials";

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute top-[300px] -right-[110px] opacity-10 md:hidden">
        <Logo height={300} />
      </div>
      <div aria-hidden className="pointer-events-none absolute top-[170px] right-10 hidden opacity-10 md:block">
        <Logo height={470} />
      </div>

      <header className="relative flex h-[88px] items-end justify-between px-6 pb-4 md:items-center md:px-[160px] md:pb-0">
        <Link to="/" className="flex items-center gap-2.5 font-brand text-lg font-bold tracking-[0.12em] uppercase">
          <Logo height={22} />
          Vexis
        </Link>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {copy.switchText}
          <Link
            to="/login"
            search={{ mode: switchTo, redirect }}
            onClick={() => setError(null)}
            className="ml-1 font-medium text-brand hover:underline"
          >
            {copy.switchAction}
          </Link>
        </p>
      </header>

      <main className="relative flex flex-1 items-center px-6 pb-16 md:px-[160px] md:pb-24">
        <form onSubmit={submit} noValidate className="flex w-full flex-col gap-8 md:w-[420px] md:gap-10">
          <h1 className="text-[44px] leading-none font-bold md:text-[56px]">{copy.title}</h1>

          {banner && (
            <p role="alert" className="border-l-2 border-loss pl-3 text-[13px] text-loss">
              {banner}
            </p>
          )}

          <div className="flex flex-col gap-5 md:gap-6">
            {mode === "join" && (
              <UnderlineField
                label="Invite code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="tracking-[0.08em]"
                error={error === "invite" ? AUTH_ERROR_MESSAGE.invite : undefined}
              />
            )}
            <UnderlineField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              invalid={credentialsWrong}
              error={error === "invite-email" ? AUTH_ERROR_MESSAGE["invite-email"] : undefined}
            />
            <UnderlineField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "join" ? "new-password" : "current-password"}
              invalid={credentialsWrong}
              error={error === "weak-password" ? AUTH_ERROR_MESSAGE["weak-password"] : undefined}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  if (e.target.checked && error === "terms") setError(null);
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-px flex size-4 shrink-0 items-center justify-center rounded-sm border border-input peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                  agreed && "border-brand bg-brand text-brand-foreground",
                  error === "terms" && "border-loss",
                )}
              >
                {agreed && <CheckIcon className="size-3" strokeWidth={3} />}
              </span>
              <span>
                I agree to the{" "}
                <Link to="/terms" target="_blank" className="text-foreground underline underline-offset-2">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" target="_blank" className="text-foreground underline underline-offset-2">
                  Privacy Policy
                </Link>
              </span>
            </label>
            {error === "terms" && <p className="ml-[26px] text-xs text-loss">Accept the terms to continue.</p>}
          </div>

          <button
            type="submit"
            aria-disabled={!ready || pending}
            className={cn(
              "flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              ready
                ? "bg-brand text-brand-foreground hover:bg-brand/90"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
          >
            {pending && <LoaderCircleIcon className="size-4 animate-spin" />}
            {copy.submit}
          </button>
        </form>
      </main>
    </div>
  );
}

function UnderlineField({
  label,
  error,
  invalid,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string; invalid?: boolean }) {
  const id = useId();
  const bad = invalid || error !== undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={bad || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "h-10 w-full border-b border-input bg-transparent text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground",
          bad && "border-loss focus:border-loss",
          className,
        )}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
