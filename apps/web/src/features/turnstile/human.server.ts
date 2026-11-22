// Entry gate: a visitor proves once, with Cloudflare Turnstile, that they are not a bot. The proof is an HMAC-signed
// cookie, so nothing is stored. Without TURNSTILE_SECRET_KEY the gate is off, which keeps dev and CI as they were.

import { createHmac, timingSafeEqual } from "node:crypto";

export const HUMAN_COOKIE = "vexis_human";
export const VERIFY_PATH = "/__verify";
const TTL_SEC = 24 * 60 * 60;

function mac(secret: string, exp: string) {
  return createHmac("sha256", secret).update(`vexis-human:${exp}`).digest("base64url");
}

export function signHuman(secret: string, nowMs: number) {
  const exp = String(Math.floor(nowMs / 1000) + TTL_SEC);
  return `${exp}.${mac(secret, exp)}`;
}

export function isHuman(secret: string, cookie: string | undefined, nowMs: number) {
  const [exp, sig, ...rest] = cookie?.split(".") ?? [];
  if (!exp || !sig || rest.length > 0 || !(Number(exp) > nowMs / 1000)) return false;
  const want = Buffer.from(mac(secret, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

function readCookie(header: string | null, name: string) {
  for (const part of header?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
}

async function turnstileAccepts(token: string, ip: string | undefined) {
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY ?? "", response: token });
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

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function challengePage(siteKey: string, host: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Just a moment...</title>
<link rel="icon" type="image/png" href="/favicon.png">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{line-height:1.15;color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif}
body{display:flex;flex-direction:column;min-height:100vh;background:#fff;color:#313131}
a{color:#0051c3}
.main{flex:1;width:100%;max-width:60rem;margin:8rem auto 0;padding:0 1.5rem}
h1{display:flex;align-items:center;font-size:40px;font-weight:600;line-height:50px;word-break:break-word}
h1 img{width:32px;height:32px;margin-right:24px}
h2{margin:8px 0;font-size:24px;font-weight:600;line-height:30px}
p{margin-bottom:32px;font-size:16px;line-height:24px;color:#595959}
.cf-turnstile{margin-bottom:32px}
#msg{color:#b20f03}
footer{margin:0 1.5rem 2rem;padding-top:1rem;border-top:1px solid #8888;font-size:12px;line-height:18px;text-align:center}
@media(prefers-color-scheme:dark){body{background:#000;color:#f2f2f2}p{color:#b6b6b6}a{color:#4f9bff}}
@media(max-width:720px){.main{margin-top:4rem}}
</style></head><body>
<div class="main">
<h1><img src="/favicon.png" alt="">${escapeHtml(host)}</h1>
<h2>Performing security verification</h2>
<p>This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.</p>
<div class="cf-turnstile" data-sitekey=${JSON.stringify(siteKey)} data-callback="done" data-theme="auto"></div>
<p id="msg" role="alert"></p>
</div>
<footer>Performance and Security by <a href="https://www.cloudflare.com/" rel="noopener">Cloudflare</a> | <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Privacy</a></footer>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>
async function done(token){
  try{
    const res=await fetch(${JSON.stringify(VERIFY_PATH)},{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
    if(res.ok){location.reload();return}
  }catch{}
  document.getElementById("msg").textContent="Verification failed. Reload the page and try again.";
}
</script></body></html>`;
}

const NO_STORE = { "cache-control": "no-store" };

/** Runs before every request Start handles. Verified visitors pass; everyone else gets the challenge page. */
export async function humanGate<T>({ request, next }: { request: Request; next: () => T }): Promise<T | Response> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  if (!secret || !siteKey) return next();

  const url = new URL(request.url);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  if (url.pathname === VERIFY_PATH) {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    const token = await request
      .json()
      .then((body: { token?: unknown }) => (typeof body.token === "string" ? body.token : ""))
      .catch(() => "");
    if (!token || !(await turnstileAccepts(token, ip))) return new Response(null, { status: 403, headers: NO_STORE });
    const secure = process.env.BETTER_AUTH_URL?.startsWith("https:") ? "; Secure" : "";
    return new Response(null, {
      status: 204,
      headers: {
        ...NO_STORE,
        "set-cookie": `${HUMAN_COOKIE}=${signHuman(secret, Date.now())}; Path=/; Max-Age=${TTL_SEC}; HttpOnly; SameSite=Lax${secure}`,
      },
    });
  }

  if (isHuman(secret, readCookie(request.headers.get("cookie"), HUMAN_COOKIE), Date.now())) return next();

  if (url.pathname.startsWith("/api/") || (request.method !== "GET" && request.method !== "HEAD")) {
    return new Response(null, { status: 403, headers: NO_STORE });
  }
  // A 200 on the requested URL, not a redirect: the deploy health check expects 200 from /login.
  return new Response(challengePage(siteKey, url.hostname), {
    status: 200,
    headers: { ...NO_STORE, "content-type": "text/html; charset=utf-8" },
  });
}
