/**
 * Minimal SendGrid v3 sender — plain fetch, no SDK. Multipart alternative
 * (text + html) per message. Throws on non-2xx so callers can record the
 * failure; SendGrid returns 202 on accept.
 *
 * Plug-and-play config resolution (company_config first, env fallback):
 *   sendgrid_api_key   / SENDGRID_API_KEY          — required to send
 *   email_from_address / DAILY_TARGETS_EMAIL_FROM  — verified sender
 *   email_from_name    (default: `${company_name} KPI`)
 */
import { getConfig } from '@/lib/config-service';

export interface OutboundEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(msg: OutboundEmail): Promise<void> {
  const apiKey = (await getConfig('sendgrid_api_key')) ?? process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('SendGrid is not configured (set sendgrid_api_key in Admin, or SENDGRID_API_KEY env var)');
  const from =
    (await getConfig('email_from_address')) ??
    process.env.DAILY_TARGETS_EMAIL_FROM ??
    'kpi@example.com';
  const companyName = (await getConfig('company_name')) ?? 'KPI Platform';
  const fromName = (await getConfig('email_from_name')) ?? `${companyName} KPI`;

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: msg.to.map((email) => ({ email })) }],
      from: { email: from, name: fromName },
      subject: msg.subject,
      content: [
        { type: 'text/plain', value: msg.text },
        { type: 'text/html', value: msg.html },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SendGrid ${res.status}: ${body.slice(0, 300)}`);
  }
}
