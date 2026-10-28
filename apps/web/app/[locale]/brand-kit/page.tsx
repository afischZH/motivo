/**
 * Brand Kit (M3-AP05): palettes, logos and own shapes of the user's brand,
 * kept in this browser. The page is a static shell; the data lives in
 * IndexedDB and never reaches a server. Personal, so `noindex` and not in
 * the sitemap.
 */
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { BrandKit } from "@/components/brand-kit/brand-kit";
import { routing } from "@/i18n/routing";
import { BRAND_KIT_CLIENT_NAMESPACES, pickMessages } from "@/lib/client-messages";
import { pageAlternates } from "@/lib/seo/alternates";

type BrandKitPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: BrandKitPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "BrandKit.page" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: pageAlternates({ page: "brandKit" }, locale),
    robots: { index: false, follow: true },
  };
}

export default async function BrandKitPage({ params }: BrandKitPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <NextIntlClientProvider
      messages={pickMessages(await getMessages({ locale }), BRAND_KIT_CLIENT_NAMESPACES)}
    >
      <BrandKit />
    </NextIntlClientProvider>
  );
}
