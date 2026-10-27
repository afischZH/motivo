/**
 * Request handlers of the Founders waitlist API, independent of Next so the
 * tests can run them with fake `fetch`, clock and config. The route files in
 * `app/api/waitlist` only wire in the real dependencies.
 *
 * Security and privacy:
 * - Off (503 / `enabled: false`) unless `waitlistConfig()` finds every
 *   required secret.
 * - The signup answer never depends on whether the address is listed: same
 *   status and body for new, pending and confirmed addresses, and the mail
 *   goes out after the response (`defer`), so timing does not tell either.
 * - Tokens: 32 random bytes; only their SHA-256 reaches the database.
 * - Client IPs only as a daily HMAC for the rate limit (crypto.ts).
 * - Logs carry the failing service and HTTP status, never an address,
 *   token or response body.
 */
import type { Messages } from "next-intl";

import type { EnabledLocale } from "@/i18n/locales";
import { routePath } from "@/i18n/paths";

import type { WaitlistConfig } from "./config";
import {
  COUNT_CACHE_SECONDS,
  FOUNDERS_SEATS,
  TOKEN_PATTERN,
  WAITLIST_API,
  WAITLIST_CONSENT_VERSION,
  type WaitlistCountResponse,
  type WaitlistErrorCode,
} from "./constants";
import { clientIp, randomToken, rateLimitKey, sha256Hex } from "./crypto";
import { buildConfirmationEmail, sendEmail } from "./email";
import { MAX_BODY_BYTES, signupSchema } from "./schema";
import { supabaseStore, WaitlistBackendError, type Fetch, type WaitlistStore } from "./supabase";
import { verifyTurnstile } from "./turnstile";

export interface WaitlistDeps {
  config: WaitlistConfig | null;
  /** Absolute origin for links in the e-mail (NEXT_PUBLIC_SITE_URL). */
  baseUrl: URL;
  fetch?: Fetch;
  now?: () => Date;
  /** Store override for tests; defaults to the Supabase Data API. */
  store?: WaitlistStore;
  /** Message catalogue of a locale (for the e-mail). */
  messages: (locale: EnabledLocale) => Promise<Messages>;
  /** Runs work after the response is sent (Next `after`). */
  defer: (task: () => Promise<void>) => void;
  /** Logs a message that is safe to keep (no personal data). */
  log?: (message: string) => void;
}

const NO_STORE = { "Cache-Control": "no-store" };

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE, ...headers },
  });
}

function error(status: number, code: WaitlistErrorCode, headers?: Record<string, string>) {
  return json(status, { error: code }, headers);
}

function storeOf(deps: WaitlistDeps, config: WaitlistConfig): WaitlistStore {
  return deps.store ?? supabaseStore(config, deps.fetch ?? fetch);
}

function logFailure(deps: WaitlistDeps, action: string, cause: unknown): void {
  const detail = cause instanceof WaitlistBackendError ? cause.message : "unexpected error";
  (deps.log ?? console.error)(`waitlist: ${action} failed: ${detail}`);
}

function absolute(deps: WaitlistDeps, path: string): string {
  return new URL(path, deps.baseUrl).toString();
}

/**
 * The body as UTF-8 text, or null when it is larger than `limit` bytes. Reads
 * the stream and stops at the limit, so a body without (or with a false)
 * Content-Length is never buffered in full.
 */
export async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// POST /api/waitlist
// ---------------------------------------------------------------------------

export async function handleSignup(request: Request, deps: WaitlistDeps): Promise<Response> {
  const config = deps.config;
  if (!config) return error(503, "disabled");

  // JSON only: cross-site HTML forms cannot send it without a CORS preflight.
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return error(415, "invalid");

  const body = await readBody(request, MAX_BODY_BYTES);
  if (body === null) return error(413, "invalid");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return error(400, "invalid");
  }
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) return error(400, "invalid");
  const input = parsed.data;

  const accepted = json(202, { status: "pending" });
  // Honeypot filled in: answer like a success, do nothing.
  if (input.website) return accepted;

  const fetchImpl = deps.fetch ?? fetch;
  if (config.turnstileSecret) {
    const ok = await verifyTurnstile(config.turnstileSecret, input.turnstileToken, fetchImpl);
    if (!ok) return error(400, "captcha");
  }

  const now = (deps.now ?? (() => new Date()))();
  const confirmToken = randomToken();
  const unsubscribeToken = randomToken();
  const [confirmHash, unsubscribeHash] = await Promise.all([
    sha256Hex(confirmToken),
    sha256Hex(unsubscribeToken),
  ]);
  const ip = clientIp(request.headers);
  const rateKey = ip ? await rateLimitKey(config.supabaseKey, ip, now) : null;

  const store = storeOf(deps, config);
  let outcome;
  try {
    outcome = await store.requestSignup({
      p_email: input.email,
      p_locale: input.locale,
      p_consent_version: WAITLIST_CONSENT_VERSION,
      p_confirm_token_hash: confirmHash,
      p_unsubscribe_token_hash: unsubscribeHash,
      p_rate_key_hash: rateKey,
    });
  } catch (cause) {
    logFailure(deps, "signup", cause);
    return error(503, "unavailable");
  }

  if (outcome === "rate_limited") return error(429, "rate_limited", { "Retry-After": "3600" });

  if (outcome === "send") {
    const locale = input.locale;
    deps.defer(async () => {
      try {
        const email = buildConfirmationEmail({
          locale,
          messages: await deps.messages(locale),
          // A page with a button, not the API: link scanners must not confirm.
          // The token sits in the fragment, so it never reaches a server log.
          confirmUrl: absolute(
            deps,
            `${routePath({ page: "waitlist", waitlistPage: "confirm" }, locale)}#token=${confirmToken}`,
          ),
          unsubscribeUrl: absolute(
            deps,
            `${routePath({ page: "waitlist", waitlistPage: "unsubscribe" }, locale)}#token=${unsubscribeToken}`,
          ),
          oneClickUnsubscribeUrl: absolute(
            deps,
            `${WAITLIST_API.unsubscribe}?token=${unsubscribeToken}`,
          ),
          privacyUrl: absolute(deps, routePath({ page: "privacy" }, locale)),
        });
        await sendEmail(
          {
            apiKey: config.resendApiKey,
            from: config.fromEmail,
            to: input.email,
            email,
            idempotencyKey: `waitlist-confirm/${confirmHash}`,
          },
          fetchImpl,
        );
      } catch (cause) {
        logFailure(deps, "confirmation mail", cause);
        // Let the person retry at once instead of waiting for the cooldown.
        await store.mailFailed(confirmHash).catch((e: unknown) => {
          logFailure(deps, "mail rollback", e);
        });
      }
    });
  }
  return accepted;
}

