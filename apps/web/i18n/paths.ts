/**
 * Page model on top of the slug map: one `AppRoute` describes a page
 * independent of the language, and these helpers turn it into the localized
 * href (for `Link`), path, or the set of paths in every enabled locale (for
 * hreflang, sitemap and the language switcher).
 */
import type { ToolCategory } from "@motivo/tool-registry";

import { isConverterId, type ConverterId } from "@/lib/convert/ids";

import { ENABLED_LOCALES, type AnyLocale, type EnabledLocale } from "./locales";
import { routing } from "./routing";
import {
  categoryIdFromSlug,
  categorySlug,
  collectionItemFromSlug,
  collectionItemSlug,
  converterIdFromSlug,
  converterSlug,
  isCategorySegment,
  patternIdFromSlug,
  patternSlug,
  sectionFromAnySlug,
  toolIdFromSlug,
  toolSlug,
} from "./slugs";

export type AppRoute =
  | { page: "home" }
  | { page: "tools" }
  | { page: "category"; category: ToolCategory }
  | { page: "landing"; toolId: string }
  | { page: "tool"; toolId: string }
  | { page: "convert" }
  | { page: "converter"; converterId: ConverterId }
  | { page: "patterns" }
  | { page: "pattern"; patternId: string }
  | { page: "gradients" }
  | { page: "gradient"; gradientId: string }
  | { page: "palettes" }
  | { page: "palette"; paletteId: string }
  | { page: "myDesigns" }
  | { page: "imprint" }
  | { page: "privacy" }
  | { page: "support" };

/** Href for next-intl's `Link`, `redirect` and `getPathname` in a locale. */
export function routeHref(route: AppRoute, locale: AnyLocale) {
  switch (route.page) {
    case "home":
      return "/" as const;
    case "tools":
      return "/tools" as const;
    case "convert":
      return "/convert" as const;
    case "imprint":
      return "/imprint" as const;
    case "privacy":
      return "/privacy" as const;
    case "support":
      return "/support" as const;
    case "category":
      return {
        pathname: "/tools/category/[categorySlug]" as const,
        params: { categorySlug: categorySlug(route.category, locale) },
      };
    case "landing":
      return {
        pathname: "/[toolSlug]" as const,
        params: { toolSlug: toolSlug(route.toolId, locale) },
      };
    case "tool":
      return {
        pathname: "/tools/[toolSlug]" as const,
        params: { toolSlug: toolSlug(route.toolId, locale) },
      };
    case "converter":
      return {
        pathname: "/convert/[converterSlug]" as const,
        params: { converterSlug: converterSlug(route.converterId, locale) },
      };
    case "patterns":
      return "/css-patterns" as const;
    case "pattern":
      return {
        pathname: "/css-patterns/[patternSlug]" as const,
        params: { patternSlug: patternSlug(route.patternId, locale) },
      };
    case "gradients":
      return "/gradients" as const;
    case "gradient":
      return {
        pathname: "/gradients/[gradientSlug]" as const,
        params: { gradientSlug: collectionItemSlug("gradients", route.gradientId, locale) },
      };
    case "palettes":
      return "/palettes" as const;
    case "myDesigns":
      return "/my-designs" as const;
    case "palette":
      return {
        pathname: "/palettes/[paletteSlug]" as const,
        params: { paletteSlug: collectionItemSlug("palettes", route.paletteId, locale) },
      };
  }
}

/** Locale-prefixed path, e.g. `/de/konverter/svg-zu-css`. */
export function routePath(route: AppRoute, locale: EnabledLocale): string {
  return compilePath(routeHref(route, locale), locale);
}

/**
 * next-intl's `getPathname` for the hrefs `routeHref` builds (no query,
 * `localePrefix: "always"`), without next-intl's navigation runtime: the
 * language switch runs in the browser, and the navigation helpers would pull
 * next-intl's client (with its message formatter, about 19 KB gzip) into
 * every page; `Link` in `navigation.tsx` uses it on the server for the same
 * reason. `paths.test.ts` checks both agree for every route.
 */
export type RouteHref = ReturnType<typeof routeHref>;

