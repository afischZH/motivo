import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import type { EnabledLocale } from "@/i18n/locales";
import { LEGAL_CONFIG, isPlaceholder, legalPagesIndexable } from "@/lib/legal/config";
import { LEGAL_SECTIONS, OPERATOR_AFTER, type LegalPageId } from "@/lib/legal/sections";
import { pageAlternates } from "@/lib/seo/alternates";

interface Section {
  heading: string;
  paragraphs: string[];
}

export async function legalMetadata(page: LegalPageId, locale: EnabledLocale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "Legal" });
  const brand = (await getTranslations({ locale, namespace: "Layout" }))("brand");
  return {
    title: `${t(`${page}.metaTitle`)} · ${brand}`,
    description: t(`${page}.metaDescription`),
    alternates: pageAlternates({ page }, locale),
    // Drafts must not be indexed (lib/legal/config.ts).
    ...(legalPagesIndexable() ? {} : { robots: { index: false, follow: true } }),
  };
}

export async function LegalPage({ page, locale }: { page: LegalPageId; locale: EnabledLocale }) {
  const t = await getTranslations({ locale });
  const format = await getFormatter({ locale });
  const raw = (key: string) => t.raw(key as Parameters<typeof t.raw>[0]) as unknown;
  const title = t(`Legal.${page}.title`);
  const intro = page === "privacy" ? t("Legal.privacy.intro") : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12">
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          locale={locale}
          items={[
            { name: t("Seo.home"), route: { page: "home" } },
            { name: title, route: { page } },
          ]}
        />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Legal.lastUpdated", {
            date: format.dateTime(new Date(`${LEGAL_CONFIG.lastUpdated}T12:00:00Z`), {
              dateStyle: "long",
              timeZone: "UTC",
            }),
          })}
        </p>
        {!LEGAL_CONFIG.legalReviewed && (
          <div
            role="note"
            aria-labelledby="draft-title"
            data-testid="legal-draft-banner"
            className="flex flex-col gap-1 rounded-card border-2 border-primary bg-highlight p-4"
          >
            <p id="draft-title" className="font-semibold">
              {t("Legal.draftBanner.title")}
            </p>
            <p className="text-sm">{t("Legal.draftBanner.text")}</p>
          </div>
        )}
        {intro && <p className="text-lg text-muted-foreground">{intro}</p>}
      </div>

      {OPERATOR_AFTER[page] === null && <OperatorBlock locale={locale} />}

      {LEGAL_SECTIONS[page].map((id) => {
        const section = raw(`Legal.${page}.sections.${id}`) as Section;
        return (
          <div key={id} className="flex flex-col gap-8">
            <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
              <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-tight">
                {section.heading}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="leading-relaxed text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
            {OPERATOR_AFTER[page] === id && <OperatorBlock locale={locale} />}
          </div>
        );
      })}
    </div>
  );
}

/** Operator address from `LEGAL_CONFIG`; empty optional fields are left out. */
async function OperatorBlock({ locale }: { locale: EnabledLocale }) {
  const t = await getTranslations({ locale, namespace: "Legal.operator" });
  const op = LEGAL_CONFIG.operator;
  const optional = (value: string) => value.trim() !== "";

  return (
    <section aria-labelledby="operator-heading" className="flex flex-col gap-3">
      <h2 id="operator-heading" className="text-xl font-semibold tracking-tight">
        {t("heading")}
      </h2>
      <address className="flex flex-col gap-1 not-italic" data-testid="legal-operator">
        <span className="font-medium">{op.name}</span>
        {optional(op.legalForm) && <span>{op.legalForm}</span>}
        <span>{op.street}</span>
        <span>
          {op.postalCode} {op.city}
        </span>
        <span>{op.country}</span>
        <span>
          {t("email")}:{" "}
          {isPlaceholder(op.email) ? (
            op.email
          ) : (
            <a href={`mailto:${op.email}`} className="text-link underline underline-offset-4">
              {op.email}
            </a>
          )}
        </span>
        {optional(op.registerId) && (
          <span>
            {t("register")}: {op.registerId}
          </span>
        )}
        {optional(op.vatId) && (
          <span>
            {t("vat")}: {op.vatId}
          </span>
        )}
      </address>
    </section>
  );
}
