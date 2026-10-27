import { createRng } from "@motivo/engine";
import type { Metadata } from "next";
import { hasLocale, useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { use } from "react";

import { routing } from "@/i18n/routing";
import { pageAlternates } from "@/lib/seo/alternates";

type HomePageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return { alternates: pageAlternates({ page: "home" }, locale) };
}

export default function HomePage({ params }: HomePageProps) {
  const { locale } = use(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = useTranslations("Home");

  // Proves the workspace wiring: the engine is consumed as TypeScript source.
  const sample = createRng(1).next().toFixed(4);

  return (
    <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:py-24">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
      <p className="max-w-prose text-base text-muted-foreground">{t("lead")}</p>
      <div
        aria-hidden="true"
        className="aspect-video w-full max-w-2xl rounded-card border border-border bg-canvas"
      />
      <p className="text-sm text-muted-foreground">
        {t("engineCheck")}{" "}
        <output data-testid="engine-sample" className="tabular-nums">
          {sample}
        </output>
      </p>
    </div>
  );
}
