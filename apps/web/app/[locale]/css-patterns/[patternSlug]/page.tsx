/**
 * One page per library pattern: `/de/css-muster/zickzack`,
 * `/en/css-patterns/zigzag`. Statically generated for every pattern in every
 * locale: a live CSS preview, the CSS and Tailwind code to copy, a link that
 * opens the pattern in the editor (share link `#d=`) and related patterns.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CodeBlock } from "@/components/css-patterns/code-block";
import { PatternCard } from "@/components/css-patterns/pattern-card";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref, routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { patternIdFromSlug, patternSlug } from "@/i18n/slugs";
import {
  PATTERN_TOOL_ID,
  findPattern,
  libraryPatterns,
  patternEditorHash,
  patternKeys,
  patternOgKey,
  patternShowcase,
  relatedPatterns,
} from "@/lib/css-patterns";
import { pageAlternates } from "@/lib/seo/alternates";
import { ogImageUrl, pageOpenGraph } from "@/lib/seo/page-meta";

type PatternPageProps = Readonly<{ params: Promise<{ locale: string; patternSlug: string }> }>;

// Only library patterns under this locale's slug; foreign slugs and ids are
// redirected by the proxy, everything else is a 404.
export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as EnabledLocale;
  return libraryPatterns().map((spec) => ({ patternSlug: patternSlug(spec.id, locale) }));
}

async function resolve(params: PatternPageProps["params"]) {
  const { locale, patternSlug: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return undefined;
  const spec = findPattern(patternIdFromSlug(slug, locale) ?? "");
  return spec ? { locale, spec } : undefined;
}

/** Translator for keys built from library ids. */
async function text(locale: EnabledLocale) {
  const t = await getTranslations({ locale });
  return t as unknown as (key: string, values?: Record<string, string>) => string;
}

export async function generateMetadata({ params }: PatternPageProps): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { locale, spec } = resolved;
  const t = await text(locale);
  const keys = patternKeys(spec);
  const name = t(keys.name);
  const title = t("PatternPage.metaTitle", { pattern: name });
  const description = t("PatternPage.metaDescription", { description: t(keys.description) });
  const route = { page: "pattern", patternId: spec.id } as const;
  const ogKey = patternOgKey(spec.id);
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
      image: { toolId: ogKey, alt: t("PatternPage.ogAlt", { pattern: name }) },
    }),
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl(ogKey, locale)],
    },
  };
}

export default async function PatternPage({ params }: PatternPageProps) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { locale, spec } = resolved;
  setRequestLocale(locale);
  const t = await text(locale);

  const keys = patternKeys(spec);
  const name = t(keys.name);
  const category = t(keys.category);
  const showcase = patternShowcase(spec);
  const editorHref = `${routePath({ page: "tool", toolId: PATTERN_TOOL_ID }, locale)}${patternEditorHash(spec)}`;
  const copy = {
    copy: t("PatternPage.copy"),
    copied: t("PatternPage.copied"),
    copyFailed: t("PatternPage.copyFailed"),
  };
  const related = relatedPatterns(spec).map((other) => {
    const k = patternKeys(other);
    return {
      id: other.id,
      category: other.category,
      name: t(k.name),
      description: t(k.description),
      categoryLabel: t(k.category),
      style: patternShowcase(other).style,
    };
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: t("PatternLibrary.title"), route: { page: "patterns" } },
            { name, route: { page: "pattern", patternId: spec.id } },
          ]}
        />

        <header className="grid items-center gap-8 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-5">
            <p className="text-sm text-muted-foreground">{category}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("PatternPage.heading", { pattern: name })}
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">{t(keys.description)}</p>
            {/* Full page load: the editor reads the design from the #d= hash on start. */}
            <a href={editorHref} className={buttonVariants({ size: "lg" })}>
              {t("PatternPage.openEditor")}
            </a>
            <p className="text-sm text-muted-foreground">{t("PatternPage.openEditorHint")}</p>
          </div>
          <div
            role="img"
            aria-label={t("PatternPage.previewLabel", { pattern: name })}
            className="h-72 w-full rounded-card border border-border shadow-sm sm:h-96"
            style={showcase.style}
          />
        </header>
      </div>

      <section aria-labelledby="code-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="code-heading" className="text-xl font-semibold tracking-tight">
            {t("PatternPage.codeHeading")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{t("PatternPage.cssLead")}</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <CodeBlock
            title={t("PatternPage.cssLabel")}
            code={showcase.css}
            copyLabel={t("PatternPage.copyLabel", { format: t("PatternPage.cssLabel") })}
            {...copy}
          />
          <CodeBlock
            title={t("PatternPage.tailwindLabel")}
            code={showcase.tailwind}
            copyLabel={t("PatternPage.copyLabel", { format: t("PatternPage.tailwindLabel") })}
            {...copy}
          />
        </div>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-3">
        <h2 id="how-heading" className="text-xl font-semibold tracking-tight">
          {t("PatternPage.howToHeading")}
        </h2>
        <p className="max-w-prose text-muted-foreground">{t("PatternPage.howTo")}</p>
      </section>

      <section aria-labelledby="related-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
            {t("PatternPage.relatedHeading")}
          </h2>
          <Link
            href={routeHref({ page: "patterns" }, locale)}
            className="rounded-control text-sm text-link underline-offset-4 hover:underline"
          >
            {t("PatternPage.backToLibrary")}
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((pattern) => (
            <li key={pattern.id}>
              <PatternCard pattern={pattern} locale={locale} headingLevel={3} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
