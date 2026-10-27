import type { Metadata } from "next";

import { ENABLED_LOCALES, type EnabledLocale } from "@/i18n/locales";
import { localizedPaths, type AppRoute } from "@/i18n/paths";

import { siteUrl } from "./site-url";

/** Locale of the `x-default` alternate. */
export const X_DEFAULT_LOCALE = "en" satisfies EnabledLocale;

/**
 * Canonical URL plus `hreflang` alternates for every enabled locale and
 * `x-default`. x-default always points at the English page: English is the
 * international default for visitors whose language we do not offer (the
 * routing default stays German for Accept-Language matching).
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
  languages["x-default"] = absolute(paths[X_DEFAULT_LOCALE]);

  return { canonical: absolute(paths[locale]), languages };
}
