/**
 * SEO landing page of a tool: `/de/punktmuster-generator`,
 * `/en/polka-dot-pattern-generator`. Statically generated for every
 * registered tool in every locale; texts come from `tools.<id>` in the
 * messages, motifs from the tool's own render function. No client JS
 * beyond the shared layout.
 */
import { registry, type AnyToolDefinition } from "@motivo/tool-registry";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CollectionTeaser } from "@/components/collections/collection-teaser";
import { teaserPreviews } from "@/lib/collections/teaser";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLdScript } from "@/components/seo/json-ld";
import { MotifImage } from "@/components/seo/motif-image";
import { ToolCard } from "@/components/seo/tool-card";
import { buttonVariants } from "@/components/ui/button";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref, routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { toolIdFromSlug, toolSlug } from "@/i18n/slugs";
import { primaryCategory, relatedTools } from "@/lib/catalogue";
import { collectionsFor } from "@/lib/collections";
import { pageAlternates } from "@/lib/seo/alternates";
import { faqPage, webApplication } from "@/lib/seo/json-ld";
import { designEditorHash, hasStaticMotif, landingPresets } from "@/lib/seo/motifs";
import { ogImageUrl, pageOpenGraph, SCHEMA_CURRENCY } from "@/lib/seo/page-meta";
import { siteUrl } from "@/lib/seo/site-url";
import { faqEntries, toolKeys } from "@/lib/seo/tool-content";

type LandingPageProps = Readonly<{ params: Promise<{ locale: string; toolSlug: string }> }>;

// Only registered tools under this locale's slug; foreign slugs and ids are
// redirected by the proxy, everything else is a 404.
export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as EnabledLocale;
  return registry.list().map((tool) => ({ toolSlug: toolSlug(tool.id, locale) }));
}

async function resolve(params: LandingPageProps["params"]) {
  const { locale, toolSlug: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return undefined;
  const tool = registry.get(toolIdFromSlug(slug, locale) ?? "");
  return tool ? { locale, tool } : undefined;
}

/** Translator for keys built from the registry id. */
async function toolText(locale: EnabledLocale) {
  const t = await getTranslations({ locale });
  return {
    text: t as unknown as (key: string, values?: Record<string, string>) => string,
    raw: (key: string): unknown => t.raw(key as Parameters<typeof t.raw>[0]),
  };
}

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { locale, tool } = resolved;
  const { text } = await toolText(locale);
  const keys = toolKeys(tool.id);
  const title = text("Landing.metaTitle", { tool: text(keys.name) });
  const description = text(keys.description);
  const route = { page: "landing", toolId: tool.id } as const;

  return {
    title,
    description,
    alternates: pageAlternates(route, locale),
    openGraph: pageOpenGraph({
      route,
      locale,
      siteName: text("Layout.brand"),
      title,
      description,
      image: hasStaticMotif(tool)
        ? { toolId: tool.id, alt: text("Landing.ogAlt", { tool: text(keys.name) }) }
        : undefined,
    }),
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: hasStaticMotif(tool) ? [ogImageUrl(tool.id, locale)] : undefined,
    },
  };
}

