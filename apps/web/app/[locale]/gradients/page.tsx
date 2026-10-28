/**
 * Gradient collection: `/de/farbverlaeufe`, `/en/gradients`. Every curated
 * gradient as a live CSS thumbnail (inline style, no image) linking to its
 * own page, grouped by mood with jump links. Static, no client JS.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CollectionCard } from "@/components/collections/collection-cards";
import { CollectionTeaser } from "@/components/collections/collection-teaser";
import { teaserPreviews } from "@/lib/collections/teaser";
import { GroupNav } from "@/components/collections/group-nav";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLdScript } from "@/components/seo/json-ld";
import { buttonVariants } from "@/components/ui/button";
import { routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { curatedGradients, gradientKeys, gradientsByGroup } from "@/lib/collections/gradients";
import { collectionText } from "@/lib/collections/text";
import { CSS_GRADIENT_TOOL, cssGradientCode, gradientDesign } from "@/lib/collections/variants";
import { pageAlternates } from "@/lib/seo/alternates";
import { collectionPage } from "@/lib/seo/json-ld";
import { ogImageUrl, pageOpenGraph } from "@/lib/seo/page-meta";
import { siteUrl } from "@/lib/seo/site-url";

type CollectionPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

const ROUTE = { page: "gradients" } as const;

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await collectionText(locale);
  const count = curatedGradients().length;
  const title = t("GradientCollection.metaTitle", { count });
  const description = t("GradientCollection.metaDescription", { count });
  return {
    title,
    description,
    alternates: pageAlternates(ROUTE, locale),
    openGraph: pageOpenGraph({
      route: ROUTE,
      locale,
      siteName: t("Layout.brand"),
      title,
      description,
      image: { toolId: CSS_GRADIENT_TOOL, alt: t("GradientCollection.ogAlt") },
    }),
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl(CSS_GRADIENT_TOOL, locale)],
    },
  };
}

export default async function GradientCollectionPage({ params }: CollectionPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await collectionText(locale);

  const groups = gradientsByGroup().map(({ group, items }) => ({
    group,
    name: t(`GradientCollection.groups.${group}.name`),
    description: t(`GradientCollection.groups.${group}.description`),
    items: items.map((gradient) => ({
      id: gradient.id,
      href: routePath({ page: "gradient", gradientId: gradient.id }, locale),
      name: t(gradientKeys(gradient.id).name),
      description: t(gradientKeys(gradient.id).description),
      colors: gradient.colors,
      style: cssGradientCode(gradientDesign(gradient)).style,
    })),
  }));
  const base = siteUrl();
  const title = t("GradientCollection.title");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:py-12">
      <JsonLdScript
        data={collectionPage({
          name: title,
          description: t("GradientCollection.lead"),
          url: new URL(routePath(ROUTE, locale), base).toString(),
          inLanguage: locale,
          image: ogImageUrl(CSS_GRADIENT_TOOL, locale),
          items: groups.flatMap((g) =>
            g.items.map((item) => ({ name: item.name, url: new URL(item.href, base).toString() })),
          ),
        })}
      />
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: title, route: ROUTE },
          ]}
        />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="max-w-prose text-muted-foreground">{t("GradientCollection.lead")}</p>
        <a
          href={routePath({ page: "tool", toolId: CSS_GRADIENT_TOOL }, locale)}
          className={buttonVariants({ variant: "outline", className: "self-start" })}
        >
          {t("GradientCollection.openGenerator")}
        </a>
      </div>

      <GroupNav
        label={t("Collections.groupsLabel")}
        groups={groups.map((g) => ({
          id: g.group,
          name: g.name,
          count: t("GradientCollection.count", { count: g.items.length }),
        }))}
      />

      {groups.map((g) => (
        <section
          key={g.group}
          id={`group-${g.group}`}
          aria-labelledby={`group-${g.group}-heading`}
          className="flex scroll-mt-6 flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 id={`group-${g.group}-heading`} className="text-xl font-semibold tracking-tight">
              {g.name}
            </h2>
            <p className="text-muted-foreground">{g.description}</p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((item) => (
              <li key={item.id}>
                <CollectionCard item={item} headingLevel={3} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <CollectionTeaser kind="palettes" locale={locale} previews={teaserPreviews("palettes")} />
    </div>
  );
}
