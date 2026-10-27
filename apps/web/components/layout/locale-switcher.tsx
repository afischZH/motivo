"use client";

import { useParams, usePathname } from "next/navigation";

import type { EnabledLocale } from "@/i18n/locales";
import { routeFromPathname, routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";

/** Translated by the server component around it (no message formatter on the client). */
export interface LocaleSwitcherLabels {
  nav: string;
  languages: Readonly<Record<EnabledLocale, string>>;
}

export function LocaleSwitcher({ labels }: { labels: LocaleSwitcherLabels }) {
  // Plain Next hooks: the layout has no NextIntlClientProvider. The pathname
  // is the real localized one; `routeFromPathname` reads the slugs from it.
  const pathname = usePathname();
  const params = useParams();
  const current =
    routing.locales.find((locale) => locale === params.locale) ?? routing.defaultLocale;
  // Pages outside the slug model (the 404 page) switch to the home page.
  const route = routeFromPathname(pathname, params, current) ?? { page: "home" };

  return (
    <nav aria-label={labels.nav}>
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
              {labels.languages[locale]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
