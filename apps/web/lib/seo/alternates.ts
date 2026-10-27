import type { Metadata } from "next";

import { DEFAULT_LOCALE, ENABLED_LOCALES, type EnabledLocale } from "@/i18n/locales";
import { localizedPaths, type AppRoute } from "@/i18n/paths";

import { siteUrl } from "./site-url";

/**
 * Canonical URL plus `hreflang` alternates for every enabled locale and
 * `x-default`. The home page's x-default is the site root, which picks the
 * language by Accept-Language; every other page points x-default at the
 * default locale.
 */
export function pageAlternates(
  route: AppRoute,
  locale: EnabledLocale,
  base: URL = siteUrl(),
): NonNullable<Metadata["alternates"]> {
  const paths = localizedPaths(route);
  const absolute = (path: string) => new URL(path, base).toString();
  const languages: Record<string, string> = {};
  for (const l of ENABLED_LOCALES) languages[l] = absolute(paths[l]);
  languages["x-default"] = absolute(route.page === "home" ? "/" : paths[DEFAULT_LOCALE]);

  return { canonical: absolute(paths[locale]), languages };
}
