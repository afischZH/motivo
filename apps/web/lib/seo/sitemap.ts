/**
 * Sitemap entries: every indexable content page in every enabled locale,
 * each with its hreflang alternates (same set as the page's `<link>` tags).
 * Built from the registry, the category list, the CSS pattern library, the
 * curated gradient and palette collections and the converter ids, never
 * from a hand-written list. Editor pages are reachable from every landing
 * page and stay indexable, but the sitemap points crawlers at the landing
 * pages, which carry the text.
 */
import type { MetadataRoute } from "next";

import { ENABLED_LOCALES } from "@/i18n/locales";
import type { AppRoute } from "@/i18n/paths";
import { populatedCategories } from "@/lib/catalogue";
import { curatedGradients } from "@/lib/collections/gradients";
import { curatedPalettes } from "@/lib/collections/palettes";
import { libraryPatterns } from "@/lib/css-patterns";
import { CONVERTER_IDS } from "@/lib/convert/ids";
import { legalPagesIndexable } from "@/lib/legal/config";
import { registry } from "@motivo/tool-registry";

import { pageAlternates } from "./alternates";
import { siteUrl } from "./site-url";

/** Every page that belongs in the sitemap, independent of the language. */
export function sitemapRoutes(): AppRoute[] {
  return [
    { page: "home" },
    { page: "tools" },
    ...populatedCategories().map((category): AppRoute => ({ page: "category", category })),
    ...registry.list().map((tool): AppRoute => ({ page: "landing", toolId: tool.id })),
    { page: "patterns" },
    ...libraryPatterns().map((spec): AppRoute => ({ page: "pattern", patternId: spec.id })),
    { page: "gradients" },
    ...curatedGradients().map((g): AppRoute => ({ page: "gradient", gradientId: g.id })),
    { page: "palettes" },
    ...curatedPalettes().map((p): AppRoute => ({ page: "palette", paletteId: p.id })),
    { page: "convert" },
    ...CONVERTER_IDS.map((id): AppRoute => ({ page: "converter", converterId: id })),
    // Waitlist result pages are noindex and never listed.
    { page: "founders" },
    // Draft legal pages are noindex and stay out until the legal review.
    ...(legalPagesIndexable() ? [{ page: "imprint" } as const, { page: "privacy" } as const] : []),
  ];
}

export function sitemapEntries(base: URL = siteUrl()): MetadataRoute.Sitemap {
  return sitemapRoutes().flatMap((route) =>
    ENABLED_LOCALES.map((locale) => {
      const { canonical, languages } = pageAlternates(route, locale, base);
      return {
        url: String(canonical),
        alternates: { languages: languages as Record<string, string> },
      };
    }),
  );
}
