/**
 * Catalogue: every registered tool, grouped by its primary category, plus
 * the converters. Built entirely from the registry and the slug maps, so new
 * tools appear here without changes to this page. Every card is in the
 * server HTML; the only client code is the instant search filter.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CatalogueFilter, type CatalogueSection } from "@/components/catalogue/catalogue-filter";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { ToolCard } from "@/components/seo/tool-card";
import { Link } from "@/i18n/navigation";
import { routeHref } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { catalogueGroups } from "@/lib/catalogue";
import { CONVERTER_IDS } from "@/lib/convert/ids";
import { pageAlternates } from "@/lib/seo/alternates";
import { pageOpenGraph } from "@/lib/seo/page-meta";
import { toolKeys } from "@/lib/seo/tool-content";

type ToolsPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: ToolsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  const title = t("ToolsIndex.metaTitle");
  const description = t("ToolsIndex.metaDescription");
  const route = { page: "tools" } as const;
  return {
    title,
    description,
    alternates: pageAlternates(route, locale),
    openGraph: pageOpenGraph({ route, locale, siteName: t("Layout.brand"), title, description }),
  };
}

export default async function ToolsPage({ params }: ToolsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const groups = catalogueGroups();

  // Tool texts are keyed by registry id, which the typed keys cannot know.
  const text = t as unknown as (key: string) => string;
  const chip =
    "inline-flex shrink-0 rounded-control border border-border px-3 py-1.5 text-sm whitespace-nowrap hover:bg-accent";

  const sections: CatalogueSection[] = [
    ...groups.map(({ category, tools }) => ({
      id: category,
      listClassName: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
      header: (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id={`${category}-heading`} className="text-xl font-semibold tracking-tight">
              {t(`Categories.${category}.name`)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({t("Catalogue.toolCount", { count: tools.length })})
              </span>
            </h2>
            <Link
              href={routeHref({ page: "category", category }, locale)}
              className="rounded-control text-sm text-link underline-offset-4 hover:underline"
            >
              {t("Catalogue.showCategory")}
              <span className="sr-only">: {t(`Categories.${category}.name`)}</span>
            </Link>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t(`Categories.${category}.description`)}
          </p>
        </div>
      ),
      items: tools.map((tool) => {
        const keys = toolKeys(tool.id);
        return {
          key: tool.id,
          terms: [
            text(keys.name),
            text(keys.description),
            ...tool.category.map((c) => t(`Categories.${c}.name`)),
          ].join(" "),
          node: <ToolCard tool={tool} locale={locale} headingLevel={3} />,
        };
      }),
    })),
    {
      id: "converters",
      listClassName: "flex flex-wrap gap-2",
      header: (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="converters-heading" className="text-xl font-semibold tracking-tight">
              {t("Categories.converters.name")}
            </h2>
            <Link
              href="/convert"
              className="rounded-control text-sm text-link underline-offset-4 hover:underline"
            >
              {t("Catalogue.allConverters")}
            </Link>
          </div>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("Catalogue.convertersLead")}
          </p>
        </div>
      ),
      items: CONVERTER_IDS.map((id) => ({
        key: id,
        terms: `${t(`Converters.items.${id}.name`)} ${t("Categories.converters.name")}`,
        node: (
          <Link
            href={routeHref({ page: "converter", converterId: id }, locale)}
            className="inline-flex rounded-control border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {t(`Converters.items.${id}.name`)}
          </Link>
        ),
      })),
    },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: t("ToolsIndex.title"), route: { page: "tools" } },
          ]}
        />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("ToolsIndex.title")}
        </h1>
        <p className="max-w-prose text-muted-foreground">{t("ToolsIndex.lead")}</p>
      </div>

      <CatalogueFilter
        sections={sections}
        labels={{
          search: t("Catalogue.searchLabel"),
          placeholder: t("Catalogue.searchPlaceholder"),
          shortcut: t("Catalogue.searchShortcut"),
          resultsOne: t("Catalogue.resultsOne"),
          resultsOther: t.raw("Catalogue.resultsOther") as string,
          noResults: t.raw("Catalogue.noResults") as string,
          noResultsHint: t("Catalogue.noResultsHint"),
          clear: t("Catalogue.clearSearch"),
        }}
        nav={
          <nav aria-label={t("Catalogue.categoryNav")}>
            <ul className="flex gap-2 sm:flex-wrap">
              {groups.map(({ category }) => (
                <li key={category}>
                  <a href={`#${category}`} className={chip}>
                    {t(`Categories.${category}.name`)}
                  </a>
                </li>
              ))}
              <li>
                <a href="#converters" className={chip}>
                  {t("Categories.converters.name")}
                </a>
              </li>
            </ul>
          </nav>
        }
      />
    </div>
  );
}
