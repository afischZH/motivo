/**
 * Home page: hero with a product preview whose stage cycles through presets
 * rendered by the tools themselves (static SVG files from `/motifs`), value
 * proposition, categories, featured tools, "how it works", FAQ and a closing
 * call to action. Built from the registry and `lib/home.ts`; the preview is
 * the only client component.
 */
import {
  builtInTools,
  registry,
  type AnyToolDefinition,
  type ToolCategory,
} from "@musterli/tool-registry";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  CheckIcon,
  FileDownIcon,
  HeartIcon,
  LaptopIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react";
import type React from "react";

import { HeroPreview } from "@/components/home/hero-preview";
import { KofiWidget } from "@/components/home/kofi-widget";
import { JsonLdScript } from "@/components/seo/json-ld";
import { MotifImage } from "@/components/seo/motif-image";
import { ToolCard } from "@/components/seo/tool-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref, routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { categoryTools, populatedCategories } from "@/lib/catalogue";
import {
  FEATURED_TOOL_IDS,
  HERO_START_TOOL_ID,
  HERO_TOOL_ID,
  HOME_FAQ_COUNT,
  VALUES_TOOL_ID,
} from "@/lib/home";
import { pageAlternates } from "@/lib/seo/alternates";
import { hasStaticMotif, motifPath, staticDesigns } from "@/lib/seo/motifs";
import { faqPage } from "@/lib/seo/json-ld";
import { pageOpenGraph } from "@/lib/seo/page-meta";
import { toolKeys } from "@/lib/seo/tool-content";
import { kofiPageId, telemetryEnv } from "@/lib/telemetry/config";
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

  const kofi = kofiPageId(telemetryEnv());

  return (
    <div className="flex flex-col">
      <JsonLdScript data={faqPage(faq, locale)} />
      <Hero locale={locale} text={text} />
      <Values text={text} />
      <Categories locale={locale} text={text} />
      <Featured locale={locale} text={text} />
      <HowItWorks text={text} />
      <Faq faq={faq} text={text} />
      <ClosingCta locale={locale} text={text} />
      {kofi && <KofiWidget pageId={kofi} label={t("Home.kofiButton")} />}
    </div>
  );
}

const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const SECTION = cn(WRAP, "flex flex-col gap-10 py-20 sm:py-24");
const H2 = "text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl";
const LEAD = "max-w-prose text-lg text-pretty text-muted-foreground";
const TEXT_LINK =
  "rounded-control text-sm font-medium text-link underline-offset-4 hover:underline";

/** Section intro after the shadcnspace blocks: outline badge, heading, lead. */
function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  action,
  center = false,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  action?: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4",
        center && "flex-col items-center text-center",
      )}
    >
      <div className={cn("flex flex-col items-start gap-3", center && "items-center")}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 id={id} className={H2}>
          {title}
        </h2>
        {lead && <p className={LEAD}>{lead}</p>}
      </div>
      {action}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="outline" className="h-7 rounded-full bg-background px-3 text-sm font-normal">
      {children}
    </Badge>
  );
}

function Hero({ locale, text }: { locale: EnabledLocale; text: Text }) {
  const startName = text(toolKeys(HERO_START_TOOL_ID).name);
  const stage = registry.get(HERO_TOOL_ID);
  const points = ["free", "local", "noAccount"] as const;

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden border-b border-border"
    >
      {/* Soft brand wash plus a faint grid, both purely decorative. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_75%_20%,var(--highlight),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_85%)] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-50"
      />
      <div
        className={cn(
          WRAP,
          "grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-[1fr_1.1fr] lg:gap-12 lg:pt-28 lg:pb-24",
        )}
      >
        <div className="flex flex-col items-start gap-7">
          <Link
            href="/tools"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-background/80 py-1 ps-1 pe-3 text-sm text-muted-foreground shadow-xs transition-colors hover:text-foreground"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-highlight text-link">
              <SparklesIcon aria-hidden="true" className="size-3.5" />
            </span>
            {text("Home.hero.badge", { count: builtInTools.length })}
            <ArrowRightIcon
              aria-hidden="true"
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <h1
            id="hero-heading"
            className="text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl"
          >
            {text("Home.hero.title")}
          </h1>
          <p className="max-w-[40ch] text-lg text-pretty text-muted-foreground sm:text-xl">
            {text("Home.hero.lead")}
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/tools"
              className={buttonVariants({
                size: "lg",
                className: "h-11 rounded-full px-7 text-base",
              })}
            >
              {text("Home.hero.ctaPrimary")}
            </Link>
            {/* Full page load, like every other editor link. */}
            <a
              href={routePath({ page: "tool", toolId: HERO_START_TOOL_ID }, locale)}
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className: "h-11 rounded-full px-7 text-base",
              })}
            >
              {text("Home.hero.ctaSecondary", { tool: startName })}
            </a>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-1.5">
                <CheckIcon aria-hidden="true" className="size-4 text-link" />
                {text(`Home.hero.points.${point}`)}
              </li>
            ))}
          </ul>
        </div>

        {stage && (
          <HeroPreview
            toolName={text(toolKeys(stage.id).name)}
            editorHref={routePath({ page: "tool", toolId: stage.id }, locale)}
            formats={stage.exports.slice(0, 3).map((format) => format.toUpperCase())}
            frames={staticDesigns(stage).map((design) => ({
              src: motifPath(stage.id, design.id),
              name: design.nameKey ? text(design.nameKey) : text("Home.preview.default"),
            }))}
            labels={{
              key: text("Home.hero.spaceHint"),
              next: text("Home.preview.next"),
              open: text("Home.hero.showcaseLink", { tool: text(toolKeys(stage.id).name) }),
            }}
          />
        )}
      </div>
    </section>
  );
}