export function compilePath(href: RouteHref, locale: EnabledLocale): string {
  const { pathname, params } = typeof href === "string" ? { pathname: href, params: {} } : href;
  const localized: string | Readonly<Record<EnabledLocale, string>> = routing.pathnames[pathname];
  const template = typeof localized === "string" ? localized : localized[locale];
  const path = template.replace(/\[(\w+)\]/g, (_, key: string) =>
    encodeURIComponent((params as Readonly<Record<string, string>>)[key] ?? ""),
  );
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** The page's path in every enabled locale. */
export function localizedPaths(route: AppRoute): Record<EnabledLocale, string> {
  return Object.fromEntries(
    ENABLED_LOCALES.map((locale) => [locale, routePath(route, locale)]),
  ) as Record<EnabledLocale, string>;
}

/** Landing page paths of a tool in every enabled locale. */
export function toolLandingPaths(toolId: string): Record<EnabledLocale, string> {
  return localizedPaths({ page: "landing", toolId });
}

/** Editor paths of a tool in every enabled locale (sitemap, catalogue). */
export function toolEditorPaths(toolId: string): Record<EnabledLocale, string> {
  return localizedPaths({ page: "tool", toolId });
}

/** Slugs of a tool in every enabled locale, e.g. for the SEO landing pages. */
export function toolSlugs(toolId: string): Record<EnabledLocale, string> {
  return Object.fromEntries(
    ENABLED_LOCALES.map((locale) => [locale, toolSlug(toolId, locale)]),
  ) as Record<EnabledLocale, string>;
}

/**
 * Rebuilds the page from a pathname and the raw route params (as next-intl's
 * `usePathname` and `useParams` return them). The pathname may be the internal
 * template (`/convert/[converterSlug]`), the internal path a middleware
 * rewrite produced (`/convert/svg-zu-css`, seen while prerendering) or the
 * external one (`/konverter/svg-zu-css`), with or without the locale prefix.
 * Undefined for pages outside the slug model, such as the 404 page.
 */
export function routeFromPathname(
  pathname: string,
  params: Readonly<Record<string, string | string[] | undefined>>,
  locale: AnyLocale,
): AppRoute | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === locale) segments.shift();
  if (segments.length === 0) return { page: "home" };
  if (segments.length > 3) return undefined;

  const first = segments[0] ?? "";
  const section = sectionFromAnySlug(first);
  const param = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : segments[segments.length - 1];

  if (segments.length === 3) {
    if (section !== "tools" || !isCategorySegment(segments[1] ?? "")) return undefined;
    const slug = param(params.categorySlug);
    const category = slug ? categoryIdFromSlug(slug, locale) : undefined;
    return category ? { page: "category", category } : undefined;
  }
  if (!section && segments.length === 1) {
    // Top-level segment: the SEO landing page of a tool (template or real slug).
    const slug = param(params.toolSlug);
    const toolId = slug ? toolIdFromSlug(slug, locale) : undefined;
    return toolId ? { page: "landing", toolId } : undefined;
  }

  if (section === "tools") {
    if (segments.length === 1) return { page: "tools" };
    const slug = param(params.toolSlug);
    const toolId = slug ? toolIdFromSlug(slug, locale) : undefined;
    return toolId ? { page: "tool", toolId } : undefined;
  }
  if (section === "cssPatterns") {
    if (segments.length === 1) return { page: "patterns" };
    const slug = param(params.patternSlug);
    const patternId = slug ? patternIdFromSlug(slug, locale) : undefined;
    return patternId ? { page: "pattern", patternId } : undefined;
  }
  if (section === "gradients") {
    if (segments.length === 1) return { page: "gradients" };
    const slug = param(params.gradientSlug);
    const gradientId = slug ? collectionItemFromSlug("gradients", slug, locale) : undefined;
    return gradientId && segments.length === 2 ? { page: "gradient", gradientId } : undefined;
  }
  if (section === "palettes") {
    if (segments.length === 1) return { page: "palettes" };
    const slug = param(params.paletteSlug);
    const paletteId = slug ? collectionItemFromSlug("palettes", slug, locale) : undefined;
    return paletteId && segments.length === 2 ? { page: "palette", paletteId } : undefined;
  }
  if (section === "myDesigns") {
    return segments.length === 1 ? { page: "myDesigns" } : undefined;
  }
  if (section === "imprint" || section === "privacy" || section === "support") {
    return segments.length === 1 ? { page: section } : undefined;
  }
  if (section === "convert") {
    if (segments.length === 1) return { page: "convert" };
    const slug = param(params.converterSlug);
    const id = slug ? converterIdFromSlug(slug, locale) : undefined;
    return id && isConverterId(id) ? { page: "converter", converterId: id } : undefined;
  }
  return undefined;
}