export default async function LandingPage({ params }: LandingPageProps) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { locale, tool } = resolved;
  setRequestLocale(locale);
  const { text, raw } = await toolText(locale);

  const keys = toolKeys(tool.id);
  const name = text(keys.name);
  const description = text(keys.description);
  const faq = faqEntries(raw(keys.faq));
  const category = primaryCategory(tool);
  const editorPath = routePath({ page: "tool", toolId: tool.id }, locale);
  const landingUrl = new URL(routePath({ page: "landing", toolId: tool.id }, locale), siteUrl());

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 sm:py-12">
      <JsonLdScript
        data={[
          webApplication({
            name,
            description,
            url: landingUrl.toString(),
            inLanguage: locale,
            image: hasStaticMotif(tool) ? ogImageUrl(tool.id, locale) : undefined,
            category: "DesignApplication",
            currency: SCHEMA_CURRENCY,
          }),
          ...(faq.length > 0 ? [faqPage(faq, locale)] : []),
        ]}
      />

      <div className="flex flex-col gap-6">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: text("Seo.home"), route: { page: "home" } },
            { name: text("ToolsIndex.title"), route: { page: "tools" } },
            { name: text(`Categories.${category}.name`), route: { page: "category", category } },
            { name, route: { page: "landing", toolId: tool.id } },
          ]}
        />

        <header className="grid items-center gap-8 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-5">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {name}
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">{description}</p>
            <a href={editorPath} className={buttonVariants({ size: "lg" })}>
              {text("Landing.cta")}
            </a>
            <p className="text-sm text-muted-foreground">{text("Landing.ctaHint")}</p>
            <CategoryChips tool={tool} locale={locale} text={text} />
          </div>
          <figure className="flex items-center justify-center rounded-card bg-canvas p-4 sm:p-6">
            <MotifImage
              tool={tool}
              alt={text("Landing.previewAlt", { tool: name })}
              priority
              className="max-h-96 w-auto rounded-md shadow-sm"
            />
          </figure>
        </header>
      </div>

      {landingPresets(tool).length > 0 && (
        <section aria-labelledby="presets-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="presets-heading" className="text-xl font-semibold tracking-tight">
              {text("Landing.presetsHeading")}
            </h2>
            <p className="text-muted-foreground">{text("Landing.presetsLead")}</p>
          </div>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {landingPresets(tool).map((preset) => {
              const presetName = preset.nameKey ? text(preset.nameKey) : name;
              return (
                <li key={preset.id}>
                  {/* Full page load: the editor reads the design from the #d= hash on start. */}
                  <a
                    href={`${editorPath}${designEditorHash(tool, preset)}`}
                    aria-label={text("Landing.presetLink", { preset: presetName })}
                    className="group flex h-full flex-col overflow-hidden rounded-card border border-border bg-card transition-colors hover:border-ring"
                  >
                    <span className="flex h-36 items-center justify-center bg-canvas p-3">
                      <MotifImage
                        tool={tool}
                        designId={preset.id}
                        alt=""
                        className="max-h-full w-auto rounded-sm"
                      />
                    </span>
                    <span className="p-3 text-sm font-medium">{presetName}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="what-heading" className="flex flex-col gap-3">
            <h2 id="what-heading" className="text-xl font-semibold tracking-tight">
              {text("Landing.whatIsHeading", { tool: name })}
            </h2>
            <p className="max-w-prose text-muted-foreground">{text(keys.whatIs)}</p>
          </section>
          <section aria-labelledby="how-heading" className="flex flex-col gap-3">
            <h2 id="how-heading" className="text-xl font-semibold tracking-tight">
              {text("Landing.howToHeading")}
            </h2>
            <p className="max-w-prose text-muted-foreground">{text(keys.howTo)}</p>
            <a
              href={editorPath}
              className="self-start rounded-control text-sm font-medium text-link underline-offset-4 hover:underline"
            >
              {text("Landing.ctaSecondary", { tool: name })}
            </a>
          </section>
        </div>

        {faq.length > 0 && (
          <section aria-labelledby="faq-heading" className="flex flex-col gap-3">
            <h2 id="faq-heading" className="text-xl font-semibold tracking-tight">
              {text("Landing.faqHeading")}
            </h2>
            <dl className="flex flex-col gap-5">
              {faq.map((entry) => (
                <div key={entry.question} className="flex flex-col gap-1">
                  <dt className="font-medium">{entry.question}</dt>
                  <dd className="text-muted-foreground">{entry.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      {collectionsFor(tool.category).map((kind) => (
        <CollectionTeaser key={kind} kind={kind} locale={locale} previews={teaserPreviews(kind)} />
      ))}

      <RelatedTools tool={tool} locale={locale} text={text} />
    </div>
  );
}

type Text = (key: string, values?: Record<string, string>) => string;

function CategoryChips({
  tool,
  locale,
  text,
}: {
  tool: AnyToolDefinition;
  locale: EnabledLocale;
  text: Text;
}) {
  return (
    <ul aria-label={text("Landing.categoriesLabel")} className="flex flex-wrap gap-2">
      {tool.category.map((category) => (
        <li key={category}>
          <Link
            href={routeHref({ page: "category", category }, locale)}
            className="inline-flex rounded-control border border-border px-2.5 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {text(`Categories.${category}.name`)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RelatedTools({
  tool,
  locale,
  text,
}: {
  tool: AnyToolDefinition;
  locale: EnabledLocale;
  text: Text;
}) {
  const related = relatedTools(tool);
  if (related.length === 0) return null;
  const category = primaryCategory(tool);

  return (
    <section aria-labelledby="related-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
          {text("Landing.relatedHeading")}
        </h2>
        <Link
          href={routeHref({ page: "category", category }, locale)}
          className="rounded-control text-sm text-link underline-offset-4 hover:underline"
        >
          {text("Landing.moreInCategory", { category: text(`Categories.${category}.name`) })}
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((other) => (
          <li key={other.id}>
            <ToolCard tool={other} locale={locale} headingLevel={3} />
          </li>
        ))}
      </ul>
    </section>
  );
}
