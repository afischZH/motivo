/**
 * Server configuration of the Founders waitlist. Server only: reads secrets
 * from the runtime environment (Cloudflare Worker secrets via OpenNext's
 * `process.env`, `.dev.vars` or `.env.local` locally). The feature is off,
 * and the UI shows "coming soon", unless all four required variables are set.
 *
 * Never import this from a client component; the secret-scan test in
 * `waitlist.test.ts` checks the client bundle.
 */

export interface WaitlistEnv {
  SUPABASE_URL?: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  RESEND_API_KEY?: string | undefined;
  WAITLIST_FROM_EMAIL?: string | undefined;
  TURNSTILE_SECRET_KEY?: string | undefined;
}

export interface WaitlistConfig {
  /** Project URL, e.g. https://<ref>.supabase.co (no trailing slash). */
  supabaseUrl: string;
  /** Secret key (`sb_secret_…`) or legacy service_role JWT. */
  supabaseKey: string;
  resendApiKey: string;
  /** Sender, e.g. `Motivo <warteliste@example.ch>` on a domain verified at Resend. */
  fromEmail: string;
  /** Turnstile secret; null runs without a challenge. */
  turnstileSecret: string | null;
}

/** The variables from `process.env`, read per request (secrets can change without a build). */
export function waitlistEnv(): WaitlistEnv {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    WAITLIST_FROM_EMAIL: process.env.WAITLIST_FROM_EMAIL,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  };
}

function value(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** Only https, except a local Supabase stack (`supabase start`) on http://127.0.0.1. */
function supabaseUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** `Name <local@domain>` or `local@domain`, without line breaks (header injection). */
const FROM_PATTERN =
  /^(?:[^<>\r\n@]{1,64} <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

/** The configuration, or null when the waitlist is switched off. */
export function waitlistConfig(env: WaitlistEnv = waitlistEnv()): WaitlistConfig | null {
  const url = supabaseUrl(value(env.SUPABASE_URL));
  const supabaseKey = value(env.SUPABASE_SERVICE_ROLE_KEY);
  const resendApiKey = value(env.RESEND_API_KEY);
  const fromEmail = value(env.WAITLIST_FROM_EMAIL);
  if (!url || !supabaseKey || !resendApiKey || !fromEmail || !FROM_PATTERN.test(fromEmail)) {
    return null;
  }
  return {
    supabaseUrl: url,
    supabaseKey,
    resendApiKey,
    fromEmail,
    turnstileSecret: value(env.TURNSTILE_SECRET_KEY),
  };
}
