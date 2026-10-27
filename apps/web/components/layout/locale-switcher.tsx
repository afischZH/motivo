"use client";

import { useLocale, useTranslations } from "next-intl";

import { getPathname, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("Layout");
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("languageNav")}>
      <ul className="flex gap-3">
        {routing.locales.map((locale) => (
          <li key={locale}>
            {/*
              A full page load on purpose: switching the locale swaps the root
              layout, and a client-side re-render would drop the theme class
              set by the inline script before hydration.
            */}
            <a
              href={getPathname({ href: pathname, locale })}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "true" : undefined}
              className="rounded-control text-muted-foreground underline-offset-4 hover:text-foreground hover:underline aria-[current=true]:font-medium aria-[current=true]:text-foreground"
            >
              {t(`languages.${locale}`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
