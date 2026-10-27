/**
 * Catalogue: every registered tool, grouped by its primary category, plus
 * the converters. Built entirely from the registry and the slug maps, so new
 * tools appear here without changes to this page. Static, no client JS.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { ToolCard } from "@/components/seo/tool-card";
import { Link } from "@/i18n/navigation";
import { routeHref } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { catalogueGroups } from "@/lib/catalogue";
import { CONVERTER_IDS } from "@/lib/convert/ids";
import { pageAlternates } from "@/lib/seo/alternates";
import { pageOpenGraph } from "@/lib/seo/page-meta";

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
        <nav aria-label={t("Catalogue.categoryNav")}>
          <ul className="flex flex-wrap gap-2">
            {groups.map(({ category }) => (
              <li key={category}>
                <a
                  href={`#${category}`}
                  className="inline-flex rounded-control border border-border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  {t(`Categories.${category}.name`)}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#converters"
                className="inline-flex rounded-control border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                {t("Categories.converters.name")}
              </a>
            </li>
          </ul>
        </nav>
      </div>

      {groups.map(({ category, tools }) => (
        <section
          key={category}
          id={category}
          aria-labelledby={`${category}-heading`}
          className="flex scroll-mt-4 flex-col gap-4"
        >
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
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <li key={tool.id}>
                <ToolCard tool={tool} locale={locale} headingLevel={3} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section
        id="converters"
        aria-labelledby="converters-heading"
        className="flex scroll-mt-4 flex-col gap-4"
      >
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
        <p className="max-w-prose text-sm text-muted-foreground">{t("Catalogue.convertersLead")}</p>
        <ul className="flex flex-wrap gap-2">
          {CONVERTER_IDS.map((id) => (
            <li key={id}>
              <Link
                href={routeHref({ page: "converter", converterId: id }, locale)}
                className="inline-flex rounded-control border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                {t(`Converters.items.${id}.name`)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
