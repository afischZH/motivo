/**
 * Category page: `/de/tools/kategorie/muster`, `/en/tools/category/patterns`.
 * One page per category that has at least one registered tool; lists every
 * tool that names the category (primary or not). Static, no client JS.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CollectionTeaser } from "@/components/collections/collection-teaser";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { ToolCard } from "@/components/seo/tool-card";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { categoryIdFromSlug, categorySlug } from "@/i18n/slugs";
import { categoryTools, populatedCategories } from "@/lib/catalogue";
import { collectionsFor } from "@/lib/collections";
import { pageAlternates } from "@/lib/seo/alternates";
import { pageOpenGraph } from "@/lib/seo/page-meta";

type CategoryPageProps = Readonly<{
  params: Promise<{ locale: string; categorySlug: string }>;
}>;

export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as EnabledLocale;
  return populatedCategories().map((category) => ({
    categorySlug: categorySlug(category, locale),
  }));
}

async function resolve(params: CategoryPageProps["params"]) {
  const { locale, categorySlug: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return undefined;
  const category = categoryIdFromSlug(slug, locale);
  return category && populatedCategories().includes(category) ? { locale, category } : undefined;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { locale, category } = resolved;
  const t = await getTranslations({ locale });
  const name = t(`Categories.${category}.name`);
  const title = t("CategoryPage.metaTitle", { category: name });
  const description = t(`Categories.${category}.description`);
  const route = { page: "category", category } as const;
  return {
    title,
    description,
    alternates: pageAlternates(route, locale),
    openGraph: pageOpenGraph({ route, locale, siteName: t("Layout.brand"), title, description }),
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { locale, category } = resolved;
  setRequestLocale(locale);
  const t = await getTranslations();
  const name = t(`Categories.${category}.name`);
  const others = populatedCategories().filter((c) => c !== category);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: t("ToolsIndex.title"), route: { page: "tools" } },
            { name, route: { page: "category", category } },
          ]}
        />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{name}</h1>
        <p className="max-w-prose text-muted-foreground">
          {t(`Categories.${category}.description`)}
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categoryTools(category).map((tool) => (
          <li key={tool.id}>
            <ToolCard tool={tool} locale={locale} headingLevel={2} />
          </li>
        ))}
      </ul>

      {collectionsFor([category]).map((kind) => (
        <CollectionTeaser key={kind} kind={kind} locale={locale} />
      ))}

      {others.length > 0 && (
        <nav aria-labelledby="other-categories" className="flex flex-col gap-3">
          <h2 id="other-categories" className="text-xl font-semibold tracking-tight">
            {t("CategoryPage.otherCategories")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {others.map((other) => (
              <li key={other}>
                <Link
                  href={routeHref({ page: "category", category: other }, locale)}
                  className="inline-flex rounded-control border border-border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  {t(`Categories.${other}.name`)}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/tools"
                className="inline-flex rounded-control border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                {t("CategoryPage.backToCatalogue")}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
