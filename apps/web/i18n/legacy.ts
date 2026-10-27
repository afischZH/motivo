/**
 * Canonical redirects for tool and converter URLs that use a tool id, another
 * locale's slug or another locale's section segment, e.g. M1 share links like
 * `/en/tools/blob#d=...` or `/de/convert/svg-to-css`. Pure, so the proxy can
 * run it before next-intl and answer with a single permanent redirect. The
 * URL hash (`#d=`) never reaches the server and is kept by the browser.
 */
import { isEnabledLocale } from "./locales";
import {
  converterIdFromAnySlug,
  converterSlug,
  sectionFromAnySlug,
  sectionSlug,
  toolIdFromAnySlug,
  toolSlug,
} from "./slugs";

/** The canonical pathname for `pathname`, or null if it is canonical or unknown. */
export function canonicalRedirect(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2 || segments.length > 3) return null;
  const [locale, sectionSegment, slug] = segments as [string, string, string | undefined];
  if (!isEnabledLocale(locale)) return null;
  const section = sectionFromAnySlug(sectionSegment);
  if (!section) return null;

  let canonical: string;
  if (slug === undefined) {
    canonical = `/${locale}/${sectionSlug(section, locale)}`;
  } else if (section === "tools") {
    const toolId = toolIdFromAnySlug(slug);
    if (!toolId) return null;
    canonical = `/${locale}/${sectionSlug(section, locale)}/${toolSlug(toolId, locale)}`;
  } else {
    const converterId = converterIdFromAnySlug(slug);
    if (!converterId) return null;
    canonical = `/${locale}/${sectionSlug(section, locale)}/${converterSlug(converterId, locale)}`;
  }

  return canonical === pathname.replace(/\/+$/, "") ? null : canonical;
}
