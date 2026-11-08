// Email bodies. Table layout and inline styles only: mail clients drop stylesheets,
// flexbox and webfonts, so every rule here is the one Gmail and Outlook agree on.

import { readFileSync } from "node:fs";

const SANS = `'Inter','Inter Variable',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const BRAND_FONT = `'Chakra Petch',${SANS}`;
const MONO = `'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;

// Read from src/styles.css: the dark theme, 0.45rem radius.
const BACKGROUND = "#09090b";
const CARD = "#18181b";
const BORDER = "rgba(255,255,255,0.10)";
const TEXT = "#fafafa";
const MUTED = "#a1a1aa";
const BRAND = "#baf448";
const BRAND_INK = "#0e0e0e";
const RADIUS = "7px";
// The app's <Notice>: border-brand/30, bg-brand/10, text-foreground/80, flattened onto CARD
// because Outlook ignores rgba backgrounds.
const NOTICE_BG = "#282e20";
const NOTICE_BORDER = "#495a29";
const NOTICE_TEXT = "#d0d1ce";

const mark = readFileSync(new URL("../assets/vexis-mark.png", import.meta.url)).toString("base64");

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function inviteEmail(input: { link: string; code: string; expiresAt: Date }) {
  const expires = day.format(input.expiresAt);
  const { link, code } = input;

  const text = `Your seat at Vexis is ready.

Thanks for waiting. Bring your first wallet and see what every position really earned, with live pool data and alerts the moment a pool heats up.

Claim your invite:
${link}

Your invite code: ${code}
Valid until ${expires}.

Keep this invite to yourself. It works once, so whoever uses the link or code first takes your seat.

If you didn't ask for an invite, you can ignore this email.
Vexis
`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>Your Vexis invite</title>
</head>
<body style="margin:0;padding:0;background-color:${BACKGROUND};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Thanks for waiting. Your invite is valid until ${expires}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BACKGROUND};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background-color:${CARD};border:1px solid ${BORDER};border-radius:12px;">

        <tr>
          <td style="padding:30px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="26" style="width:26px;"><img src="cid:vexis-mark" width="26" height="24" alt="Vexis" style="display:block;width:26px;height:24px;border:0;outline:none;text-decoration:none;"></td>
                <td style="padding-left:9px;font-family:${BRAND_FONT};font-size:15px;font-weight:700;line-height:24px;letter-spacing:.16em;color:${TEXT};">VEXIS</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 32px 0 32px;font-family:${BRAND_FONT};font-size:30px;font-weight:700;line-height:1.15;letter-spacing:-.01em;color:${TEXT};">Your seat at Vexis is&nbsp;ready.</td>
        </tr>

        <tr>
          <td style="padding:14px 32px 0 32px;font-family:${SANS};font-size:14px;line-height:22px;color:${MUTED};">Thanks for waiting. Bring your first wallet and see what every position really earned, with live pool data and alerts the moment a pool heats up.</td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="${BRAND}" style="border-radius:${RADIUS};mso-padding-alt:14px 28px;">
                  <a href="${link}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:14px;font-weight:600;line-height:1;color:${BRAND_INK};text-decoration:none;border-radius:${RADIUS};">Claim your invite</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 0 8px 0;font-family:${SANS};font-size:12px;line-height:16px;color:${MUTED};">Or enter your invite code</td>
              </tr>
              <tr>
                <td style="padding:12px 14px;background-color:${BACKGROUND};border:1px solid ${BORDER};border-radius:${RADIUS};font-family:${MONO};font-size:13px;line-height:20px;color:${TEXT};word-break:break-all;">${code}</td>
              </tr>
              <tr>
                <td style="padding:8px 0 0 0;font-family:${SANS};font-size:12px;line-height:16px;color:${MUTED};">Valid until ${expires}.</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px 0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:10px 12px;background-color:${NOTICE_BG};border:1px solid ${NOTICE_BORDER};border-radius:${RADIUS};font-family:${SANS};font-size:12px;line-height:18px;color:${NOTICE_TEXT};"><strong style="color:${TEXT};font-weight:600;">Keep this invite to yourself.</strong> It works once, so whoever uses the link or code first takes your seat.</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px 30px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BORDER};">
              <tr>
                <td style="padding:16px 0 0 0;font-family:${SANS};font-size:11px;line-height:18px;color:${MUTED};">If you didn&rsquo;t ask for an invite, you can ignore this email.</td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return {
    subject: "Your Vexis invite is ready",
    text,
    html,
    attachments: [{ filename: "vexis-mark.png", content: mark, content_id: "vexis-mark" }],
  };
}
