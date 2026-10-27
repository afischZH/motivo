/**
 * Security headers for every response (docs/ARCHITECTURE.md, "Sicherheit").
 *
 * Applied in three places that must stay identical:
 * - `next.config.ts` `headers()`: HTML pages and RSC payloads (OpenNext
 *   applies these in its routing layer on Cloudflare).
 * - `proxy.ts`: redirects answered by the proxy, which OpenNext returns
 *   without the `headers()` set.
 * - `public/_headers`: files that Cloudflare Workers Static Assets serves
 *   directly without running the Worker (`/_next/static/*`, public files).
 *   Not checked in: `scripts/headers.mjs` writes it before `next build` and
 *   `next dev` from this module and the same environment variables.
 *
 * Pure strings, safe for the proxy runtime. The theme script hash lives in
 * `csp-hash.ts` (node:crypto) and is not part of the policy yet.
 */

import { NO_EXTERNAL_SERVICES, type ExternalServices } from "./telemetry/config";

/**
 * Third-party origins per service. A service is allowed only when the build
 * enables it (`telemetry/config.ts`: its environment variable is set), so
 * previews and local builds keep the strict self-only policy.
 */
const EXTERNAL: Record<
  keyof ExternalServices,
  { script: string[]; connect: string[]; frame?: string[] }
> = {
  // Cloudflare Web Analytics, manual embedding (site not proxied by Cloudflare).
  analytics: {
    script: ["https://static.cloudflareinsights.com"],
    connect: ["https://cloudflareinsights.com"],
  },
  // Sentry EU ingest. The SDK itself is bundled and loaded from 'self'.
  sentry: { script: [], connect: ["https://*.ingest.de.sentry.io"] },
  // Cloudflare Turnstile on the waitlist form: loader script and challenge iframe.
  turnstile: {
    script: ["https://challenges.cloudflare.com"],
    connect: [],
    frame: ["https://challenges.cloudflare.com"],
  },
};

function external(services: ExternalServices, kind: "script" | "connect" | "frame"): string[] {
  return (Object.keys(EXTERNAL) as (keyof ExternalServices)[])
    .filter((service) => services[service])
    .flatMap((service) => EXTERNAL[service][kind] ?? []);
}

export interface SecurityHeaderOptions {
  /** `next dev`: adds the dev-only allowances below. Never true in a production build. */
  dev: boolean;
  /** Enabled third-party services (default: none). Ignored in dev. */
  services?: ExternalServices;
  /**
   * The request comes from a local host over plain http (`next start` in E2E).
   * Drops the HTTPS-only parts: WebKit, unlike Chromium, applies
   * upgrade-insecure-requests on http://localhost and then cannot load any
   * script, so pages never hydrate.
   */
  local?: boolean;
}

/**
 * Hosts served over plain http during local and CI runs, as a Next `has`
 * host value (Next anchors it and matches the host name without port).
 */
export const LOCAL_HOST_PATTERN = "(?:localhost|127\\.0\\.0\\.1)";

/** True for `localhost` and `127.0.0.1`, with or without port. */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return new RegExp(`^${LOCAL_HOST_PATTERN}$`).test(host.replace(/:\d+$/, "").toLowerCase());
}

/** The Content-Security-Policy value as a single header line. */
export function contentSecurityPolicy({
  dev,
  services = NO_EXTERNAL_SERVICES,
  local = false,
}: SecurityHeaderOptions): string {
  const enabled = dev ? NO_EXTERNAL_SERVICES : services;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline': see THEME_SCRIPT_HASH in csp-hash.ts. Dev only: React and Turbopack
    // HMR use eval for debugging (per the Next.js CSP guide).
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      ...external(enabled, "script"),
    ],
    // React renders `style` attributes into the static HTML (preview sizes,
    // CSS tool previews, swatches) and Radix injects <style> for scroll
    // locking. CSS cannot run script; the remaining risk is CSS-based data
    // exfiltration, limited by img-src/connect-src/font-src below.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Previews, thumbnails and user SVGs are data: URIs; exports are blob: URLs.
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    // Dev only: the HMR websocket (Safari does not match ws: against 'self').
    "connect-src": ["'self'", ...(dev ? ["ws:"] : []), ...external(enabled, "connect")],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  // Only with a service that embeds a frame (Turnstile); otherwise default-src applies.
  const frames = external(enabled, "frame");
  if (frames.length > 0) directives["frame-src"] = ["'self'", ...frames];
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Dev and local runs use plain http://localhost; upgrading would break subresources there.
  if (!dev && !local) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Powerful features nobody on the site needs. Clipboard and fullscreen stay allowed. */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "browsing-topics=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

export interface Header {
  key: string;
  value: string;
}

export function securityHeaders(options: SecurityHeaderOptions): Header[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // No `preload` until the final domain is fixed. Browsers ignore it over http;
    // local hosts get max-age=0 so no browser ever pins localhost to https.
    {
      key: "Strict-Transport-Security",
      value: options.local ? "max-age=0" : "max-age=63072000; includeSubDomains",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Legacy fallback for frame-ancestors 'none'.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/**
 * next.config `headers()` rule for local hosts. Listed after the main rule:
 * Next lets the last matching rule win for the same header key, so only CSP
 * and HSTS change. Production hosts never match.
 */
export function localHostHeaderRule(options: SecurityHeaderOptions) {
  const local = securityHeaders({ ...options, local: true });
  return {
    source: "/:path*",
    has: [{ type: "host" as const, value: LOCAL_HOST_PATTERN }],
    headers: local.filter(
      ({ key }) => key === "Content-Security-Policy" || key === "Strict-Transport-Security",
    ),
  };
}

/**
 * Content of `public/_headers` for Cloudflare Workers Static Assets
 * (production values for the services this build enables). Written by
 * `scripts/headers.mjs` before every build from the same environment
 * variables as `next.config.ts`, so the file and the Worker always agree.
 */
export function cloudflareHeadersFile(services: ExternalServices = NO_EXTERNAL_SERVICES): string {
  const lines = securityHeaders({ dev: false, services }).map(
    ({ key, value }) => `  ${key}: ${value}`,
  );
  return [
    "# Generated from lib/security-headers.ts by scripts/headers.mjs at build time. Do not edit.",
    "# Applies to files served by Workers Static Assets; the Worker sets the same headers via next.config.ts.",
    "/*",
    ...lines,
    "",
  ].join("\n");
}
