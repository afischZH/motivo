/**
 * Sitemap entries: every indexable content page in every enabled locale,
 * each with its hreflang alternates (same set as the page's `<link>` tags).
 * Built from the registry, the category list, the CSS pattern library, the
 * curated gradient and palette collections and the converter ids, never
 * from a hand-written list. Editor pages are reachable from every landing
 * page and stay indexable, but the sitemap points crawlers at the landing
 * pages, which carry the text.
 *
 * `scripts/sitemap.mjs` writes the XML (`sitemapXml`) to `public/sitemap.xml`
 * before the build: a static file, so the Worker carries no route (and no
 * copy of the registry) for it.
 */
import type { MetadataRoute } from "next";

import { ENABLED_LOCALES, type EnabledLocale } from "@/i18n/locales";
import type { AppRoute } from "@/i18n/paths";
import { TASK_IDS } from "@/i18n/slugs";
import { populatedCategories } from "@/lib/catalogue";
import { curatedGradients } from "@/lib/collections/gradients";
import { curatedPalettes } from "@/lib/collections/palettes";
import { libraryPatterns } from "@/lib/css-patterns";
import { CONVERTER_IDS } from "@/lib/convert/ids";
import { legalPagesIndexable } from "@/lib/legal/config";
import { registry } from "@musterli/tool-registry";

import { pageAlternates } from "./alternates";
import { DEFAULT_MOTIF, hasStaticMotif, motifPath } from "./motifs";
import { ogImagePath } from "./og";
import { siteUrl } from "./site-url";

/** Every page that belongs in the sitemap, independent of the language. */
export function sitemapRoutes(): AppRoute[] {
  return [
    { page: "home" },
    { page: "tools" },
    { page: "socialEditor" },
    ...populatedCategories().map((category): AppRoute => ({ page: "category", category })),
    ...TASK_IDS.map((task): AppRoute => ({ page: "task", task })),
    ...registry.list().map((tool): AppRoute => ({ page: "landing", toolId: tool.id })),
    { page: "patterns" },
    ...libraryPatterns().map((spec): AppRoute => ({ page: "pattern", patternId: spec.id })),
    { page: "gradients" },
    ...curatedGradients().map((g): AppRoute => ({ page: "gradient", gradientId: g.id })),
    { page: "palettes" },
    ...curatedPalettes().map((p): AppRoute => ({ page: "palette", paletteId: p.id })),
    { page: "convert" },
    ...CONVERTER_IDS.map((id): AppRoute => ({ page: "converter", converterId: id })),
    { page: "support" },
    // Draft legal pages are noindex and stay out until the legal review.
    ...(legalPagesIndexable()
      ? [{ page: "imprint" } as const, { page: "privacy" } as const, { page: "terms" } as const]
      : []),
  ];
}

/**
 * Image sitemap entries of a page: for a tool landing page the localized OG
 * image (PNG with the tool name) and the preview motif shown on the page
 * (SVG), both only when the tool has a static motif. Other pages have none.
 */
export function sitemapImages(route: AppRoute, locale: EnabledLocale, base: URL): string[] {
  if (route.page !== "landing") return [];
  const tool = registry.get(route.toolId);
  if (!tool || !hasStaticMotif(tool)) return [];
  return [
    new URL(ogImagePath(tool.id, locale), base).toString(),
    new URL(motifPath(tool.id, DEFAULT_MOTIF), base).toString(),
  ];
}

export function sitemapEntries(base: URL = siteUrl()): MetadataRoute.Sitemap {
  return sitemapRoutes().flatMap((route) =>
    ENABLED_LOCALES.map((locale) => {
      const { canonical, languages } = pageAlternates(route, locale, base);
      const images = sitemapImages(route, locale, base);
      return {
        url: String(canonical),
        alternates: { languages: languages as Record<string, string> },
        ...(images.length > 0 ? { images } : {}),
      };
    }),
  );
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c);
}

/**
 * The entries as sitemap XML with hreflang alternates (`xhtml:link`) and
 * image entries (`image:image`), in the layout Next.js uses for metadata
 * sitemap routes (one element per line).
 */
export function sitemapXml(entries: MetadataRoute.Sitemap): string {
  const hasImages = entries.some((e) => (e.images?.length ?? 0) > 0);
  const hasAlternates = entries.some((e) => Object.keys(e.alternates?.languages ?? {}).length > 0);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
      hasImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ""
    }${hasAlternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ""}>`,
  ];
  for (const entry of entries) {
    lines.push("<url>", `<loc>${xml(entry.url)}</loc>`);
    for (const [lang, href] of Object.entries(entry.alternates?.languages ?? {})) {
      if (href) {
        lines.push(
          `<xhtml:link rel="alternate" hreflang="${xml(lang)}" href="${xml(String(href))}" />`,
        );
      }
    }
    for (const image of entry.images ?? []) {
      lines.push("<image:image>", `<image:loc>${xml(image)}</image:loc>`, "</image:image>");
    }
    lines.push("</url>");
  }
  lines.push("</urlset>", "");
  return lines.join("\n");
}
