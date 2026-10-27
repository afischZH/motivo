/**
 * Home page: hero with motifs rendered by the tools themselves (static SVG
 * files from `/motifs`), value proposition, categories, featured tools,
 * "how it works", the Founders waitlist, FAQ and a closing call to action.
 * Built from the registry and `lib/home.ts`; static. The only page-specific
 * client JS is the waitlist form, which asks the API whether it is on.
 */
import { registry, type AnyToolDefinition } from "@motivo/tool-registry";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { JsonLdScript } from "@/components/seo/json-ld";
import { MotifImage } from "@/components/seo/motif-image";
import { ToolCard } from "@/components/seo/tool-card";
import { WaitlistSection } from "@/components/waitlist/waitlist-section";
import { buttonVariants } from "@/components/ui/button";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref, routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { categoryTools, populatedCategories } from "@/lib/catalogue";
import { FEATURED_TOOL_IDS, HERO_START_TOOL_ID, HERO_TOOL_IDS, HOME_FAQ_COUNT } from "@/lib/home";
import { pageAlternates } from "@/lib/seo/alternates";
import { faqPage } from "@/lib/seo/json-ld";
import { pageOpenGraph } from "@/lib/seo/page-meta";
import { toolKeys } from "@/lib/seo/tool-content";
import { cn } from "@/lib/utils";

type HomePageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  const title = t("Home.metaTitle");
  const description = t("Home.metaDescription");
  const route = { page: "home" } as const;
  return {
    // The full title already names the brand: skip the layout's title template.
    title: { absolute: title },
    description,
    alternates: pageAlternates(route, locale),
    openGraph: pageOpenGraph({ route, locale, siteName: t("Layout.brand"), title, description }),
  };
}

function tools(ids: readonly string[]): AnyToolDefinition[] {
  return ids.flatMap((id) => {
    const tool = registry.get(id);
    return tool ? [tool] : [];
  });
}

type Text = (key: string, values?: Record<string, string | number>) => string;

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  // Tool names are keyed by registry id, which the typed keys cannot know.
  const text = t as unknown as Text;

  const faq = Array.from({ length: HOME_FAQ_COUNT }, (_, i) => ({
    question: text(`Home.faq.q${i + 1}.question`),
    answer: text(`Home.faq.q${i + 1}.answer`),
  }));

  return (
    <div className="flex flex-col gap-20 pb-20">
      <JsonLdScript data={faqPage(faq, locale)} />
      <Hero locale={locale} text={text} />
      <Values text={text} />
      <Categories locale={locale} text={text} />
      <Featured locale={locale} text={text} />
      <HowItWorks text={text} />
      <WaitlistSection locale={locale} showMoreLink />
      <Faq faq={faq} text={text} />
      <ClosingCta locale={locale} text={text} />
    </div>
  );
}

const SECTION = "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4";
const H2 = "text-2xl font-semibold tracking-tight sm:text-3xl";

