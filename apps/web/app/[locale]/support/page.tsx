/**
 * Support page (M3-AP14): why Musterli is free and what donations pay for,
 * with a plain link to the external donation provider. Static; the link
 * comes from `NEXT_PUBLIC_DONATION_URL` at build time (`lib/donation.ts`).
 * Without it, the page shows a neutral "link follows soon" note instead of a
 * button. No script, no widget, no tracking.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { routing } from "@/i18n/routing";
import { donationUrl } from "@/lib/donation";
import { pageAlternates } from "@/lib/seo/alternates";
import { pageOpenGraph } from "@/lib/seo/page-meta";

type SupportPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

const ROUTE = { page: "support" } as const;
const FACTS = ["free", "private", "license"] as const;
const USES = ["domain", "hosting", "development"] as const;

const SECTION = "flex flex-col gap-4";
const H2 = "text-2xl font-semibold tracking-tight";

export async function generateMetadata({ params }: SupportPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  const title = t("Support.metaTitle");
  const description = t("Support.metaDescription");
  return {
    title: `${title} · ${t("Layout.brand")}`,
    description,
    alternates: pageAlternates(ROUTE, locale),
    openGraph: pageOpenGraph({
      route: ROUTE,
      locale,
      siteName: t("Layout.brand"),
      title,
      description,
    }),
  };
}

export default async function SupportPage({ params }: SupportPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const url = donationUrl();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-12 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: t("Support.title"), route: ROUTE },
          ]}
        />
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t("Support.title")}
        </h1>
        <p className="text-lg text-muted-foreground">{t("Support.lead")}</p>
      </div>

      <section aria-labelledby="facts-heading" className={SECTION}>
        <h2 id="facts-heading" className={H2}>
          {t("Support.facts.heading")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {FACTS.map((fact) => (
            <li key={fact} className="flex flex-col gap-2 rounded-card border border-border p-5">
              <h3 className="font-semibold">{t(`Support.facts.${fact}.title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`Support.facts.${fact}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="uses-heading" className={SECTION}>
        <h2 id="uses-heading" className={H2}>
          {t("Support.uses.heading")}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground marker:text-link">
          {USES.map((use) => (
            <li key={use}>{t(`Support.uses.${use}`)}</li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="donate-heading"
        data-testid="support-donate"
        className="flex flex-col items-start gap-4 rounded-card border-2 border-primary bg-highlight p-6"
      >
        <h2 id="donate-heading" className={H2}>
          {t("Support.donate.heading")}
        </h2>
        <p>{t("Support.donate.text")}</p>
        {url ? (
          <>
            <a
              href={url}
              rel="noopener noreferrer"
              data-testid="support-donate-link"
              className={buttonVariants({ size: "lg" })}
            >
              {t("Support.donate.button")}
            </a>
            <p className="text-sm text-muted-foreground">{t("Support.donate.external")}</p>
          </>
        ) : (
          <div data-testid="support-donate-soon" className="flex flex-col gap-1">
            <p className="font-semibold">{t("Support.donate.soon")}</p>
            <p className="text-sm text-muted-foreground">{t("Support.donate.soonText")}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="other-heading" className={SECTION}>
        <h2 id="other-heading" className={H2}>
          {t("Support.other.heading")}
        </h2>
        <p className="text-muted-foreground">{t("Support.other.text")}</p>
        <p className="font-medium">{t("Support.thanks")}</p>
      </section>
    </div>
  );
}
