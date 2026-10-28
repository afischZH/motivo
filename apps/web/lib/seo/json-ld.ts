/**
 * Structured data (schema.org JSON-LD) for SEO pages. Only facts we can
 * stand behind: the tools run in the browser and are free to use. No
 * ratings, reviews or prices beyond the free offer.
 */

export type JsonLd = Readonly<Record<string, unknown>>;

/**
 * Serializes JSON-LD for an inline `<script type="application/ld+json">`.
 * `<`, `>` and `&` are escaped as Unicode escapes (still valid JSON), so no
 * text can close the script element or open a comment; U+2028/U+2029 are
 * escaped for old JavaScript parsers.
 */
export function serializeJsonLd(data: JsonLd | readonly JsonLd[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export interface WebApplicationInput {
  name: string;
  description: string;
  url: string;
  /** BCP 47 language of the page. */
  inLanguage: string;
  /** Absolute URL of a representative image (the OG image). */
  image?: string | undefined;
  /** schema.org applicationCategory, e.g. "DesignApplication". */
  category: string;
  /** Currency of the free offer (price 0). */
  currency: string;
}

/** A browser tool that is free to use. */
export function webApplication(input: WebApplicationInput): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: input.inLanguage,
    ...(input.image ? { image: input.image } : {}),
    applicationCategory: input.category,
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and a current web browser.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: input.currency },
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export function faqPage(entries: readonly FaqEntry[], inLanguage: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage,
    mainEntity: entries.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.answer },
    })),
  };
}

export interface Crumb {
  name: string;
  /** Absolute URL. */
  url: string;
}

export function breadcrumbList(crumbs: readonly Crumb[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export interface CollectionPageInput {
  name: string;
  description: string;
  /** Absolute URL of the page. */
  url: string;
  inLanguage: string;
  /** Absolute URL of a representative image (the OG image). */
  image?: string | undefined;
  /** The items in display order, with absolute URLs. */
  items: readonly Crumb[];
}

/** A curated collection page (gradients, palettes) with its items as an `ItemList`. */
export function collectionPage(input: CollectionPageInput): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: input.inLanguage,
    ...(input.image ? { image: input.image } : {}),
    isAccessibleForFree: true,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: input.items.length,
      itemListElement: input.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };
}
