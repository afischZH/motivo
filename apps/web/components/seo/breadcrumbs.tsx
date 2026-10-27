import { getTranslations } from "next-intl/server";

import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref, routePath, type AppRoute } from "@/i18n/paths";
import { breadcrumbList, type Crumb } from "@/lib/seo/json-ld";
import { siteUrl } from "@/lib/seo/site-url";

import { JsonLdScript } from "./json-ld";

export interface BreadcrumbItem {
  name: string;
  route: AppRoute;
}

/**
 * Visible breadcrumb trail plus its `BreadcrumbList` JSON-LD. The last item
 * is the current page and is not a link.
 */
export async function Breadcrumbs({
  items,
  locale,
}: {
  items: readonly BreadcrumbItem[];
  locale: EnabledLocale;
}) {
  const t = await getTranslations({ locale, namespace: "Seo" });
  const base = siteUrl();
  const crumbs: Crumb[] = items.map((item) => ({
    name: item.name,
    url: new URL(routePath(item.route, locale), base).toString(),
  }));

  return (
    <nav aria-label={t("breadcrumbLabel")}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="text-foreground">
                  {item.name}
                </span>
              ) : (
                <>
                  <Link
                    href={routeHref(item.route, locale)}
                    className="rounded-control text-link underline-offset-4 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span aria-hidden="true">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <JsonLdScript data={breadcrumbList(crumbs)} />
    </nav>
  );
}