// ---------------------------------------------------------------------------
// POST /api/waitlist/confirm (button on the confirm page)
// ---------------------------------------------------------------------------

/**
 * One-time confirmation. The e-mail links to a page (token in the URL
 * fragment) whose button POSTs here, never to a GET that confirms: mail
 * security scanners open links, and a confirming GET would let them complete
 * the double opt-in for an address whose owner never agreed. JSON only, so
 * a cross-site HTML form cannot send it without a CORS preflight.
 */
export async function handleConfirm(request: Request, deps: WaitlistDeps): Promise<Response> {
  const config = deps.config;
  if (!config) return error(503, "disabled");
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return json(415, { status: "invalid" });
  const body = await readBody(request, MAX_BODY_BYTES);
  let token: unknown;
  try {
    token = body === null ? null : (JSON.parse(body) as { token?: unknown } | null)?.token;
  } catch {
    token = null;
  }
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) {
    return json(400, { status: "invalid" });
  }
  try {
    const outcome = await storeOf(deps, config).confirm(await sha256Hex(token));
    return json(outcome === "confirmed" ? 200 : 404, { status: outcome });
  } catch (cause) {
    logFailure(deps, "confirm", cause);
    return error(503, "unavailable");
  }
}

// ---------------------------------------------------------------------------
// POST /api/waitlist/unsubscribe (page button and RFC 8058 one-click)
// ---------------------------------------------------------------------------

async function unsubscribeToken(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get("token");
  if (fromQuery) return fromQuery;
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  const body = await readBody(request, MAX_BODY_BYTES);
  if (!body) return null;
  if (type.startsWith("application/json")) {
    try {
      const value = (JSON.parse(body) as { token?: unknown }).token;
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }
  if (type.startsWith("application/x-www-form-urlencoded")) {
    return new URLSearchParams(body).get("token");
  }
  return null;
}

export async function handleUnsubscribe(request: Request, deps: WaitlistDeps): Promise<Response> {
  const config = deps.config;
  if (!config) return error(503, "disabled");
  const token = await unsubscribeToken(request);
  if (!token || !TOKEN_PATTERN.test(token)) return json(400, { status: "invalid" });
  try {
    const outcome = await storeOf(deps, config).unsubscribe(await sha256Hex(token));
    return json(outcome === "unsubscribed" ? 200 : 404, { status: outcome });
  } catch (cause) {
    logFailure(deps, "unsubscribe", cause);
    return error(503, "unavailable");
  }
}

// ---------------------------------------------------------------------------
// GET /api/waitlist/count
// ---------------------------------------------------------------------------

let countCache: { value: number; expires: number } | null = null;

/** For tests. */
export function resetCountCache(): void {
  countCache = null;
}

const CACHE_PUBLIC = {
  "Cache-Control": `public, max-age=${COUNT_CACHE_SECONDS}, stale-while-revalidate=${COUNT_CACHE_SECONDS}`,
};

export async function handleCount(deps: WaitlistDeps): Promise<Response> {
  const config = deps.config;
  if (!config) {
    const body: WaitlistCountResponse = { enabled: false };
    return json(200, body, CACHE_PUBLIC);
  }
  const now = (deps.now ?? (() => new Date()))().getTime();
  if (!countCache || countCache.expires <= now) {
    try {
      const value = await storeOf(deps, config).confirmedCount();
      countCache = { value, expires: now + COUNT_CACHE_SECONDS * 1000 };
    } catch (cause) {
      logFailure(deps, "count", cause);
      const body: WaitlistCountResponse = { enabled: true, confirmed: null, seats: FOUNDERS_SEATS };
      return json(200, body);
    }
  }
  const body: WaitlistCountResponse = {
    enabled: true,
    confirmed: countCache.value,
    seats: FOUNDERS_SEATS,
  };
  return json(200, body, CACHE_PUBLIC);
}
