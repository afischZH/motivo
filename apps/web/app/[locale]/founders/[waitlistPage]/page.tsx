/**
 * Waitlist result pages under the Founders section: confirmation result
 * (`bestaetigt`, `link-ungueltig`, `fehler`) after the API's redirect, and
 * the unsubscribe page the e-mail links to (token in the URL fragment, so it
 * never reaches a server log). Static and `noindex`.
 */
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { UnsubscribeForm } from "@/components/waitlist/unsubscribe-form";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import {
  WAITLIST_PAGE_SLUGS,
  waitlistPageFromSlug,
  waitlistPageSlug,
  type WaitlistPage,
} from "@/i18n/slugs";
import { routing } from "@/i18n/routing";
import { WAITLIST_RESULT_CLIENT_NAMESPACES, pickMessages } from "@/lib/client-messages";
import { pageAlternates } from "@/lib/seo/alternates";

type WaitlistPageProps = Readonly<{
  params: Promise<{ locale: string; waitlistPage: string }>;
}>;

export const dynamicParams = false;

/** The parent layout supplies the locale; slugs depend on it. */
export function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as EnabledLocale;
  return (Object.keys(WAITLIST_PAGE_SLUGS) as WaitlistPage[]).map((page) => ({
    waitlistPage: waitlistPageSlug(page, locale),
  }));
}

async function resolve(params: WaitlistPageProps["params"]) {
  const { locale, waitlistPage: slug } = await params;
  if (!hasLocale(routing.locales, locale)) return undefined;
  const page = waitlistPageFromSlug(slug, locale);
  return page ? { locale, page } : undefined;
}

export async function generateMetadata({ params }: WaitlistPageProps): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { locale, page } = resolved;
  const t = await getTranslations({ locale });
  return {
    title: t(`WaitlistResult.${page}.metaTitle`),
    alternates: pageAlternates({ page: "waitlist", waitlistPage: page }, locale),
    // Personal result pages: never in a search index.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function WaitlistResultPage({ params }: WaitlistPageProps) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { locale, page } = resolved;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "WaitlistResult" });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight" data-testid="waitlist-result-title">
        {t(`${page}.title`)}
      </h1>
      <p className="text-lg text-muted-foreground">{t(`${page}.text`)}</p>
      {page === "unsubscribe" && (
        <NextIntlClientProvider
          messages={pickMessages(await getMessages({ locale }), WAITLIST_RESULT_CLIENT_NAMESPACES)}
        >
          <UnsubscribeForm />
        </NextIntlClientProvider>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          {t("backHome")}
        </Link>
        {page !== "confirmed" && page !== "unsubscribe" && (
          <Link href="/founders" className={buttonVariants({ variant: "outline" })}>
            {t("backFounders")}
          </Link>
        )}
      </div>
    </div>
  );
}
