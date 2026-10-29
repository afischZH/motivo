import { ArrowLeftRightIcon, ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
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
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:py-12">
      <PageHeader title={t("index.title")} lead={t("index.lead")} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONVERTER_IDS.map((id) => (
          <li key={id}>
            <Link
              href={routeHref({ page: "converter", converterId: id }, locale)}
              className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-[border-color,box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:border-ring hover:shadow-[0_12px_32px_-16px_oklch(0.3_0.12_275/0.35)]"
            >
              <span className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-link shadow-xs">
                  <ArrowLeftRightIcon aria-hidden="true" className="size-5" />
                </span>
                <ArrowRightIcon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-lg font-semibold">{t(`items.${id}.name`)}</span>
                <span className="text-sm text-muted-foreground">
                  {t(`items.${id}.description`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{t("common.privacy")}</p>
    </div>
  );
}
