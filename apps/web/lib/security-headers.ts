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
 *   `security-headers.test.ts` fails when that file drifts from this module.
 *
 * Pure strings, safe for the proxy runtime. The theme script hash lives in
 * `csp-hash.ts` (node:crypto) and is not part of the policy yet.
 */

/**
 * Third-party origins. Allowing a planned service is a one-line change: move
 * its commented entry into the list.
 */
const EXTERNAL = {
  script: [
    // "https://static.cloudflareinsights.com", // Cloudflare Web Analytics beacon script
  ] as string[],
  connect: [
    // "https://cloudflareinsights.com", // Cloudflare Web Analytics beacon endpoint
    // "https://*.ingest.de.sentry.io", // Sentry EU ingest
  ] as string[],
};

export interface SecurityHeaderOptions {
  /** `next dev`: adds the dev-only allowances below. Never true in a production build. */
  dev: boolean;
}

/** The Content-Security-Policy value as a single header line. */
export function contentSecurityPolicy({ dev }: SecurityHeaderOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline': see THEME_SCRIPT_HASH in csp-hash.ts. Dev only: React and Turbopack
    // HMR use eval for debugging (per the Next.js CSP guide).
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      ...EXTERNAL.script,
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
    "connect-src": ["'self'", ...(dev ? ["ws:"] : []), ...EXTERNAL.connect],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Dev runs on plain http://localhost; upgrading would break subresources there.
  if (!dev) parts.push("upgrade-insecure-requests");
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
    // No `preload` until the final domain is fixed. Browsers ignore it over http.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Legacy fallback for frame-ancestors 'none'.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/**
 * Content of `public/_headers` for Cloudflare Workers Static Assets
 * (production values). The test writes it as a file snapshot; regenerate with
 * `pnpm --filter @motivo/web headers:write`.
 */
export function cloudflareHeadersFile(): string {
  const lines = securityHeaders({ dev: false }).map(({ key, value }) => `  ${key}: ${value}`);
  return [
    "# Generated from lib/security-headers.ts. Do not edit; run `pnpm --filter @motivo/web headers:write`.",
    "# Applies to files served by Workers Static Assets; the Worker sets the same headers via next.config.ts.",
    "/*",
    ...lines,
    "",
  ].join("\n");
}
