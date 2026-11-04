import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { routing } from "@/i18n/routing";

import "../globals.css";

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

const MAIN_ID = "main";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleLayoutProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Layout" });

  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href={`#${MAIN_ID}`}
          className="bg-accent sr-only rounded-full px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          {t("skipLink")}
        </a>
        <header className="border-border/60 bg-background/80 sticky top-0 z-30 border-b backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <span className="flex items-center gap-2 font-semibold tracking-tight">
              <span
                aria-hidden="true"
                className="size-6 rounded-lg bg-[conic-gradient(from_200deg,#7c6cff,#ff7ab6,#ffc36b,#5ee0c1,#7c6cff)] shadow-sm"
              />
              {t("brand")}
            </span>
            <span className="bg-accent-soft text-accent-text rounded-full px-2.5 py-0.5 text-xs font-medium">
              {t("badge")}
            </span>
            <nav className="ml-auto flex gap-1 text-sm" aria-label="Language">
              {routing.locales.map((code) => (
                <Link
                  key={code}
                  href={`/${code}`}
                  hrefLang={code}
                  aria-current={code === locale ? "page" : undefined}
                  className="text-muted hover:text-foreground aria-[current=page]:text-foreground inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2.5 uppercase aria-[current=page]:font-semibold"
                >
                  {code}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main id={MAIN_ID} tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <footer className="border-border text-muted border-t text-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6">
            <p>{t("footer")}</p>
            <a
              href="https://musterli.app"
              className="text-accent-text underline-offset-4 hover:underline"
            >
              {t("musterli")}
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
