/**
 * Page model on top of the slug map: one `AppRoute` describes a page
 * independent of the language, and these helpers turn it into the localized
 * href (for `Link`), path, or the set of paths in every enabled locale (for
 * hreflang, sitemap and the language switcher).
 */
import { isConverterId, type ConverterId } from "@/lib/convert/ids";

import { ENABLED_LOCALES, type AnyLocale, type EnabledLocale } from "./locales";
import { getPathname } from "./navigation";
import {
  converterIdFromSlug,
  converterSlug,
  sectionFromAnySlug,
  toolIdFromSlug,
  toolSlug,
} from "./slugs";

export type AppRoute =
  | { page: "home" }
  | { page: "tools" }
  | { page: "tool"; toolId: string }
  | { page: "convert" }
  | { page: "converter"; converterId: ConverterId };

/** Href for next-intl's `Link`, `redirect` and `getPathname` in a locale. */
export function routeHref(route: AppRoute, locale: AnyLocale) {
  switch (route.page) {
    case "home":
      return "/" as const;
    case "tools":
      return "/tools" as const;
    case "convert":
      return "/convert" as const;
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
  }
}

/** Locale-prefixed path, e.g. `/de/konverter/svg-zu-css`. */
export function routePath(route: AppRoute, locale: EnabledLocale): string {
  return getPathname({ href: routeHref(route, locale), locale });
}

/** The page's path in every enabled locale. */
export function localizedPaths(route: AppRoute): Record<EnabledLocale, string> {
  return Object.fromEntries(
    ENABLED_LOCALES.map((locale) => [locale, routePath(route, locale)]),
  ) as Record<EnabledLocale, string>;
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
  if (segments.length > 2) return undefined;

  const section = sectionFromAnySlug(segments[0] ?? "");
  const param = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : segments[1];

  if (section === "tools") {
    if (segments.length === 1) return { page: "tools" };
    const slug = param(params.toolSlug);
    const toolId = slug ? toolIdFromSlug(slug, locale) : undefined;
    return toolId ? { page: "tool", toolId } : undefined;
  }
  if (section === "convert") {
    if (segments.length === 1) return { page: "convert" };
    const slug = param(params.converterSlug);
    const id = slug ? converterIdFromSlug(slug, locale) : undefined;
    return id && isConverterId(id) ? { page: "converter", converterId: id } : undefined;
  }
  return undefined;
}
