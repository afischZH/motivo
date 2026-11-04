import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { devicePath, deviceStaticParams, SITE_URL } from "@/lib/device-pages";

export const dynamic = "force-static";

/** Home and every device page in every language, with hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = (path: (locale: string) => string) =>
    Object.fromEntries(routing.locales.map((locale) => [locale, `${SITE_URL}${path(locale)}`]));

  const home = routing.locales.map((locale) => ({
    url: `${SITE_URL}/${locale}`,
    alternates: { languages: languages((code) => `/${code}`) },
  }));
  const devices = deviceStaticParams().map(({ locale, id }) => ({
    url: `${SITE_URL}${devicePath(locale, id)}`,
    alternates: { languages: languages((code) => devicePath(code, id)) },
  }));
  return [...home, ...devices];
}