/**
 * "Why Musterli" after the shadcnspace block bento-grid-03: four values in
 * ruled columns around a tool motif.
 */
function Values({ text }: { text: Text }) {
  const left = [
    { key: "free", Icon: SparklesIcon },
    { key: "local", Icon: LaptopIcon },
  ] as const;
  const right = [
    { key: "formats", Icon: FileDownIcon },
    { key: "donations", Icon: HeartIcon },
  ] as const;
  const showcase = registry.get(VALUES_TOOL_ID);

  const item = ({ key, Icon }: (typeof left)[number] | (typeof right)[number]) => (
    <li key={key} className="flex flex-1 flex-col justify-between gap-8 p-6 sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-link shadow-xs">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold">{text(`Home.values.${key}.title`)}</h3>
        <p className="text-pretty text-muted-foreground">{text(`Home.values.${key}.text`)}</p>
        {key === "donations" && (
          <Link href="/support" className={cn(TEXT_LINK, "mt-1 self-start")}>
            {text("Footer.support")}
          </Link>
        )}
      </div>
    </li>
  );

  return (
    <section aria-labelledby="values-heading" className={cn(SECTION, "pt-16 sm:pt-20")}>
      <SectionHeading
        id="values-heading"
        eyebrow={text("Home.values.eyebrow")}
        title={text("Home.values.heading")}
        lead={text("Home.values.lead")}
        center
      />
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-3">
        <ul className="flex flex-col divide-y divide-border border-b border-border lg:border-r lg:border-b-0">
          {left.map(item)}
        </ul>
        <div
          aria-hidden="true"
          className="relative min-h-56 overflow-hidden border-b border-border bg-canvas lg:border-r lg:border-b-0"
        >
          {showcase && (
            <MotifImage
              tool={showcase}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          )}
          <div className="absolute inset-x-4 bottom-4 flex flex-wrap justify-center gap-2">
            {["SVG", "PNG", "CSS", "WebP", "GIF"].map((format) => (
              <span
                key={format}
                className="rounded-full border border-white/40 bg-white/70 px-3 py-1 font-mono text-xs font-medium text-neutral-900 backdrop-blur"
              >
                {format}
              </span>
            ))}
          </div>
        </div>
        <ul className="flex flex-col divide-y divide-border">{right.map(item)}</ul>
      </div>
    </section>
  );
}

/**
 * Cover motif of a category tile: its first tool with a static motif that no
 * earlier tile shows, so categories sharing tools do not look alike.
 */
function categoryCover(category: ToolCategory, used: Set<string>): AnyToolDefinition | undefined {
  const candidates = categoryTools(category).filter(hasStaticMotif);
  const cover = candidates.find((tool) => !used.has(tool.id)) ?? candidates[0];
  if (cover) used.add(cover.id);
  return cover;
}

const TILE =
  "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[border-color,box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:border-ring hover:shadow-[0_12px_32px_-16px_oklch(0.3_0.12_275/0.35)]";

