import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { routeHref } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { CONVERTER_IDS } from "@/lib/convert/ids";
import { pageAlternates } from "@/lib/seo/alternates";

type ConvertIndexProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: ConvertIndexProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Converters" });
  const brand = (await getTranslations({ locale, namespace: "Layout" }))("brand");

  return {
    title: `${t("index.metaTitle")} · ${brand}`,
    description: t("index.metaDescription"),
    alternates: pageAlternates({ page: "convert" }, locale),
  };
}

export default async function ConvertIndexPage({ params }: ConvertIndexProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Converters");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("index.title")}</h1>
        <p className="max-w-prose text-base text-muted-foreground">{t("index.lead")}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONVERTER_IDS.map((id) => (
          <li key={id}>
            <Link
              href={routeHref({ page: "converter", converterId: id }, locale)}
              className="flex h-full flex-col gap-2 rounded-card border border-border bg-card p-5 transition-colors hover:bg-accent"
            >
              <span className="text-lg font-semibold">{t(`items.${id}.name`)}</span>
              <span className="text-sm text-muted-foreground">{t(`items.${id}.description`)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{t("common.privacy")}</p>
    </div>
  );
}
