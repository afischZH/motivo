/**
 * Absolute base URL for canonical and hreflang links. Set
 * `NEXT_PUBLIC_SITE_URL` once the production domain is decided; until then
 * the workers.dev production URL is used. Inlined at build time.
 */
export const FALLBACK_SITE_URL = "https://motivo-web.andreas-65d.workers.dev";

export function resolveSiteUrl(raw: string | undefined): URL {
  const value = raw?.trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") return new URL(url.origin);
    } catch {
      // Malformed value: fall through to the fallback.
    }
  }
  return new URL(FALLBACK_SITE_URL);
}

export function siteUrl(): URL {
  return resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}
