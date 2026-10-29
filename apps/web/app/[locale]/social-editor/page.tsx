/**
 * SEO landing page of the social media editor (M6-AP02):
 * `/de/social-media-editor`, `/en/social-media-editor`. Static, no client
 * JS beyond the shared layout and no Konva: the editor itself lives on its
 * own page (`./edit`), which this page links to.
 */
import { SOCIAL_FORMATS } from "@musterli/scene";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { JsonLdScript } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { pageAlternates } from "@/lib/seo/alternates";
import { faqPage, webApplication } from "@/lib/seo/json-ld";
import { pageOpenGraph, SCHEMA_CURRENCY } from "@/lib/seo/page-meta";
import { siteUrl } from "@/lib/seo/site-url";
import { faqEntries, landingUseCases, tipEntries } from "@/lib/seo/tool-content";

type SocialLandingProps = Readonly<{ params: Promise<{ locale: string }> }>;

/** The formats shown as frames in the hero (a portrait, a square, a story, a landscape). */
const HERO_FORMATS = ["portrait", "square", "story", "linkedin-post"] as const;

export async function generateMetadata({ params }: SocialLandingProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "SocialLanding" });
  const tLayout = await getTranslations({ locale, namespace: "Layout" });
  const title = t("metaTitle");
  const description = t("metaDescription");
  const route = { page: "socialEditor" } as const;
  return {
    title,
    description,
    alternates: pageAlternates(route, locale),
    openGraph: pageOpenGraph({ route, locale, siteName: tLayout("brand"), title, description }),
    twitter: { card: "summary", title, description },
  };
}

export default async function SocialLandingPage({ params }: SocialLandingProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "SocialLanding" });
  const tRoot = await getTranslations({ locale });
  const sizeName = tRoot as unknown as (key: string) => string;

  const editorPath = routePath({ page: "socialEditorApp" }, locale);
  const url = new URL(routePath({ page: "socialEditor" }, locale), siteUrl());
  // Objects of numbered entries; the typed keys only know leaf strings.
  const raw = (key: string): unknown => t.raw(key as Parameters<typeof t.raw>[0]);
  const useCases = landingUseCases(raw("useCases"));
  const steps = tipEntries(raw("steps"));
  const faq = faqEntries(raw("faq"));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 sm:py-12">
      <JsonLdScript
        data={[
          webApplication({
            name: t("heading"),
            description: t("metaDescription"),
            url: url.toString(),
            inLanguage: locale,
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
            { name: tRoot("Seo.home"), route: { page: "home" } },
            { name: t("nav"), route: { page: "socialEditor" } },
          ]}
        />
        <header className="grid items-center gap-8 lg:grid-cols-2">
          <div className="flex flex-col items-start gap-5">
            <Badge
              variant="outline"
              className="h-7 rounded-full bg-background px-3 text-sm font-normal"
            >
              {t("badge")}
            </Badge>
            <h1 className="text-4xl font-semibold tracking-[-0.03em] text-balance break-words hyphens-auto sm:text-5xl">
              {t("heading")}
            </h1>
            <p className="max-w-prose text-lg text-muted-foreground">{t("lead")}</p>
            <a
              href={editorPath}
              className={buttonVariants({ size: "lg", className: "rounded-full px-6" })}
              data-testid="social-cta"
            >
              {t("cta")}
            </a>
            <p className="text-sm text-muted-foreground">{t("ctaHint")}</p>
          </div>
          <figure
            aria-hidden="true"
            className="relative isolate flex items-end justify-center gap-4 overflow-hidden rounded-3xl border border-border bg-canvas p-6 sm:p-10"
          >
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:16px_16px]" />
            {HERO_FORMATS.map((id, i) => {
              const f = SOCIAL_FORMATS.find((format) => format.id === id);
              if (!f) return null;
              return (
                <div
                  key={id}
                  className="flex flex-col justify-end gap-1 rounded-lg p-2 shadow-lg ring-1 ring-black/5"
                  style={{
                    width: `${(f.width / Math.max(f.width, f.height)) * 7}rem`,
                    aspectRatio: `${f.width} / ${f.height}`,
                    background: `linear-gradient(${135 + i * 40}deg, oklch(0.72 0.16 ${30 + i * 70}), oklch(0.55 0.18 ${260 + i * 25}))`,
                  }}
                >
                  <span className="block h-1.5 w-3/4 rounded-full bg-white/90" />
                  <span className="block h-1 w-1/2 rounded-full bg-white/70" />
                </div>
              );
            })}
          </figure>
        </header>
      </div>

      <section aria-labelledby="what-heading" className="flex flex-col gap-3">
        <h2 id="what-heading" className="text-xl font-semibold tracking-tight">
          {t("whatIsHeading")}
        </h2>
        <p className="max-w-prose text-muted-foreground">{t("whatIs")}</p>
      </section>

      {useCases.length > 0 && (
        <section aria-labelledby="features-heading" className="flex flex-col gap-4">
          <h2 id="features-heading" className="text-xl font-semibold tracking-tight">
            {t("featuresHeading")}
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {useCases.map((entry) => (
              <li
                key={entry.title}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5"
              >
                <h3 className="font-medium">{entry.title}</h3>
                <p className="text-sm text-muted-foreground">{entry.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="how-heading" className="flex flex-col gap-3">
          <h2 id="how-heading" className="text-xl font-semibold tracking-tight">
            {t("howToHeading")}
          </h2>
          <ol className="flex list-decimal flex-col gap-2 ps-5 text-muted-foreground">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <a
            href={editorPath}
            className="self-start rounded-control text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            {t("ctaSecondary")}
          </a>
        </section>
        <section aria-labelledby="formats-heading" className="flex flex-col gap-3">
          <h2 id="formats-heading" className="text-xl font-semibold tracking-tight">
            {t("formatsHeading")}
          </h2>
          <p className="text-muted-foreground">{t("formatsLead")}</p>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2" data-testid="social-formats">
            {SOCIAL_FORMATS.map((f) => (
              <li
                key={f.id}
                className="flex justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span>{sizeName(`sizes.${f.id}`)}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {f.width} × {f.height}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="privacy-heading" className="flex flex-col gap-3">
        <h2 id="privacy-heading" className="text-xl font-semibold tracking-tight">
          {t("privacyHeading")}
        </h2>
        <p className="max-w-prose text-muted-foreground">{t("privacy")}</p>
      </section>

      {faq.length > 0 && (
        <section aria-labelledby="faq-heading" className="flex flex-col gap-4">
          <h2 id="faq-heading" className="text-xl font-semibold tracking-tight">
            {t("faqHeading")}
          </h2>
          <dl className="grid gap-x-10 gap-y-5 lg:grid-cols-2">
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
  );
}
