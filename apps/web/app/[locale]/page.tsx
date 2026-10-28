/**
 * Home page: a "motif machine" hero whose reels show presets rendered by the
 * tools themselves (static SVG files from `/motifs`), then value proposition,
 * categories, featured tools, "how it works", FAQ and a closing call to
 * action. Built from the registry and `lib/home.ts`; the machine is the only
 * client component.
 */
import { registry, type AnyToolDefinition, type ToolCategory } from "@motivo/tool-registry";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Bricolage_Grotesque } from "next/font/google";
import { notFound } from "next/navigation";

import { MotifMachine, type MachineReel } from "@/components/home/motif-machine";
import { JsonLdScript } from "@/components/seo/json-ld";
import { MotifImage } from "@/components/seo/motif-image";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { routeHref, routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { categoryTools, populatedCategories } from "@/lib/catalogue";
import { FEATURED_TOOL_IDS, HERO_START_TOOL_ID, HERO_TOOL_IDS, HOME_FAQ_COUNT } from "@/lib/home";
import { pageAlternates } from "@/lib/seo/alternates";
import { hasStaticMotif, motifPath, staticDesigns } from "@/lib/seo/motifs";
import { faqPage } from "@/lib/seo/json-ld";
import { pageOpenGraph } from "@/lib/seo/page-meta";
import { toolKeys } from "@/lib/seo/tool-content";
import { cn } from "@/lib/utils";

// Display face of the home page only (SIL OFL), self-hosted by next/font.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

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
    <div className={cn(display.variable, "flex flex-col")}>
      <JsonLdScript data={faqPage(faq, locale)} />
      <Hero locale={locale} text={text} />
      <Values text={text} />
      <Categories locale={locale} text={text} />
      <Featured locale={locale} text={text} />
      <HowItWorks text={text} />
      <Faq faq={faq} text={text} />
      <ClosingCta locale={locale} text={text} />
    </div>
  );
}

const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const SECTION = cn(WRAP, "flex flex-col gap-8 py-20 sm:py-28");
const H2 =
  "font-display text-4xl font-extrabold tracking-[-0.03em] text-balance sm:text-5xl lg:text-6xl";
const LEAD = "max-w-prose text-lg text-muted-foreground";
const INK_LINK =
  "rounded-control font-semibold underline decoration-2 underline-offset-4 hover:decoration-4";

function Hero({ locale, text }: { locale: EnabledLocale; text: Text }) {
  const startName = text(toolKeys(HERO_START_TOOL_ID).name);
  const reels: MachineReel[] = tools(HERO_TOOL_IDS).map((tool) => ({
    toolId: tool.id,
    name: text(toolKeys(tool.id).name),
    href: routePath({ page: "landing", toolId: tool.id }, locale),
    frames: staticDesigns(tool).map((design) => motifPath(tool.id, design.id)),
  }));

  return (
    <section
      aria-labelledby="hero-heading"
      className="on-machine border-b-[3px] border-machine-ink bg-machine text-machine-foreground"
    >
      <div
        className={cn(
          WRAP,
          "grid items-center gap-14 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:py-28",
        )}
      >
        <div className="flex flex-col items-start gap-7">
          <h1
            id="hero-heading"
            className="font-display text-[clamp(3.5rem,11vw,7.25rem)] leading-[0.88] font-extrabold tracking-[-0.04em] text-balance"
          >
            {text("Home.hero.title")}
          </h1>
          <p className="max-w-[34ch] text-lg text-machine-muted sm:text-xl">
            {text("Home.hero.lead")}
          </p>
          <div className="flex w-full flex-col items-stretch gap-4 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
            <Link
              href="/tools"
              className="machine-press font-display inline-flex h-14 items-center justify-center rounded-full px-8 text-lg font-bold"
            >
              {text("Home.hero.ctaPrimary")}
            </Link>
            {/* Full page load, like every other editor link. */}
            <a
              href={routePath({ page: "tool", toolId: HERO_START_TOOL_ID }, locale)}
              className={cn(INK_LINK, "self-start py-2 text-lg sm:self-auto")}
            >
              {text("Home.hero.ctaSecondary", { tool: startName })}
            </a>
          </div>
          <p className="text-sm text-machine-muted">{text("Home.hero.hint")}</p>
        </div>

        <MotifMachine
          reels={reels}
          labels={{
            machine: text("Home.machine.label"),
            spin: text("Home.machine.spin"),
            key: text("Home.hero.spaceHint"),
            // Placeholders pass through and are filled in on the client.
            round: text("Home.machine.round", { n: "{n}" }),
            landed: text("Home.machine.landed", { tools: "{tools}" }),
            open: text("Home.hero.showcaseLink", { tool: "{tool}" }),
          }}
        />
      </div>
    </section>
  );
}

