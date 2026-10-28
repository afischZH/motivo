import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/skip-link";
import { Telemetry } from "@/components/telemetry/telemetry";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/seo/site-url";
import { themeInitScript } from "@/lib/theme";

import "../globals.css";

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return { metadataBase: siteUrl(), title: t("title"), description: t("description") };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // The inline script adds the `dark` class before hydration.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        {/*
          No NextIntlClientProvider here: the layout's client components get
          their texts as props and links resolve on the server, so landing
          pages load no client message formatter. Pages with translated
          client components (editor, converters) add their own.
        */}
        <SkipLink />
        <SiteHeader />
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
        {/* Analytics and error reporting; renders nothing and is off without env vars. */}
        <Telemetry />
      </body>
    </html>
  );
}
