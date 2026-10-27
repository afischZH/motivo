/**
 * Which hosts search engines may index. Only the production host (the host
 * of the canonical base URL, see `site-url.ts`) is indexable; every other
 * host gets `X-Robots-Tag: noindex`. That covers Worker preview URLs
 * (`<alias>-motivo-web.<subdomain>.workers.dev`), a workers.dev production
 * URL once a custom domain is canonical, and local servers, without any
 * per-environment build flag. Applied as a `headers()` rule in
 * `next.config.ts`, so it also covers prerendered pages, sitemap and robots.
 *
 * No imports with path aliases: `next.config.ts` loads this file.
 */
import { siteUrl } from "./site-url";

export const ROBOTS_HEADER = "X-Robots-Tag";
export const NOINDEX_VALUE = "noindex, nofollow";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex source (Next anchors it with ^...$) that matches the indexable host.
 * Next and OpenNext compare against the Host header without port, lowercased.
 */
export function indexableHostPattern(base: URL = siteUrl()): string {
  return escapeRegex(base.hostname.toLowerCase());
}

/** Whether a request to `host` (Host header, port allowed) may be indexed. */
export function isIndexableHost(host: string | null | undefined, base: URL = siteUrl()): boolean {
  if (!host) return false;
  const hostname = host.split(":", 1)[0]?.toLowerCase() ?? "";
  return new RegExp(`^${indexableHostPattern(base)}$`).test(hostname);
}

/** `headers()` entry for next.config: noindex on every host but production. */
export function noindexHeaderRule(base: URL = siteUrl()) {
  return {
    source: "/:path*",
    missing: [{ type: "host" as const, value: indexableHostPattern(base) }],
    headers: [{ key: ROBOTS_HEADER, value: NOINDEX_VALUE }],
  };
}
