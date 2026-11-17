// Client-safe admin view logic: how a stored reason or status reads on the page.

import {
  LOW_SOL,
  REBALANCE_FAILING,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_RELINK,
  WALLET_UNREADABLE,
} from "@vexis/shared/agents";
import { ADMIN_STOP, DAILY_LOSS, EXECUTION_FAILING, KILL_SWITCH } from "@vexis/shared/office";
import { SCREENER_PRESETS } from "@vexis/shared/screen";

export type Tone = "danger" | "warning" | "muted" | "profit";

const OFFICE_PAUSES: Record<string, string> = {
  [ADMIN_STOP]: "Admin stop",
  [KILL_SWITCH]: "Kill switch",
  [DAILY_LOSS]: "Daily loss",
  [EXECUTION_FAILING]: "Exec failing",
};

export function officeStatus(office: { paused: boolean; pausedReason: string | null }): { label: string; tone: Tone } {
  if (!office.paused) return { label: "Running", tone: "profit" };
  const label = (office.pausedReason && OFFICE_PAUSES[office.pausedReason]) || "Paused";
  if (office.pausedReason === EXECUTION_FAILING) return { label, tone: "warning" };
  return { label, tone: office.pausedReason === DAILY_LOSS || office.pausedReason === ADMIN_STOP ? "danger" : "muted" };
}

const AGENT_PAUSES: Record<string, { label: string; tone: Tone }> = {
  [LOW_SOL]: { label: "Low SOL", tone: "danger" },
  [REBALANCE_FAILING]: { label: "Rebalance failing", tone: "danger" },
  [TELEGRAM_NOT_LINKED]: { label: "No Telegram", tone: "warning" },
  [TELEGRAM_RELINK]: { label: "Re-link Telegram", tone: "warning" },
  [WALLET_UNREADABLE]: { label: "Wallet unreadable", tone: "warning" },
};

export function agentPause(reason: string | null): { label: string; tone: Tone } {
  if (reason === null) return { label: "By user", tone: "muted" };
  return AGENT_PAUSES[reason] ?? { label: reason, tone: "muted" };
}

export function presetLabel(preset: string) {
  return preset === "custom" ? "Custom" : (SCREENER_PRESETS[preset as keyof typeof SCREENER_PRESETS]?.label ?? preset);
}

export const AUDIT_LABEL: Record<string, string> = {
  "invite.create": "Created invite",
  "invite.send": "Sent invite",
  "invite.revoke": "Revoked invite",
  "invite.extend": "Extended invite",
  "role.change": "Changed role",
  "office.enable": "Enabled office",
  "office.disable": "Disabled office",
  "office.cap": "Set LLM cap",
  "office.stop_all": "Stopped all offices",
  "office.resume_all": "Resumed all offices",
};

export const usd = (n: number) => `$${n.toFixed(2)}`;

const utcDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const utcTime = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** UTC like every other day boundary here, so the server and the browser print the same. */
export const dateUtc = (ms: number) => utcDate.format(ms);
export const stampUtc = (ms: number) => `${utcDate.format(ms)} ${utcTime.format(ms)}`;
