/**
 * The social media editor itself: `/de/social-media-editor/bearbeiten`,
 * `/en/social-media-editor/edit`. A static shell; the editor runs in the
 * browser, loads Konva on demand and keeps designs in IndexedDB. The
 * landing page carries the texts, so this page is `noindex` and not in
 * the sitemap.
 */
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SocialEditor } from "@/components/social-editor/social-editor";
import { routePath } from "@/i18n/paths";
import { routing } from "@/i18n/routing";
import { socialEditorMessages } from "@/lib/client-messages";
import { pageAlternates } from "@/lib/seo/alternates";

type SocialEditorPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: SocialEditorPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "SocialEditor.page" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: pageAlternates({ page: "socialEditorApp" }, locale),
    robots: { index: false, follow: true },
  };
}

export default async function SocialEditorPage({ params }: SocialEditorPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <NextIntlClientProvider messages={socialEditorMessages(await getMessages({ locale }))}>
        <SocialEditor
          landingHref={routePath({ page: "socialEditor" }, locale)}
          myDesignsHref={routePath({ page: "myDesigns" }, locale)}
          brandKitHref={routePath({ page: "brandKit" }, locale)}
        />
      </NextIntlClientProvider>
    </div>
  );
}
