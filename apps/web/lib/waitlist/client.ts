/**
 * Browser side of the waitlist: talks only to our own API (the CSP allows
 * nothing else). Client-safe: no secrets, no server modules.
 */
import { WAITLIST_API, type WaitlistCountResponse, type WaitlistErrorCode } from "./constants";

/** Loose client check; the server validates for real. */
export function looksLikeEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type Availability =
  | { state: "loading" }
  | { state: "off" }
  | { state: "on"; confirmed: number | null; seats: number };

export async function fetchAvailability(fetchImpl: typeof fetch = fetch): Promise<Availability> {
  try {
    const response = await fetchImpl(WAITLIST_API.count, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { state: "off" };
    const body = (await response.json()) as WaitlistCountResponse;
    if (!body.enabled) return { state: "off" };
    const confirmed =
      typeof body.confirmed === "number" && Number.isInteger(body.confirmed) && body.confirmed >= 0
        ? body.confirmed
        : null;
    return { state: "on", confirmed, seats: body.seats };
  } catch {
    return { state: "off" };
  }
}

export interface SignupRequest {
  email: string;
  locale: string;
  consent: boolean;
  turnstileToken?: string | undefined;
  website?: string | undefined;
}

export type SignupResult = { ok: true } | { ok: false; error: WaitlistErrorCode };

const ERRORS: readonly WaitlistErrorCode[] = [
  "disabled",
  "invalid",
  "captcha",
  "rate_limited",
  "unavailable",
];

export async function submitSignup(
  request: SignupRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SignupResult> {
  try {
    const response = await fetchImpl(WAITLIST_API.signup, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request),
    });
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    const error = ERRORS.find((code) => code === body.error) ?? "unavailable";
    return { ok: false, error };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export type UnsubscribeResult = "unsubscribed" | "invalid" | "error";

export async function submitUnsubscribe(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UnsubscribeResult> {
  try {
    const response = await fetchImpl(WAITLIST_API.unsubscribe, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = (await response.json().catch(() => ({}))) as { status?: unknown };
    if (body.status === "unsubscribed") return "unsubscribed";
    if (body.status === "invalid") return "invalid";
    return "error";
  } catch {
    return "error";
  }
}

/** The token from a URL fragment like `#token=…`, or null. */
export function tokenFromHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
