/**
 * Founders page (`/de/founders-warteliste`, `/en/founders-waitlist`): what
 * the lifetime licence means and the waitlist form. Static; the form asks
 * the API at runtime whether the waitlist is on.
 */
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { WaitlistSection } from "@/components/waitlist/waitlist-section";
import { routing } from "@/i18n/routing";
import { pageAlternates } from "@/lib/seo/alternates";
import { pageOpenGraph } from "@/lib/seo/page-meta";
import { FOUNDERS_SEATS } from "@/lib/waitlist/constants";

type FoundersPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

const POINTS = ["once", "future", "honest"] as const;

export async function generateMetadata({ params }: FoundersPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale });
  const title = t("Founders.metaTitle");
  const description = t("Founders.metaDescription", { seats: FOUNDERS_SEATS });
  const route = { page: "founders" } as const;
  return {
    title,
    description,
    alternates: pageAlternates(route, locale),
    openGraph: pageOpenGraph({ route, locale, siteName: t("Layout.brand"), title, description }),
  };
}

export default async function FoundersPage({ params }: FoundersPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const title = t("Founders.title");

  return (
    <div className="flex flex-col gap-12 pb-20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-8 sm:pt-12">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: title, route: { page: "founders" } },
          ]}
        />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          {t("Founders.lead", { seats: FOUNDERS_SEATS })}
        </p>
        <ul className="grid gap-4 pt-4 md:grid-cols-3">
          {POINTS.map((point) => (
            <li key={point} className="flex flex-col gap-2 rounded-card border border-border p-5">
              <h2 className="text-lg font-semibold">{t(`Founders.points.${point}.title`)}</h2>
              <p className="text-muted-foreground">{t(`Founders.points.${point}.text`)}</p>
            </li>
          ))}
        </ul>
      </div>
      <WaitlistSection locale={locale} />
    </div>
  );
}
