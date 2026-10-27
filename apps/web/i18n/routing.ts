import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "en"],
  defaultLocale: "de",
  // Every page lives under /de or /en; "/" redirects by Accept-Language.
  localePrefix: "always",
  // hreflang alternates come with localized slugs in M2.
  alternateLinks: false,
});

export type AppLocale = (typeof routing.locales)[number];
