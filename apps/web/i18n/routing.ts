import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, ENABLED_LOCALES, type EnabledLocale } from "./locales";
import { CATEGORY_SEGMENT, SECTION_SLUGS, type Section } from "./slugs";

/** Localized external pathname of a section, optionally with a dynamic tail. */
function sectionPath(section: Section, tail = ""): Record<EnabledLocale, string> {
  const entry: Record<EnabledLocale, string> = SECTION_SLUGS[section];
  return Object.fromEntries(
    ENABLED_LOCALES.map((locale) => [locale, `/${entry[locale]}${tail}`]),
  ) as Record<EnabledLocale, string>;
}

/** Category pages: `/tools/<localized "category">/[categorySlug]`. */
function categoryPath(): Record<EnabledLocale, string> {
  const tools: Record<EnabledLocale, string> = SECTION_SLUGS.tools;
  const segment: Record<EnabledLocale, string> = CATEGORY_SEGMENT;
  return Object.fromEntries(
    ENABLED_LOCALES.map((locale) => [
      locale,
      `/${tools[locale]}/${segment[locale]}/[categorySlug]`,
    ]),
  ) as Record<EnabledLocale, string>;
}

export const routing = defineRouting({
  locales: ENABLED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // Every page lives under /de or /en; "/" redirects by Accept-Language.
  localePrefix: "always",
  /*
   * Internal pathnames (the folders under app/[locale]) to their localized
   * external form. Static segments are localized here; dynamic slugs come
   * from `i18n/slugs.ts` and are resolved by the pages. Requests to an
   * internal or foreign-locale pathname are redirected by the middleware.
   */
  pathnames: {
    "/": "/",
    "/tools": sectionPath("tools"),
    "/tools/[toolSlug]": sectionPath("tools", "/[toolSlug]"),
    "/tools/category/[categorySlug]": categoryPath(),
    // SEO landing page of a tool; the slug is localized by the page itself.
    "/[toolSlug]": "/[toolSlug]",
    "/convert": sectionPath("convert"),
    "/convert/[converterSlug]": sectionPath("convert", "/[converterSlug]"),
    "/css-patterns": sectionPath("cssPatterns"),
    "/css-patterns/[patternSlug]": sectionPath("cssPatterns", "/[patternSlug]"),
    "/gradients": sectionPath("gradients"),
    "/gradients/[gradientSlug]": sectionPath("gradients", "/[gradientSlug]"),
    "/palettes": sectionPath("palettes"),
    "/palettes/[paletteSlug]": sectionPath("palettes", "/[paletteSlug]"),
    "/imprint": sectionPath("imprint"),
    "/privacy": sectionPath("privacy"),
    "/support": sectionPath("support"),
  },
  // hreflang and canonical come from the Metadata API (lib/seo), which knows
  // the localized slugs; the middleware's Link header would not.
  alternateLinks: false,
  // No cookies at all (privacy policy): "/" picks the language from
  // Accept-Language only, every other URL carries its locale anyway.
  localeCookie: false,
});

export type AppLocale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
