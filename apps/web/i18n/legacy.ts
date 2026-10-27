/**
 * Canonical redirects for tool and converter URLs that use a tool id, another
 * locale's slug or another locale's section segment (also for landing and
 * category pages), e.g. M1 share links like
 * `/en/tools/blob#d=...` or `/de/convert/svg-to-css`. Pure, so the proxy can
 * run it before next-intl and answer with a single permanent redirect. The
 * URL hash (`#d=`) never reaches the server and is kept by the browser.
 */
import { isEnabledLocale } from "./locales";
import {
  categoryIdFromAnySlug,
  categorySegment,
  categorySlug,
  converterIdFromAnySlug,
  converterSlug,
  sectionFromAnySlug,
  isCategorySegment,
  sectionSlug,
  toolIdFromAnySlug,
  toolSlug,
} from "./slugs";

/** The canonical pathname for `pathname`, or null if it is canonical or unknown. */
export function canonicalRedirect(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2 || segments.length > 4) return null;
  const [locale, sectionSegment, slug] = segments as [string, string, string | undefined];
  if (!isEnabledLocale(locale)) return null;
  const section = sectionFromAnySlug(sectionSegment);

  let canonical: string;
  if (!section) {
    // Top-level landing page: `/de/<tool slug>`.
    if (segments.length !== 2) return null;
    const toolId = toolIdFromAnySlug(sectionSegment);
    if (!toolId) return null;
    canonical = `/${locale}/${toolSlug(toolId, locale)}`;
  } else if (segments.length === 4) {
    // Category page: `/de/tools/kategorie/<category slug>`.
    const category = section === "tools" && isCategorySegment(slug ?? "") ? segments[3] : undefined;
    const id = category ? categoryIdFromAnySlug(category) : undefined;
    if (!id) return null;
    canonical = `/${locale}/${sectionSlug(section, locale)}/${categorySegment(locale)}/${categorySlug(id, locale)}`;
  } else if (slug === undefined) {
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
