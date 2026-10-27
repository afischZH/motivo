"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import { usePathname } from "@/i18n/navigation";
import { routeFromPathname, routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("Layout");
  const current = useLocale();
  // With localized pathnames this is the internal template, e.g. "/tools/[toolSlug]".
  const pathname = usePathname();
  const params = useParams();
  // Pages outside the slug model (the 404 page) switch to the home page.
  const route = routeFromPathname(pathname, params, current) ?? { page: "home" };

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
              href={routePath(route, locale)}
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
