/**
 * Operator details for the imprint and the privacy policy. The owner fills
 * them in here once; both pages and both languages read from this object.
 * Values in square brackets are placeholders and render as such.
 *
 * While `legalReviewed` is false, both legal pages show a "draft, pending
 * legal review" banner, are `noindex` and stay out of the sitemap. Set it to
 * true only after a lawyer has checked the texts in `messages/*.json`
 * (namespace `Legal`).
 */
export interface Operator {
  name: string;
  legalForm: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  registerId: string;
  vatId: string;
}

export interface LegalConfig {
  legalReviewed: boolean;
  lastUpdated: string;
  operator: Operator;
}

export const LEGAL_CONFIG: LegalConfig = {
  legalReviewed: false,
  /** ISO date of the current version of the texts, shown as "last updated". */
  lastUpdated: "2026-10-27",
  operator: {
    /** Person or company responsible for the site. */
    name: "[Name]",
    /** Legal form, e.g. "Einzelunternehmen"; leave empty if none. */
    legalForm: "[Rechtsform]",
    street: "[Adresse]",
    postalCode: "[PLZ]",
    city: "[Ort]",
    country: "[Land]",
    email: "[E-Mail]",
    /** Commercial register entry (e.g. CHE-123.456.789) or empty. */
    registerId: "[UID/Handelsregister]",
    /** VAT number or empty while not VAT-registered. */
    vatId: "[MWST-Nr.]",
  },
};

/** Whether a value is still an unfilled placeholder like `[Name]`. */
export function isPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}

/** Placeholder fields that still need a value (for the report and tests). */
export function missingOperatorFields(operator: Operator = LEGAL_CONFIG.operator): string[] {
  return Object.entries(operator)
    .filter(([, value]) => isPlaceholder(value))
    .map(([key]) => key);
}

/** Legal pages are indexable only after the legal review. */
export function legalPagesIndexable(config: Pick<LegalConfig, "legalReviewed"> = LEGAL_CONFIG) {
  return config.legalReviewed;
}
