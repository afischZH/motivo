import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { LegalPage, legalMetadata } from "@/components/legal/legal-page";
import { routing } from "@/i18n/routing";

type TermsPageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return legalMetadata("terms", locale);
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <LegalPage page="terms" locale={locale} />;
}
