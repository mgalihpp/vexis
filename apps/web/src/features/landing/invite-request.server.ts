import { getDb } from "@vexis/db/client";
import { sendMail } from "@vexis/db/mail";
import { requestInvite } from "@vexis/db/queries";
import { INVITE_REQUEST_LIMIT, type InviteRequestResult, rateLimit } from "./invite-request";

const requestsByIp = new Map<string, number[]>();

function allow(ip: string, now: number) {
  if (requestsByIp.size > 10_000) {
    for (const [key, times] of requestsByIp) {
      if (times.every((t) => now - t >= INVITE_REQUEST_LIMIT.windowMs)) requestsByIp.delete(key);
    }
  }
  const { ok, times } = rateLimit(requestsByIp.get(ip) ?? [], now);
  requestsByIp.set(ip, times);
  return ok;
}

export async function handleInviteRequest(
  input: { email: string; website?: string },
  ip: string,
): Promise<InviteRequestResult> {
  if (!allow(ip, Date.now())) return { ok: false, error: "rate-limited" };
  if (input.website) return { ok: true };
  let isNew: boolean;
  try {
    isNew = await requestInvite(getDb(), input.email);
  } catch (error) {
    console.error("[invite-request]", error);
    return { ok: false, error: "server" };
  }
  const notify = process.env.INVITE_NOTIFY_EMAIL;
  if (isNew && notify) {
    // Not awaited: a slower answer for new emails would reveal who already asked.
    const line = `New Vexis invite request: ${input.email}`;
    sendMail({ to: notify, subject: line, text: line }).catch((error) => console.error("[invite-request] mail", error));
  }
  return { ok: true };
}
