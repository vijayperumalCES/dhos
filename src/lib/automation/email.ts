export type EmailMessage = { to: string; subject: string; text: string };
export type EmailOutcome = "sent" | "simulated";
export interface EmailProvider {
  readonly name: "resend" | "simulated";
  send(message: EmailMessage): Promise<EmailOutcome>;
}

/**
 * Without credentials, email is *simulated*: the notification is marked "simulated" so the UI can
 * say nothing was actually sent. With RESEND_API_KEY and EMAIL_FROM set, mail goes through Resend.
 */
export function resolveEmailProvider(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): EmailProvider {
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!key || !from) return { name: "simulated", send: async () => "simulated" };
  return {
    name: "resend",
    async send(m) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Email provider answered HTTP ${res.status}`);
      return "sent";
    },
  };
}

export function composeEmail(row: { to_email: string; title: string; body: string | null; link: string | null; organization_name: string }, siteUrl: string): EmailMessage {
  const lines = [row.body, row.link ? `Open: ${siteUrl}${row.link}` : null, "", `You receive this because of your notification settings in ${row.organization_name} on Stride.`];
  return { to: row.to_email, subject: `[${row.organization_name}] ${row.title}`, text: lines.filter((l) => l !== null).join("\n") };
}
