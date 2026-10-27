import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Converter } from "@/components/convert/converter";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { CONVERTER_IDS, FAQ_COUNT, INVERSE_CONVERTER, isConverterId } from "@/lib/convert/ids";

type ConverterPageProps = Readonly<{ params: Promise<{ locale: string; converterId: string }> }>;

// Only the six known converters exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    CONVERTER_IDS.map((converterId) => ({ locale, converterId })),
  );
}

export async function generateMetadata({ params }: ConverterPageProps): Promise<Metadata> {
  const { locale, converterId } = await params;
  if (!hasLocale(routing.locales, locale) || !isConverterId(converterId)) return {};
  const t = await getTranslations({ locale, namespace: "Converters" });
  const brand = (await getTranslations({ locale, namespace: "Layout" }))("brand");

  return {
    title: `${t(`items.${converterId}.title`)} · ${brand}`,
    description: t(`items.${converterId}.description`),
  };
}

export default async function ConverterPage({ params }: ConverterPageProps) {
  const { locale, converterId } = await params;
  if (!hasLocale(routing.locales, locale) || !isConverterId(converterId)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Converters");

  const related = [
    INVERSE_CONVERTER[converterId],
    ...CONVERTER_IDS.filter((c) => c !== converterId && c !== INVERSE_CONVERTER[converterId]),
  ];
  const faq = Array.from({ length: FAQ_COUNT }, (_, i) => i + 1) as (1 | 2 | 3)[];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:py-14">
      <header className="flex flex-col gap-3">
        <nav aria-label={t("common.breadcrumb")}>
          <Link
            href="/convert"
            className="rounded-control text-sm text-link underline-offset-4 hover:underline"
          >
            {t("common.breadcrumb")}
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t(`items.${converterId}.title`)}
        </h1>
        <p className="max-w-prose text-base text-muted-foreground">
          {t(`items.${converterId}.description`)}
        </p>
      </header>

      <Converter id={converterId} />

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t("common.whatIsHeading")}</h2>
          <p className="max-w-prose text-muted-foreground">{t(`items.${converterId}.whatIs`)}</p>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">{t("common.howToHeading")}</h2>
          <p className="max-w-prose text-muted-foreground">{t(`items.${converterId}.howTo`)}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t("common.faqHeading")}</h2>
          <dl className="flex flex-col gap-4">
            {faq.map((n) => (
              <div key={n} className="flex flex-col gap-1">
                <dt className="font-medium">{t(`items.${converterId}.faq.q${n}`)}</dt>
                <dd className="text-muted-foreground">{t(`items.${converterId}.faq.a${n}`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("common.relatedHeading")}</h2>
        <ul className="flex flex-wrap gap-2">
          {related.map((other) => (
            <li key={other}>
              <Link
                href={`/convert/${other}`}
                className="inline-flex rounded-control border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                {t(`items.${other}.name`)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
