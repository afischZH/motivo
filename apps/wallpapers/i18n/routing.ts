import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // English first: most wallpaper searches are English (plan, decision 2026-11-04).
  locales: ["en", "de"],
  defaultLocale: "en",
  // Every page lives under /en or /de; "/" redirects by Accept-Language.
  localePrefix: "always",
  // No cookies at all, same as Musterli.
  localeCookie: false,
});

export type AppLocale = (typeof routing.locales)[number];
