/**
 * Security headers for every response. Kept identical in two places:
 * `next.config.ts` (pages) and `public/_headers` (static files served by
 * Workers Static Assets without running the Worker); a test checks both.
 *
 * Stricter than it needs to be for now: no third-party origins at all.
 * 'unsafe-inline' for scripts and styles has the same reason as in apps/web
 * (Next puts page-specific inline scripts into static pages; nonces would
 * force dynamic rendering).
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export interface Header {
  readonly key: string;
  readonly value: string;
}

export const SECURITY_HEADERS: readonly Header[] = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Not public yet (generic workers.dev host, no name): keep every page out
  // of search indexes until launch.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** The `public/_headers` file for Cloudflare Workers Static Assets. */
export function staticHeadersFile(): string {
  const lines = SECURITY_HEADERS.map(({ key, value }) => `  ${key}: ${value}`);
  return ["/*", ...lines, ""].join("\n");
}
