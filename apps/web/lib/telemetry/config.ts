/**
 * Which third-party services run: cookie-free Cloudflare Web Analytics and
 * client-side error reporting with Sentry (EU region). Each is off unless its
 * public environment variable is set at build time, and always off in
 * `next dev`. The same switch drives the CSP (`security-headers.ts`), the
 * generated `public/_headers` and the client loader, so a service is either
 * allowed and loaded, or neither.
 *
 * Deploy: set the variables only for the production build. Preview builds
 * leave them empty; the analytics loader additionally checks the host.
 *
 * Pure and without path aliases: `next.config.ts`, `proxy.ts` and
 * `scripts/headers.mjs` import it.
 */

/** The variables this module reads. */
export interface TelemetryEnv {
  NODE_ENV?: string | undefined;
  NEXT_PUBLIC_CF_ANALYTICS_TOKEN?: string | undefined;
  NEXT_PUBLIC_SENTRY_DSN?: string | undefined;
}

/**
 * The variables from `process.env`. Each `NEXT_PUBLIC_*` name is spelled out
 * so Next inlines it into client bundles at build time.
 */
export function telemetryEnv(): TelemetryEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_CF_ANALYTICS_TOKEN: process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  };
}

/** Cloudflare Web Analytics site tokens are 32 hex characters. */
const ANALYTICS_TOKEN = /^[0-9a-f]{32}$/i;

/** Sentry's EU data region ingests on `o<org>.ingest.de.sentry.io`. */
export const SENTRY_EU_INGEST_SUFFIX = ".ingest.de.sentry.io";

function isDev(env: TelemetryEnv): boolean {
  return env.NODE_ENV === "development";
}

/** The analytics site token, or null when analytics is off. */
export function analyticsToken(env: TelemetryEnv): string | null {
  const token = env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN?.trim();
  if (isDev(env) || !token || !ANALYTICS_TOKEN.test(token)) return null;
  return token;
}

/**
 * The Sentry DSN, or null when error reporting is off. Only DSNs of the EU
 * region are accepted, so events can never go to the US region by mistake.
 */
export function sentryDsn(env: TelemetryEnv): string | null {
  const raw = env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (isDev(env) || !raw) return null;
  try {
    const url = new URL(raw);
    const ok =
      url.protocol === "https:" &&
      url.username !== "" &&
      url.hostname.endsWith(SENTRY_EU_INGEST_SUFFIX) &&
      /^\/\d+$/.test(url.pathname);
    return ok ? raw : null;
  } catch {
    return null;
  }
}

export interface ExternalServices {
  analytics: boolean;
  sentry: boolean;
}

export const NO_EXTERNAL_SERVICES: ExternalServices = {
  analytics: false,
  sentry: false,
};

/** Which services the build enables (drives the CSP). */
export function externalServices(env: TelemetryEnv): ExternalServices {
  return {
    analytics: analyticsToken(env) !== null,
    sentry: sentryDsn(env) !== null,
  };
}

/** Beacon script and endpoint for sites not proxied through Cloudflare. */
export const CF_BEACON_SCRIPT = "https://static.cloudflareinsights.com/beacon.min.js";
