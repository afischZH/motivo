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
  collectionItemFromAnySlug,
  collectionItemSlug,
  converterIdFromAnySlug,
  converterSlug,
  sectionFromAnySlug,
  isCategorySegment,
  patternIdFromAnySlug,
  patternSlug,
  sectionSlug,
  toolIdFromAnySlug,
  toolSlug,
  waitlistPageFromAnySlug,
  waitlistPageSlug,
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
  } else if (section === "cssPatterns") {
    // Library pattern page: `/de/css-muster/<pattern slug>`.
    const patternId = patternIdFromAnySlug(slug);
    if (!patternId) return null;
    canonical = `/${locale}/${sectionSlug(section, locale)}/${patternSlug(patternId, locale)}`;
  } else if (section === "gradients" || section === "palettes") {
    // Collection item page: `/de/farbverlaeufe/<gradient slug>`.
    const itemId = segments.length === 3 ? collectionItemFromAnySlug(section, slug) : undefined;
    if (!itemId) return null;
    canonical = `/${locale}/${sectionSlug(section, locale)}/${collectionItemSlug(section, itemId, locale)}`;
  } else if (section === "convert") {
    const converterId = converterIdFromAnySlug(slug);
    if (!converterId) return null;
    canonical = `/${locale}/${sectionSlug(section, locale)}/${converterSlug(converterId, locale)}`;
  } else if (section === "founders") {
    // Waitlist result pages: `/de/founders-warteliste/bestaetigt`.
    const page = waitlistPageFromAnySlug(slug);
    if (!page || segments.length !== 3) return null;
    canonical = `/${locale}/${sectionSlug(section, locale)}/${waitlistPageSlug(page, locale)}`;
  } else {
    // Single-page sections (legal pages) have no sub-pages.
    return null;
  }

  return canonical === pathname.replace(/\/+$/, "") ? null : canonical;
}
