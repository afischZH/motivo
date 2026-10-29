/**
 * CSS pattern library: `/de/css-muster`, `/en/css-patterns`. Every library
 * pattern as a live CSS thumbnail (inline style, no image) linking to its own
 * page, with category filter chips. Static; the filter is the only client JS.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import {
  PatternBrowser,
  type PatternFilterOption,
} from "@/components/css-patterns/pattern-browser";
import type { PatternCardData } from "@/components/css-patterns/pattern-card";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import type { EnabledLocale } from "@/i18n/locales";
import { routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import {
  PATTERN_TOOL_ID,
  libraryPatterns,
  patternKeys,
  patternShowcase,
  patternsByCategory,
} from "@/lib/css-patterns";
import { pageAlternates } from "@/lib/seo/alternates";
import { pageOpenGraph } from "@/lib/seo/page-meta";

type LibraryPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

/** Translator for keys built from library ids. */
async function text(locale: EnabledLocale) {
  const t = await getTranslations({ locale });
  return t as unknown as (key: string, values?: Record<string, string | number>) => string;
}

export async function generateMetadata({ params }: LibraryPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await text(locale);
  const count = libraryPatterns().length;
  const title = t("PatternLibrary.metaTitle", { count });
  const description = t("PatternLibrary.metaDescription", { count });
  const route = { page: "patterns" } as const;
  return {
    title,
    description,
    alternates: pageAlternates(route, locale),
    openGraph: pageOpenGraph({
      route,
      locale,
      siteName: t("Layout.brand"),
      title,
      description,
      image: { toolId: PATTERN_TOOL_ID, alt: t("PatternLibrary.ogAlt") },
    }),
  };
}

export default async function PatternLibraryPage({ params }: LibraryPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await text(locale);

  const patterns: PatternCardData[] = libraryPatterns().map((spec) => {
    const keys = patternKeys(spec);
    return {
      id: spec.id,
      category: spec.category,
      name: t(keys.name),
      description: t(keys.description),
      categoryLabel: t(keys.category),
      style: patternShowcase(spec).style,
    };
  });
  const filters: PatternFilterOption[] = [
    {
      id: "all",
      label: t("PatternLibrary.all"),
      count: patterns.length,
      countLabel: t("PatternLibrary.count", { count: patterns.length }),
    },
    ...patternsByCategory().map(({ category, patterns: list }) => ({
      id: category,
      label: t(`tools.${PATTERN_TOOL_ID}.categories.${category}`),
      count: list.length,
      countLabel: t("PatternLibrary.count", { count: list.length }),
    })),
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:py-12">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            items={[
              { name: t("Seo.home"), route: { page: "home" } },
              { name: t("PatternLibrary.title"), route: { page: "patterns" } },
            ]}
          />
        }
        eyebrow={t("Layout.collectionEyebrow")}
        title={t("PatternLibrary.title")}
        lead={t("PatternLibrary.lead")}
      >
        <a
          href={routePath({ page: "tool", toolId: PATTERN_TOOL_ID }, locale)}
          className={buttonVariants({ variant: "outline", className: "rounded-full" })}
        >
          {t("PatternLibrary.openGenerator")}
        </a>
      </PageHeader>

      <PatternBrowser
        patterns={patterns}
        filters={filters}
        filterLabel={t("PatternLibrary.filterLabel")}
        locale={locale}
      />
    </div>
  );
}
