/**
 * Cloudflare Turnstile server-side validation (Siteverify API). Tokens are
 * single use, valid for 300 s and at most 2048 characters. The visitor's IP
 * is not sent (optional parameter; data minimisation).
 */
import type { Fetch } from "./supabase";

export const TURNSTILE_SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The action the widget sets; a token for another action is rejected. */
export const TURNSTILE_ACTION = "waitlist";

export const TURNSTILE_TOKEN_MAX = 2048;

/** True when Cloudflare confirms the token for our action; false on any doubt. */
export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  if (!token || token.length > TURNSTILE_TOKEN_MAX) return false;
  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        idempotency_key: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown; action?: unknown };
    // Cloudflare's test keys answer without an action; real widgets echo ours.
    return result.success === true && (!result.action || result.action === TURNSTILE_ACTION);
  } catch {
    return false;
  }
}
