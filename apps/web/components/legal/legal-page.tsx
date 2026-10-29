import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import type { EnabledLocale } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
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
  const intro = page === "imprint" ? null : t(`Legal.${page}.intro`);
  const lastUpdated = page === "terms" ? LEGAL_CONFIG.terms.lastUpdated : LEGAL_CONFIG.lastUpdated;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            items={[
              { name: t("Seo.home"), route: { page: "home" } },
              { name: title, route: { page } },
            ]}
          />
        }
        title={title}
        lead={intro ?? undefined}
      >
        <p className="text-sm text-muted-foreground">
          {t("Legal.lastUpdated", {
            date: format.dateTime(new Date(`${lastUpdated}T12:00:00Z`), {
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
            className="flex w-full flex-col gap-1 rounded-2xl border border-primary/40 bg-highlight p-4"
          >
            <p id="draft-title" className="font-semibold">
              {t("Legal.draftBanner.title")}
            </p>
            <p className="text-sm">{t("Legal.draftBanner.text")}</p>
          </div>
        )}
      </PageHeader>

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
                  {richParagraph(paragraph)}
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

const LINK_CLASS = "rounded-control text-link underline underline-offset-4";

/** Internal pages a legal paragraph may link to with `<tag>text</tag>`. */
const PARAGRAPH_LINKS = {
  imprint: "/imprint",
  privacy: "/privacy",
  support: "/support",
} as const;

/**
 * Renders a paragraph from the messages: `<imprint>`, `<privacy>` and
 * `<support>` become localized links, `{jurisdiction}` the value from
 * `LEGAL_CONFIG` (highlighted while it is still a placeholder). Plain text
 * otherwise; nothing here is user input.
 */
function richParagraph(text: string): ReactNode[] {
  const pattern = /<(imprint|privacy|support)>([^<]*)<\/\1>|\{jurisdiction\}/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    nodes.push(text.slice(last, match.index));
    const tag = match[1] as keyof typeof PARAGRAPH_LINKS | undefined;
    if (tag) {
      nodes.push(
        <Link key={match.index} href={PARAGRAPH_LINKS[tag]} className={LINK_CLASS}>
          {match[2]}
        </Link>,
      );
    } else {
      const value = LEGAL_CONFIG.terms.jurisdiction;
      nodes.push(
        isPlaceholder(value) ? (
          <strong
            key={match.index}
            className="font-semibold text-foreground"
            data-testid="legal-placeholder"
          >
            {value}
          </strong>
        ) : (
          value
        ),
      );
    }
    last = match.index + match[0].length;
  }
  nodes.push(text.slice(last));
  return nodes;
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