function Values({ text }: { text: Text }) {
  const items = ["free", "local", "donations"] as const;
  return (
    <section aria-labelledby="values-heading" className={SECTION}>
      <h2 id="values-heading" className={H2}>
        {text("Home.values.heading")}
      </h2>
      <ul className="grid gap-x-10 gap-y-10 md:grid-cols-3">
        {items.map((item) => (
          <li key={item} className="flex flex-col gap-3 border-t-[3px] border-foreground pt-6">
            <h3 className="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
              {text(`Home.values.${item}.title`)}
            </h3>
            <p className="text-muted-foreground">{text(`Home.values.${item}.text`)}</p>
            {item === "donations" && (
              <Link href="/support" className={cn(INK_LINK, "mt-1 self-start")}>
                {text("Footer.support")}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ink-framed window, the machine's reel language reused for every tile. */
const WINDOW =
  "group flex h-full flex-col overflow-hidden rounded-2xl border-[3px] border-foreground bg-card shadow-[0_4px_0_var(--foreground)] transition-transform duration-150 ease-out hover:-translate-y-1 focus-visible:-translate-y-1";

/**
 * Cover motif of a category tile: its first tool that no earlier tile shows,
 * so categories sharing tools (gradients, CSS patterns) do not look alike.
 */
function categoryCover(category: ToolCategory, used: Set<string>): AnyToolDefinition | undefined {
  const candidates = categoryTools(category).filter(hasStaticMotif);
  const cover = candidates.find((tool) => !used.has(tool.id)) ?? candidates[0];
  if (cover) used.add(cover.id);
  return cover;
}

function Categories({ locale, text }: { locale: EnabledLocale; text: Text }) {
  const used = new Set<string>();
  return (
    <section aria-labelledby="categories-heading" className={cn(SECTION, "pt-0 sm:pt-0")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h2 id="categories-heading" className={H2}>
            {text("Home.categories.heading")}
          </h2>
          <p className={LEAD}>{text("Home.categories.lead")}</p>
        </div>
        <Link href="/tools" className={INK_LINK}>
          {text("Home.categories.all")}
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {populatedCategories().map((category) => {
          const cover = categoryCover(category, used);
          return (
            <li key={category}>
              <Link href={routeHref({ page: "category", category }, locale)} className={WINDOW}>
                <span className="block aspect-[4/3] overflow-hidden border-b-[3px] border-foreground bg-muted">
                  {cover && (
                    <MotifImage
                      tool={cover}
                      alt=""
                      className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                    />
                  )}
                </span>
                <span className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
                  <span className="font-display text-lg font-bold tracking-[-0.01em] sm:text-xl">
                    {text(`Categories.${category}.name`)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {text("Catalogue.toolCount", { count: categoryTools(category).length })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <Link href="/convert" className={WINDOW}>
            <span
              aria-hidden="true"
              className="font-display flex aspect-[4/3] items-center justify-center border-b-[3px] border-foreground bg-machine text-xl font-extrabold tracking-[-0.03em] text-machine-foreground sm:text-3xl"
            >
              SVG ⇄ CSS
            </span>
            <span className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
              <span className="font-display text-lg font-bold tracking-[-0.01em] sm:text-xl">
                {text("Categories.converters.name")}
              </span>
              <span className="text-sm text-muted-foreground">
                {text("Home.categories.converters")}
              </span>
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}

function Featured({ locale, text }: { locale: EnabledLocale; text: Text }) {
  return (
    <section
      aria-labelledby="featured-heading"
      className="border-y-[3px] border-foreground bg-muted"
    >
      <div className={SECTION}>
        <div className="flex flex-col gap-3">
          <h2 id="featured-heading" className={H2}>
            {text("Home.featured.heading")}
          </h2>
          <p className={LEAD}>{text("Home.featured.lead")}</p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools(FEATURED_TOOL_IDS).map((tool) => {
            const name = text(toolKeys(tool.id).name);
            return (
              <li key={tool.id}>
                <article className={cn(WINDOW, "relative")}>
                  <span className="flex h-48 items-center justify-center border-b-[3px] border-foreground bg-background p-5">
                    <MotifImage
                      tool={tool}
                      alt=""
                      className="max-h-full w-auto rounded-lg border-2 border-foreground"
                    />
                  </span>
                  <span className="flex flex-1 flex-col gap-2 p-5">
                    <h3 className="font-display text-xl font-bold tracking-[-0.01em]">
                      {/* The stretched link makes the whole tile clickable. */}
                      <Link
                        href={routeHref({ page: "landing", toolId: tool.id }, locale)}
                        className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-ring"
                      >
                        {name}
                      </Link>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {text(toolKeys(tool.id).description)}
                    </p>
                    <a
                      href={routePath({ page: "tool", toolId: tool.id }, locale)}
                      aria-label={text("Catalogue.openEditorFor", { tool: name })}
                      className={cn(INK_LINK, "relative z-10 mt-auto self-start pt-2 text-sm")}
                    >
                      {text("Catalogue.openEditor")}
                    </a>
                  </span>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks({ text }: { text: Text }) {
  const steps = ["step1", "step2", "step3"] as const;
  return (
    <section
      aria-labelledby="how-heading"
      className="on-machine border-b-[3px] border-machine-ink bg-machine text-machine-foreground"
    >
      <div className={SECTION}>
        <h2 id="how-heading" className={H2}>
          {text("Home.how.heading")}
        </h2>
        <ol className="grid gap-10 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step} className="flex flex-col gap-4">
              <span
                aria-hidden="true"
                className="font-display text-8xl leading-none font-extrabold tracking-[-0.04em] text-lever tabular-nums"
              >
                {i + 1}
              </span>
              <h3 className="font-display text-2xl font-bold tracking-[-0.02em]">
                {text(`Home.how.${step}.title`)}
              </h3>
              <p className="text-machine-muted">{text(`Home.how.${step}.text`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq({ faq, text }: { faq: { question: string; answer: string }[]; text: Text }) {
  return (
    <section aria-labelledby="faq-heading" className={SECTION}>
      <h2 id="faq-heading" className={H2}>
        {text("Home.faq.heading")}
      </h2>
      <dl className="grid gap-x-12 gap-y-10 md:grid-cols-2">
        {faq.map((entry) => (
          <div
            key={entry.question}
            className="flex flex-col gap-2 border-t-[3px] border-foreground pt-5"
          >
            <dt className="font-display text-xl font-bold tracking-[-0.01em]">{entry.question}</dt>
            <dd className="text-muted-foreground">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ClosingCta({ locale, text }: { locale: EnabledLocale; text: Text }) {
  return (
    <section aria-labelledby="cta-heading" className={cn(WRAP, "pb-24")}>
      <div className="machine-cabinet flex flex-col items-start gap-8 rounded-[2rem] p-8 text-lever-foreground sm:p-12 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <h2
            id="cta-heading"
            className="font-display text-5xl leading-[0.95] font-extrabold tracking-[-0.04em] text-balance sm:text-6xl"
          >
            {text("Home.cta.heading")}
          </h2>
          <p className="text-lg">{text("Home.cta.text")}</p>
        </div>
        <a
          href={routePath({ page: "tool", toolId: HERO_START_TOOL_ID }, locale)}
          className="lever-button font-display inline-flex h-14 shrink-0 items-center justify-center rounded-full px-8 text-lg font-bold"
        >
          {text("Home.cta.button")}
        </a>
      </div>
    </section>
  );
}
