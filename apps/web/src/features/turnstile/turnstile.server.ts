// Cloudflare Turnstile on the login form. Off unless both keys are set, which keeps dev and CI as they were.

export const TURNSTILE_HEADER = "x-vexis-turnstile";

export function turnstileSiteKey() {
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  return siteKey && process.env.TURNSTILE_SECRET_KEY ? siteKey : null;
}

export async function turnstileAccepts(token: string | null | undefined, ip: string | undefined) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch (error) {
    console.error("[turnstile]", error);
    return false;
  }
}
