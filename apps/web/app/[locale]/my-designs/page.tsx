/**
 * "Meine Designs" (M3-AP04): the designs saved in this browser. The page is
 * a static shell; the list lives in IndexedDB and is read in the browser,
 * nothing about it reaches a server. Personal, so `noindex` and not in the
 * sitemap.
 */
import { registry } from "@musterli/tool-registry";
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { MyDesigns } from "@/components/designs/my-designs";
import { routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { MY_DESIGNS_CLIENT_NAMESPACES, pickMessages } from "@/lib/client-messages";
import { pageAlternates } from "@/lib/seo/alternates";

type MyDesignsPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: MyDesignsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Designs.page" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: pageAlternates({ page: "myDesigns" }, locale),
    robots: { index: false, follow: true },
  };
}

export default async function MyDesignsPage({ params }: MyDesignsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  // Tool keys are built from the id, which the typed message keys cannot know.
  const tool = t as unknown as (key: string) => string;
  const tools = Object.fromEntries(
    registry.list().map((def) => [
      def.id,
      {
        name: tool(`tools.${def.id}.name`),
        href: routePath({ page: "tool", toolId: def.id }, locale),
      },
    ]),
  );

  return (
    <NextIntlClientProvider
      messages={pickMessages(await getMessages({ locale }), MY_DESIGNS_CLIENT_NAMESPACES)}
    >
      <MyDesigns tools={tools} toolsHref={routePath({ page: "tools" }, locale)} />
    </NextIntlClientProvider>
  );
}
