const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

interface Message {
  to: string;
  subject: string;
  /** Plain sentences; rendered as paragraphs. */
  lines: string[];
  action?: { label: string; url: string };
}

/**
 * Transactional email through Resend. Without RESEND_API_KEY the message is
 * written to the server log, which is enough for local development.
 */
export async function sendEmail({ to, subject, lines, action }: Message): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email not sent: RESEND_API_KEY/EMAIL_FROM unset] to=${to} subject="${subject}" ${action?.url ?? ""}`);
    return;
  }
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:480px">` +
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
    (action
      ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${escapeHtml(action.label)}</a></p>`
      : "") +
    `<p style="color:#777;font-size:13px">Uttala</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text: [...lines, action ? `${action.label}: ${action.url}` : ""].join("\n\n"),
    }),
  });
  if (!res.ok) console.error(`Email to ${to} failed (${res.status})`);
}
