/**
 * Founders waitlist (M2-AP10, docs/ARCHITECTURE.md "Founders-Warteliste").
 * Product numbers and wire constants shared by the API, the UI and the
 * e-mail. Pure, safe for client components.
 */

/** Founders licences (docs/PRODUCT.md 6.2: the first 300 licences). */
export const FOUNDERS_SEATS = 300;

/** Lowest Founders lifetime price (Solo), shown as a non-binding "from" price. */
export const FOUNDERS_PRICE_FROM = 49;

/**
 * Version of the consent text the form shows (`Waitlist.consent` in the
 * messages) and the privacy policy section it links to. Bump it whenever
 * either changes in substance; every sign-up stores the version it agreed to.
 */
export const WAITLIST_CONSENT_VERSION = "2026-10-27";

/** How long the counter may be cached (server memory and browser). */
export const COUNT_CACHE_SECONDS = 60;

/** Confirmation and unsubscribe tokens: 32 random bytes, base64url without padding. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** API endpoints (same origin; the CSP allows nothing else). */
export const WAITLIST_API = {
  signup: "/api/waitlist",
  confirm: "/api/waitlist/confirm",
  unsubscribe: "/api/waitlist/unsubscribe",
  count: "/api/waitlist/count",
} as const;

/** Error codes the signup endpoint returns; the form maps each to a message. */
export type WaitlistErrorCode = "disabled" | "invalid" | "captcha" | "rate_limited" | "unavailable";

/** GET /api/waitlist/count */
export type WaitlistCountResponse =
  { enabled: false } | { enabled: true; confirmed: number | null; seats: number };
