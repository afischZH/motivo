/**
 * Palette collection: `/de/farbpaletten`, `/en/color-palettes`. Every
 * curated palette as a swatch strip (inline colours, no image) linking to
 * its own page, grouped by mood with jump links. Static, no client JS.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CollectionCard } from "@/components/collections/collection-cards";
import { CollectionTeaser } from "@/components/collections/collection-teaser";
import { teaserPreviews } from "@/lib/collections/teaser";
import { GroupNav } from "@/components/collections/group-nav";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLdScript } from "@/components/seo/json-ld";
import { buttonVariants } from "@/components/ui/button";
import { routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { curatedPalettes, paletteKeys, palettesByGroup } from "@/lib/collections/palettes";
import { collectionText } from "@/lib/collections/text";
import { PALETTE_TOOL } from "@/lib/collections/variants";
import { pageAlternates } from "@/lib/seo/alternates";
import { collectionPage } from "@/lib/seo/json-ld";
import { ogImageUrl, pageOpenGraph } from "@/lib/seo/page-meta";
import { siteUrl } from "@/lib/seo/site-url";

type CollectionPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

const ROUTE = { page: "palettes" } as const;

export async function generateMetadata({ params }: CollectionPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await collectionText(locale);
  const count = curatedPalettes().length;
  const title = t("PaletteCollection.metaTitle", { count });
  const description = t("PaletteCollection.metaDescription", { count });
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
      image: { toolId: PALETTE_TOOL, alt: t("PaletteCollection.ogAlt") },
    }),
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl(PALETTE_TOOL, locale)],
    },
  };
}

export default async function PaletteCollectionPage({ params }: CollectionPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await collectionText(locale);

  const groups = palettesByGroup().map(({ group, items }) => ({
    group,
    name: t(`PaletteCollection.groups.${group}.name`),
    description: t(`PaletteCollection.groups.${group}.description`),
    items: items.map((palette) => ({
      id: palette.id,
      href: routePath({ page: "palette", paletteId: palette.id }, locale),
      name: t(paletteKeys(palette.id).name),
      description: t(paletteKeys(palette.id).description),
      colors: palette.colors,
    })),
  }));
  const base = siteUrl();
  const title = t("PaletteCollection.title");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:py-12">
      <JsonLdScript
        data={collectionPage({
          name: title,
          description: t("PaletteCollection.lead"),
          url: new URL(routePath(ROUTE, locale), base).toString(),
          inLanguage: locale,
          image: ogImageUrl(PALETTE_TOOL, locale),
          items: groups.flatMap((g) =>
            g.items.map((item) => ({ name: item.name, url: new URL(item.href, base).toString() })),
          ),
        })}
      />
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            items={[
              { name: t("Seo.home"), route: { page: "home" } },
              { name: title, route: ROUTE },
            ]}
          />
        }
        eyebrow={t("Layout.collectionEyebrow")}
        title={title}
        lead={t("PaletteCollection.lead")}
      >
        <a
          href={routePath({ page: "tool", toolId: PALETTE_TOOL }, locale)}
          className={buttonVariants({ variant: "outline", className: "rounded-full" })}
        >
          {t("PaletteCollection.openGenerator")}
        </a>
      </PageHeader>

      <GroupNav
        label={t("Collections.groupsLabel")}
        groups={groups.map((g) => ({
          id: g.group,
          name: g.name,
          count: t("PaletteCollection.count", { count: g.items.length }),
        }))}
      />

      {groups.map((g) => (
        <section
          key={g.group}
          id={`group-${g.group}`}
          aria-labelledby={`group-${g.group}-heading`}
          className="flex scroll-mt-20 flex-col gap-4"
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

      <CollectionTeaser kind="gradients" locale={locale} previews={teaserPreviews("gradients")} />
    </div>
  );
}
