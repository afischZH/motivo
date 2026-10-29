/**
 * One page per curated palette: `/de/farbpaletten/lehmofen`,
 * `/en/color-palettes/clay-oven`. Statically generated for every palette in
 * every locale: the swatches with copyable HEX, RGB and OKLCH values and
 * their text contrast, CSS variables and a Tailwind theme, gradients made
 * from the palette (share links `#d=`), the colour tools, similar palettes.
 */
import { registry } from "@musterli/tool-registry";
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
import { variantEditorHref } from "@/lib/collections/links";
import { collectionOgKey } from "@/lib/collections/og";
import {
  curatedPalettes,
  findPalette,
  paletteKeys,
  relatedPalettes,
} from "@/lib/collections/palettes";
import { codeText, collectionText, swatchText } from "@/lib/collections/text";
import {
  PALETTE_TOOL,
  cssGradientCode,
  paletteCode,
  paletteVariants,
} from "@/lib/collections/variants";
import { pageAlternates } from "@/lib/seo/alternates";
import { ogImageUrl, pageOpenGraph } from "@/lib/seo/page-meta";

type PalettePageProps = Readonly<{ params: Promise<{ locale: string; paletteSlug: string }> }>;

// Only curated palettes under this locale's slug; foreign slugs and ids are
// redirected by the proxy, everything else is a 404.
export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as EnabledLocale;
  return curatedPalettes().map((p) => ({
    paletteSlug: collectionItemSlug("palettes", p.id, locale),
  }));
}

async function resolve(params: PalettePageProps["params"]) {
  const { locale, paletteSlug: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return undefined;
  const palette = findPalette(collectionItemFromSlug("palettes", slug, locale) ?? "");
  return palette ? { locale, palette } : undefined;
}

export async function generateMetadata({ params }: PalettePageProps): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { locale, palette } = resolved;
  const t = await collectionText(locale);
  const keys = paletteKeys(palette.id);
  const name = t(keys.name);
  const title = t("PalettePage.metaTitle", { palette: name });
  const description = t("PalettePage.metaDescription", { description: t(keys.description) });
  const route = { page: "palette", paletteId: palette.id } as const;
  const ogKey = collectionOgKey("palettes", palette.id);
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
      image: { toolId: ogKey, alt: t("PalettePage.ogAlt", { palette: name }) },
    }),
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl(ogKey, locale)],
    },
  };
}

export default async function PalettePage({ params }: PalettePageProps) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { locale, palette } = resolved;
  setRequestLocale(locale);
  const t = await collectionText(locale);

  const keys = paletteKeys(palette.id);
  const name = t(keys.name);
  const code = paletteCode(palette);
  const variants = paletteVariants(palette);
  const home = variants.colour.find((v) => v.toolId === PALETTE_TOOL);
  const scales = variants.colour.filter((v) => v.toolId !== PALETTE_TOOL);
  const toolName = (id: string) => t(`tools.${id}.name`);
  const related = relatedPalettes(palette).map((other) => ({
    id: other.id,
    href: routePath({ page: "palette", paletteId: other.id }, locale),
    name: t(paletteKeys(other.id).name),
    description: t(paletteKeys(other.id).description),
    colors: other.colors,
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: t("PaletteCollection.title"), route: { page: "palettes" } },
            { name, route: { page: "palette", paletteId: palette.id } },
          ]}
        />

        <header className="grid items-center gap-8 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-5">
            <p className="text-sm text-muted-foreground">
              {t(`PaletteCollection.groups.${palette.group}.name`)}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("PalettePage.heading", { palette: name })}
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">{t(keys.description)}</p>
            {home && (
              // Full page load: the editor reads the design from the #d= hash on start.
              <a
                href={variantEditorHref(home, locale)}
                className={buttonVariants({ size: "lg", className: "rounded-full px-6" })}
              >
                {t("PalettePage.openEditor")}
              </a>
            )}
            <p className="text-sm text-muted-foreground">{t("PalettePage.openEditorHint")}</p>
          </div>
          <div
            role="img"
            aria-label={t("PalettePage.previewLabel", {
              palette: name,
              count: palette.colors.length,
            })}
            className="flex h-72 w-full overflow-hidden rounded-card border border-border shadow-sm sm:h-96"
          >
            {palette.colors.map((color, i) => (
              <span key={`${color}-${i}`} className="flex-1" style={{ backgroundColor: color }} />
            ))}
          </div>
        </header>
      </div>

      <section aria-labelledby="colors-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="colors-heading" className="text-xl font-semibold tracking-tight">
            {t("PalettePage.colorsHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("PalettePage.colorsLead")}</p>
        </div>
        <SwatchList colors={palette.colors} text={swatchText(t)} />
      </section>

      <section aria-labelledby="code-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="code-heading" className="text-xl font-semibold tracking-tight">
            {t("PalettePage.codeHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("PalettePage.codeLead")}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <CodeBlock
            code={code.cssVariables}
            {...codeText(t, t("PalettePage.cssVariablesLabel"))}
          />
          <CodeBlock code={code.tailwind} {...codeText(t, t("PalettePage.tailwindLabel"))} />
        </div>
      </section>

      <section aria-labelledby="gradients-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="gradients-heading" className="text-xl font-semibold tracking-tight">
            {t("PalettePage.gradientsHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("PalettePage.gradientsLead")}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {variants.gradient.map((variant) => {
            const tool = registry.get(variant.toolId);
            if (!tool) return null;
            return (
              <li key={variant.toolId}>
                <VariantCard
                  variant={variant}
                  tool={tool}
                  href={variantEditorHref(variant, locale)}
                  title={t("Collections.openIn", { tool: toolName(variant.toolId) })}
                  style={
                    variant.thumb === "css" ? cssGradientCode(variant.design).style : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="color-tools-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="color-tools-heading" className="text-xl font-semibold tracking-tight">
            {t("PalettePage.colorToolsHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("PalettePage.colorToolsLead")}</p>
        </div>
        <ul className="flex flex-wrap gap-3">
          {scales.map((variant) => (
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
          {t("PalettePage.howToHeading")}
        </h2>
        <p className="max-w-prose text-muted-foreground">{t("PalettePage.howTo")}</p>
      </section>

      <section aria-labelledby="related-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
            {t("PalettePage.relatedHeading")}
          </h2>
          <Link
            href={routeHref({ page: "palettes" }, locale)}
            className="rounded-control text-sm text-link underline-offset-4 hover:underline"
          >
            {t("PalettePage.backToCollection")}
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
