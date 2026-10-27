/**
 * Contract of the Founders waitlist functions in
 * `supabase/migrations/20261027120000_founders_waitlist.sql`. The web app
 * calls them over the Data API (`/rest/v1/rpc/<name>`); tests in
 * `waitlist.test.ts` run them against the migration.
 */

/** RPC function names. */
export const WAITLIST_RPC = {
  confirmedCount: "waitlist_confirmed_count",
  requestSignup: "waitlist_request_signup",
  confirm: "waitlist_confirm",
  unsubscribe: "waitlist_unsubscribe",
  mailFailed: "waitlist_mail_failed",
} as const;

/** Arguments of `waitlist_request_signup` (named, as the Data API passes them). */
export interface WaitlistSignupArgs {
  p_email: string;
  p_locale: string;
  p_consent_version: string;
  /** SHA-256 hex of the confirmation token. */
  p_confirm_token_hash: string;
  /** SHA-256 hex of the unsubscribe token. */
  p_unsubscribe_token_hash: string;
  /** HMAC-SHA-256 hex of the client IP, or null when unknown. */
  p_rate_key_hash: string | null;
}

/** `send`: mail the link; `skip`: no mail, same answer to the client; `rate_limited`: try later. */
export type WaitlistSignupOutcome = "send" | "skip" | "rate_limited";
export type WaitlistConfirmOutcome = "confirmed" | "invalid";
export type WaitlistUnsubscribeOutcome = "unsubscribed" | "invalid";

/** Limits enforced in the database (mirrored for docs, UI copy and tests). */
export const WAITLIST_DB_LIMITS = {
  ipRequestsPerHour: 10,
  resendCooldownMinutes: 10,
  maxSendsPerAddress: 5,
  tokenTtlHours: 48,
  pendingRetentionDays: 30,
  globalSendsPerDay: 90,
} as const;

export const WAITLIST_LOCALES = ["de", "en", "fr", "it"] as const;