function Hero({ locale, text }: { locale: EnabledLocale; text: Text }) {
  const [stage, ...floating] = tools(HERO_TOOL_IDS);
  const startName = text(toolKeys(HERO_START_TOOL_ID).name);

  return (
    <section
      aria-labelledby="hero-heading"
      className="border-b border-border bg-gradient-to-b from-highlight/60 to-background"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-2">
        <div className="flex flex-col items-start gap-6">
          <p className="text-sm font-medium text-link">{text("Home.hero.eyebrow")}</p>
          <h1
            id="hero-heading"
            className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          >
            {text("Home.hero.title")}
          </h1>
          <p className="max-w-prose text-lg text-muted-foreground">{text("Home.hero.lead")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/tools" className={buttonVariants({ size: "lg" })}>
              {text("Home.hero.ctaPrimary")}
            </Link>
            {/* Full page load, like every other editor link. */}
            <a
              href={routePath({ page: "tool", toolId: HERO_START_TOOL_ID }, locale)}
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              {text("Home.hero.ctaSecondary", { tool: startName })}
            </a>
          </div>
          <p className="text-sm text-muted-foreground">{text("Home.hero.hint")}</p>
        </div>

        {stage && (
          <div className="relative mx-auto w-full max-w-xl pb-10 sm:pb-12">
            <ul aria-label={text("Home.hero.showcaseLabel")}>
              <li>
                <ShowcaseLink tool={stage} locale={locale} text={text}>
                  <MotifImage
                    tool={stage}
                    alt=""
                    priority
                    className="w-full rounded-card shadow-lg motion-safe:animate-[motif-drift_14s_ease-in-out_infinite_alternate]"
                  />
                </ShowcaseLink>
              </li>
              {floating.map((tool, i) => (
                <li
                  key={tool.id}
                  className={cn(
                    "absolute w-[30%]",
                    i === 0 ? "-bottom-2 left-4 sm:left-6" : "-top-6 right-4 sm:right-6",
                  )}
                >
                  <ShowcaseLink tool={tool} locale={locale} text={text}>
                    <MotifImage
                      tool={tool}
                      alt=""
                      className="w-full rounded-card border-4 border-background shadow-xl"
                    />
                  </ShowcaseLink>
                </li>
              ))}
            </ul>
            <p
              aria-hidden="true"
              className="absolute right-4 -bottom-1 flex items-center gap-2 rounded-control border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm sm:right-6"
            >
              <kbd className="rounded-sm border border-border bg-muted px-1.5 font-sans text-foreground">
                {text("Home.hero.spaceHint")}
              </kbd>
              {text("Home.hero.spaceHintText")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ShowcaseLink({
  tool,
  locale,
  text,
  children,
}: {
  tool: AnyToolDefinition;
  locale: EnabledLocale;
  text: Text;
  children: ReactNode;
}) {
  return (
    <Link
      href={routeHref({ page: "landing", toolId: tool.id }, locale)}
      aria-label={text("Home.hero.showcaseLink", { tool: text(toolKeys(tool.id).name) })}
      className="block rounded-card transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {children}
    </Link>
  );
}

function Values({ text }: { text: Text }) {
  const items = ["free", "local", "lifetime"] as const;
  return (
    <section aria-labelledby="values-heading" className={SECTION}>
      <h2 id="values-heading" className={H2}>
        {text("Home.values.heading")}
      </h2>
      <ul className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <li key={item} className="flex flex-col gap-2 rounded-card border border-border p-5">
            <h3 className="text-lg font-semibold">{text(`Home.values.${item}.title`)}</h3>
            <p className="text-muted-foreground">{text(`Home.values.${item}.text`)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Categories({ locale, text }: { locale: EnabledLocale; text: Text }) {
  const card =
    "flex h-full flex-col gap-1 rounded-card border border-border bg-card p-4 transition-colors hover:border-ring";
  return (
    <section aria-labelledby="categories-heading" className={SECTION}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="categories-heading" className={H2}>
            {text("Home.categories.heading")}
          </h2>
          <p className="text-muted-foreground">{text("Home.categories.lead")}</p>
        </div>
        <Link
          href="/tools"
          className="rounded-control text-sm font-medium text-link underline-offset-4 hover:underline"
        >
          {text("Home.categories.all")}
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {populatedCategories().map((category) => (
          <li key={category}>
            <Link href={routeHref({ page: "category", category }, locale)} className={card}>
              <span className="font-semibold">
                {text(`Categories.${category}.name`)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({text("Catalogue.toolCount", { count: categoryTools(category).length })})
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                {text(`Categories.${category}.description`)}
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/convert" className={card}>
            <span className="font-semibold">{text("Categories.converters.name")}</span>
            <span className="text-sm text-muted-foreground">
              {text("Home.categories.converters")}
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

function Featured({ locale, text }: { locale: EnabledLocale; text: Text }) {
  return (
    <section aria-labelledby="featured-heading" className={SECTION}>
      <div className="flex flex-col gap-1">
        <h2 id="featured-heading" className={H2}>
          {text("Home.featured.heading")}
        </h2>
        <p className="text-muted-foreground">{text("Home.featured.lead")}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools(FEATURED_TOOL_IDS).map((tool) => (
          <li key={tool.id}>
            <ToolCard tool={tool} locale={locale} headingLevel={3} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks({ text }: { text: Text }) {
  const steps = ["step1", "step2", "step3"] as const;
  return (
    <section aria-labelledby="how-heading" className={SECTION}>
      <h2 id="how-heading" className={H2}>
        {text("Home.how.heading")}
      </h2>
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground tabular-nums"
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold">{text(`Home.how.${step}.title`)}</h3>
              <p className="text-muted-foreground">{text(`Home.how.${step}.text`)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Faq({ faq, text }: { faq: { question: string; answer: string }[]; text: Text }) {
  return (
    <section aria-labelledby="faq-heading" className={SECTION}>
      <h2 id="faq-heading" className={H2}>
        {text("Home.faq.heading")}
      </h2>
      <dl className="grid gap-x-10 gap-y-6 md:grid-cols-2">
        {faq.map((entry) => (
          <div key={entry.question} className="flex flex-col gap-1">
            <dt className="font-semibold">{entry.question}</dt>
            <dd className="text-muted-foreground">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ClosingCta({ locale, text }: { locale: EnabledLocale; text: Text }) {
  return (
    <section aria-labelledby="cta-heading" className={SECTION}>
      <div className="flex flex-col items-start gap-4 rounded-card border border-border bg-highlight p-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="cta-heading" className="text-2xl font-semibold tracking-tight">
            {text("Home.cta.heading")}
          </h2>
          <p className="text-muted-foreground">{text("Home.cta.text")}</p>
        </div>
        <a
          href={routePath({ page: "tool", toolId: HERO_START_TOOL_ID }, locale)}
          className={buttonVariants({ size: "lg" })}
        >
          {text("Home.cta.button")}
        </a>
      </div>
    </section>
  );
}
