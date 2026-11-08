export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string; content_id: string }[];
};

export async function sendMail(mail: Mail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM ?? "Vexis <invite@stunobagent.my.id>", ...mail }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