function Categories({ locale, text }: { locale: EnabledLocale; text: Text }) {
  const used = new Set<string>();
  return (
    <section aria-labelledby="categories-heading" className={cn(SECTION, "pt-0 sm:pt-0")}>
      <SectionHeading
        id="categories-heading"
        eyebrow={text("Home.categories.eyebrow")}
        title={text("Home.categories.heading")}
        lead={text("Home.categories.lead")}
        action={
          <Link href="/tools" className={TEXT_LINK}>
            {text("Home.categories.all")}
          </Link>
        }
      />
      {/* The categories in a 3-column grid from sm up, the converters as a full-width row below. */}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5">
        {populatedCategories().map((category) => {
          const cover = categoryCover(category, used);
          return (
            <li key={category}>
              <Link href={routeHref({ page: "category", category }, locale)} className={TILE}>
                <span className="block aspect-[4/3] overflow-hidden border-b border-border bg-muted sm:aspect-[16/10]">
                  {cover && (
                    <MotifImage
                      tool={cover}
                      alt=""
                      className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-0.5 p-3 sm:p-4">
                  <span className="font-semibold">{text(`Categories.${category}.name`)}</span>
                  <span className="text-sm text-muted-foreground">
                    {text("Catalogue.toolCount", { count: categoryTools(category).length })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        <li className="col-span-2 sm:col-span-3">
          <Link href="/convert" className={cn(TILE, "sm:flex-row")}>
            <span
              aria-hidden="true"
              className="flex aspect-[3/1] items-center justify-center gap-2 border-b border-border bg-highlight font-mono text-sm font-medium text-link sm:aspect-auto sm:w-1/3 sm:border-r sm:border-b-0 sm:py-8 sm:text-base"
            >
              SVG · CSS · PNG
            </span>
            <span className="flex flex-1 flex-col justify-center gap-0.5 p-3 sm:p-6">
              <span className="font-semibold">{text("Categories.converters.name")}</span>
              <span className="text-sm text-muted-foreground">
                {text("Home.categories.converters")}
              </span>
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="hidden size-5 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:me-6 sm:block"
            />
          </Link>
        </li>
      </ul>
    </section>
  );
}

function Featured({ locale, text }: { locale: EnabledLocale; text: Text }) {
  return (
    <section aria-labelledby="featured-heading" className="border-y border-border bg-muted/50">
      <div className={SECTION}>
        <SectionHeading
          id="featured-heading"
          eyebrow={text("Home.featured.eyebrow")}
          title={text("Home.featured.heading")}
          lead={text("Home.featured.lead")}
        />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools(FEATURED_TOOL_IDS).map((tool) => (
            <li key={tool.id}>
              <ToolCard tool={tool} locale={locale} headingLevel={3} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks({ text }: { text: Text }) {
  const steps = ["step1", "step2", "step3"] as const;
  return (
    <section aria-labelledby="how-heading" className={SECTION}>
      <SectionHeading
        id="how-heading"
        eyebrow={text("Home.how.eyebrow")}
        title={text("Home.how.heading")}
      />
      <ol className="grid gap-4 md:grid-cols-3 md:gap-5">
        {steps.map((step, i) => (
          <li
            key={step}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 sm:p-7"
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground tabular-nums"
            >
              {i + 1}
            </span>
            <h3 className="mt-2 text-lg font-semibold">{text(`Home.how.${step}.title`)}</h3>
            <p className="text-pretty text-muted-foreground">{text(`Home.how.${step}.text`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * FAQ after the shadcnspace block faq-01, as native disclosure widgets: the
 * answers stay in the HTML (search engines, FAQ JSON-LD) and need no script.
 */
function Faq({ faq, text }: { faq: { question: string; answer: string }[]; text: Text }) {
  return (
    <section aria-labelledby="faq-heading" className={cn(SECTION, "max-w-3xl pt-0 sm:pt-0")}>
      <SectionHeading
        id="faq-heading"
        eyebrow={text("Home.faq.eyebrow")}
        title={text("Home.faq.heading")}
        center
      />
      <div className="flex flex-col gap-3">
        {faq.map((entry, i) => (
          <details
            key={entry.question}
            open={i === 0}
            className="group rounded-2xl border border-border bg-card transition-colors open:bg-muted/60"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl p-5 text-lg font-medium sm:p-6 [&::-webkit-details-marker]:hidden">
              {entry.question}
              <PlusIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
              />
            </summary>
            <p className="-mt-1 max-w-prose px-5 pb-5 text-pretty text-muted-foreground sm:px-6 sm:pb-6">
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function ClosingCta({ locale, text }: { locale: EnabledLocale; text: Text }) {
  return (
    <section aria-labelledby="cta-heading" className={cn(WRAP, "pb-24")}>
      <div className="relative isolate flex flex-col items-center gap-8 overflow-hidden rounded-3xl bg-primary px-8 py-14 text-center text-primary-foreground sm:px-12 sm:py-20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(50%_80%_at_90%_10%,oklch(1_0_0/0.18),transparent_70%)]"
        />
        {/* Faint dot grid, the smallest pattern there is. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)] bg-[radial-gradient(currentColor_1px,transparent_1px)] bg-[size:20px_20px] opacity-15"
        />
        <div className="flex max-w-2xl flex-col items-center gap-3">
          <h2
            id="cta-heading"
            className="text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl"
          >
            {text("Home.cta.heading")}
          </h2>
          <p className="text-lg opacity-85">{text("Home.cta.text")}</p>
        </div>
        <a
          href={routePath({ page: "tool", toolId: HERO_START_TOOL_ID }, locale)}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-background px-7 text-base font-medium text-foreground shadow-sm transition-colors hover:bg-background/90 focus-visible:outline-primary-foreground"
        >
          {text("Home.cta.button")}
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </a>
      </div>
    </section>
  );
}
