/**
 * Confirmation e-mail of the Founders waitlist (double opt-in) and its
 * delivery through the Resend REST API with `fetch` (no SDK).
 *
 * JURISTISCH ZU PRÜFEN: the e-mail texts (`WaitlistEmail` in
 * messages/*.json) are drafts and need a legal review before launch,
 * together with the privacy policy section `waitlist`.
 *
 * Privacy: plain text plus simple HTML, no images, no external resources,
 * no tracking pixels and no rewritten links (open and click tracking must
 * stay off for the sending domain at Resend, docs/SETUP-WAITLIST.md). The
 * recipient address is never logged.
 */
import { WAITLIST_DB_LIMITS } from "@motivo/db";
import { createTranslator, type Messages } from "next-intl";

import type { EnabledLocale } from "@/i18n/locales";
import { LEGAL_CONFIG, isPlaceholder } from "@/lib/legal/config";

import { FOUNDERS_PRICE_FROM } from "./constants";
import { WaitlistBackendError, type Fetch } from "./supabase";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ConfirmationEmailInput {
  locale: EnabledLocale;
  /** The locale's message catalogue (only `WaitlistEmail` and `Layout` are read). */
  messages: Messages;
  confirmUrl: string;
  /** Page with the unsubscribe button (token in the URL fragment). */
  unsubscribeUrl: string;
  /** RFC 8058 one-click endpoint for the List-Unsubscribe header. */
  oneClickUnsubscribeUrl: string;
  privacyUrl: string;
}

export interface Email {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

/** Escapes text for HTML element content and double-quoted attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sender line in the footer: the operator once `lib/legal/config.ts` is filled in. */
function senderLine(brand: string): string {
  const { name, city, country } = LEGAL_CONFIG.operator;
  const parts = [name, city, country].filter((part) => part.trim() && !isPlaceholder(part));
  return parts.length > 0 ? `${brand}, ${parts.join(", ")}` : brand;
}

export function buildConfirmationEmail(input: ConfirmationEmailInput): Email {
  const t = createTranslator({
    locale: input.locale,
    messages: input.messages,
    namespace: "WaitlistEmail",
  });
  const brand = createTranslator({
    locale: input.locale,
    messages: input.messages,
    namespace: "Layout",
  })("brand");
  const values = {
    hours: WAITLIST_DB_LIMITS.tokenTtlHours,
    days: WAITLIST_DB_LIMITS.pendingRetentionDays,
    price: FOUNDERS_PRICE_FROM,
  };
  const subject = t("subject");
  const heading = t("heading");
  const intro = t("intro");
  const button = t("button");
  const fallback = t("fallback");
  const expiry = t("expiry", values);
  const what = t("what", values);
  const ignore = t("ignore", values);
  const unsubscribe = t("unsubscribe");
  const privacy = t("privacy");
  const sender = senderLine(brand);

  const text = [
    heading,
    "",
    intro,
    "",
    input.confirmUrl,
    "",
    expiry,
    "",
    what,
    "",
    ignore,
    "",
    "--",
    `${unsubscribe} ${input.unsubscribeUrl}`,
    `${privacy} ${input.privacyUrl}`,
    sender,
    "",
  ].join("\n");

  const e = escapeHtml;
  const p = "margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2328;";
  const small = "margin:0 0 8px;font-size:13px;line-height:1.5;color:#59636e;";
  const html = `<!doctype html>
<html lang="${e(input.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1f2328;">${e(heading)}</h1>
<p style="${p}">${e(intro)}</p>
<p style="margin:24px 0;"><a href="${e(input.confirmUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1f2328;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">${e(button)}</a></p>
<p style="${small}">${e(fallback)}</p>
<p style="${small}word-break:break-all;"><a href="${e(input.confirmUrl)}" style="color:#0b57d0;">${e(input.confirmUrl)}</a></p>
<p style="${p}margin-top:16px;">${e(expiry)}</p>
<p style="${p}">${e(what)}</p>
<p style="${p}">${e(ignore)}</p>
<hr style="border:0;border-top:1px solid #d1d9e0;margin:24px 0;">
<p style="${small}"><a href="${e(input.unsubscribeUrl)}" style="color:#59636e;">${e(unsubscribe)}</a> · <a href="${e(input.privacyUrl)}" style="color:#59636e;">${e(privacy)}</a></p>
<p style="${small}">${e(sender)}</p>
</div>
</body>
</html>
`;

  return {
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${input.oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export interface SendEmailInput {
  apiKey: string;
  from: string;
  to: string;
  email: Email;
  /** Same key within 24 h: Resend sends at most once. */
  idempotencyKey: string;
}

/** Sends through Resend; throws `WaitlistBackendError` (status only) on failure. */
export async function sendEmail(input: SendEmailInput, fetchImpl: Fetch = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.email.subject,
        text: input.email.text,
        html: input.email.html,
        headers: input.email.headers,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new WaitlistBackendError("resend", null);
  }
  // The body may echo the recipient: never read or log it.
  await response.body?.cancel();
  if (!response.ok) throw new WaitlistBackendError("resend", response.status);
}
