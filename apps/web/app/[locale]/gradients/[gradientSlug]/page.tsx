/**
 * One page per curated gradient: `/de/farbverlaeufe/alpengluehen`,
 * `/en/gradients/alpenglow`. Statically generated for every gradient in
 * every locale: a live CSS preview, the colour stops with copyable values,
 * CSS and Tailwind code, the same colours in the Mesh, Blurry and Striped
 * tools (share links `#d=`), the colour tools, and similar gradients.
 */
import { registry } from "@motivo/tool-registry";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CollectionCard, VariantCard } from "@/components/collections/collection-cards";
import { SwatchList } from "@/components/collections/swatch-list";
import { CodeBlock } from "@/components/css-patterns/code-block";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref, routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { collectionItemFromSlug, collectionItemSlug } from "@/i18n/slugs";
import {
  curatedGradients,
  findGradient,
  gradientKeys,
  relatedGradients,
} from "@/lib/collections/gradients";
import { variantEditorHref } from "@/lib/collections/links";
import { collectionOgKey } from "@/lib/collections/og";
import { codeText, collectionText, swatchText } from "@/lib/collections/text";
import { cssGradientCode, gradientDesign, gradientVariants } from "@/lib/collections/variants";
import { pageAlternates } from "@/lib/seo/alternates";
import { ogImageUrl, pageOpenGraph } from "@/lib/seo/page-meta";

type GradientPageProps = Readonly<{ params: Promise<{ locale: string; gradientSlug: string }> }>;

// Only curated gradients under this locale's slug; foreign slugs and ids are
// redirected by the proxy, everything else is a 404.
export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as EnabledLocale;
  return curatedGradients().map((g) => ({
    gradientSlug: collectionItemSlug("gradients", g.id, locale),
  }));
}

async function resolve(params: GradientPageProps["params"]) {
  const { locale, gradientSlug: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return undefined;
  const gradient = findGradient(collectionItemFromSlug("gradients", slug, locale) ?? "");
  return gradient ? { locale, gradient } : undefined;
}

export async function generateMetadata({ params }: GradientPageProps): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { locale, gradient } = resolved;
  const t = await collectionText(locale);
  const keys = gradientKeys(gradient.id);
  const name = t(keys.name);
  const title = t("GradientPage.metaTitle", { gradient: name });
  const description = t("GradientPage.metaDescription", { description: t(keys.description) });
  const route = { page: "gradient", gradientId: gradient.id } as const;
  const ogKey = collectionOgKey("gradients", gradient.id);
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
      image: { toolId: ogKey, alt: t("GradientPage.ogAlt", { gradient: name }) },
    }),
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl(ogKey, locale)],
    },
  };
}

export default async function GradientPage({ params }: GradientPageProps) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { locale, gradient } = resolved;
  setRequestLocale(locale);
  const t = await collectionText(locale);

  const keys = gradientKeys(gradient.id);
  const name = t(keys.name);
  const code = cssGradientCode(gradientDesign(gradient));
  const variants = gradientVariants(gradient);
  const [home, ...others] = variants.gradient;
  const toolName = (id: string) => t(`tools.${id}.name`);
  const related = relatedGradients(gradient).map((other) => ({
    id: other.id,
    href: routePath({ page: "gradient", gradientId: other.id }, locale),
    name: t(gradientKeys(other.id).name),
    description: t(gradientKeys(other.id).description),
    colors: other.colors,
    style: cssGradientCode(gradientDesign(other)).style,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: t("GradientCollection.title"), route: { page: "gradients" } },
            { name, route: { page: "gradient", gradientId: gradient.id } },
          ]}
        />

        <header className="grid items-center gap-8 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-5">
            <p className="text-sm text-muted-foreground">
              {t(`GradientCollection.groups.${gradient.group}.name`)}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("GradientPage.heading", { gradient: name })}
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">{t(keys.description)}</p>
            {home && (
              // Full page load: the editor reads the design from the #d= hash on start.
              <a href={variantEditorHref(home, locale)} className={buttonVariants({ size: "lg" })}>
                {t("GradientPage.openEditor")}
              </a>
            )}
            <p className="text-sm text-muted-foreground">{t("GradientPage.openEditorHint")}</p>
          </div>
          <div
            role="img"
            aria-label={t("GradientPage.previewLabel", { gradient: name })}
            className="h-72 w-full rounded-card border border-border shadow-sm sm:h-96"
            style={code.style}
          />
        </header>
      </div>

      <section aria-labelledby="colors-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="colors-heading" className="text-xl font-semibold tracking-tight">
            {t("GradientPage.colorsHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("GradientPage.colorsLead")}</p>
        </div>
        <SwatchList colors={gradient.colors} text={swatchText(t)} />
      </section>

      <section aria-labelledby="code-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="code-heading" className="text-xl font-semibold tracking-tight">
            {t("GradientPage.codeHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("GradientPage.cssLead")}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <CodeBlock code={code.css} {...codeText(t, t("GradientPage.cssLabel"))} />
          <CodeBlock code={code.tailwind} {...codeText(t, t("GradientPage.tailwindLabel"))} />
        </div>
      </section>

      <section aria-labelledby="variants-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="variants-heading" className="text-xl font-semibold tracking-tight">
            {t("GradientPage.variantsHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("GradientPage.variantsLead")}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {others.map((variant) => {
            const tool = registry.get(variant.toolId);
            if (!tool) return null;
            return (
              <li key={variant.toolId}>
                <VariantCard
                  variant={variant}
                  tool={tool}
                  href={variantEditorHref(variant, locale)}
                  title={t("Collections.openIn", { tool: toolName(variant.toolId) })}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="color-tools-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="color-tools-heading" className="text-xl font-semibold tracking-tight">
            {t("GradientPage.colorToolsHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("GradientPage.colorToolsLead")}</p>
        </div>
        <ul className="flex flex-wrap gap-3">
          {variants.colour.map((variant) => (
            <li key={variant.toolId}>
              <a
                href={variantEditorHref(variant, locale)}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("Collections.openIn", { tool: toolName(variant.toolId) })}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-3">
        <h2 id="how-heading" className="text-xl font-semibold tracking-tight">
          {t("GradientPage.howToHeading")}
        </h2>
        <p className="max-w-prose text-muted-foreground">{t("GradientPage.howTo")}</p>
      </section>

      <section aria-labelledby="related-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
            {t("GradientPage.relatedHeading")}
          </h2>
          <Link
            href={routeHref({ page: "gradients" }, locale)}
            className="rounded-control text-sm text-link underline-offset-4 hover:underline"
          >
            {t("GradientPage.backToCollection")}
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((item) => (
            <li key={item.id}>
              <CollectionCard item={item} headingLevel={3} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
