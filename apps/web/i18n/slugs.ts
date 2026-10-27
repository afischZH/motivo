/**
 * Localized URL slugs: the single source for tool and converter URLs.
 *
 * Plain data plus pure lookups, so the proxy (legacy redirects), server pages
 * (metadata, hreflang) and the client language switcher can all import it
 * without pulling in the registry or any messages.
 *
 * Adding a tool = one entry in `TOOL_SLUGS`. The contract test in
 * `slugs.test.ts` fails if a registered tool lacks a slug in an enabled locale.
 * Slugs are lowercase ASCII words joined by "-", unique per locale, and stay
 * stable once published (changing one needs a redirect).
 */
import type { ToolCategory } from "@motivo/tool-registry";

import type { ConverterId } from "@/lib/convert/ids";

import { ALL_LOCALES, SLUG_FALLBACK_LOCALE, type AnyLocale, type LocalizedSlugs } from "./locales";

/** Tool id (from `@motivo/tool-registry`) to its localized slugs. */
export const TOOL_SLUGS: Readonly<Record<string, LocalizedSlugs>> = {
  "css-gradient": { de: "css-verlauf-generator", en: "css-gradient-generator" },
  blob: { de: "blob-generator", en: "blob-generator" },
  "svg-waves": { de: "svg-wellen-generator", en: "svg-wave-generator" },
  "polka-dots": { de: "punktmuster-generator", en: "polka-dot-pattern-generator" },
  "noise-grain": { de: "rauschen-koernung-generator", en: "noise-grain-generator" },
  "grid-patterns": { de: "rastermuster-generator", en: "grid-pattern-generator" },
  confetti: { de: "konfetti-generator", en: "confetti-generator" },
  "starry-sky": { de: "sternenhimmel-generator", en: "starry-sky-generator" },
  "dieter-dots": { de: "dieter-dots-generator", en: "dieter-dots-generator" },
  "palette-generator": { de: "farbpaletten-generator", en: "color-palette-generator" },
  "tints-shades": { de: "farbabstufungen-generator", en: "tints-and-shades-generator" },
  "tailwind-palette": {
    de: "tailwind-farbpalette-generator",
    en: "tailwind-color-palette-generator",
  },
  "palette-from-image": { de: "farbpalette-aus-bild", en: "color-palette-from-image" },
};

/** Converter id to its localized slugs. */
export const CONVERTER_SLUGS: Readonly<Record<ConverterId, LocalizedSlugs>> = {
  "svg-to-css": { de: "svg-zu-css", en: "svg-to-css" },
  "css-to-svg": { de: "css-zu-svg", en: "css-to-svg" },
  "svg-to-base64": { de: "svg-zu-base64", en: "svg-to-base64" },
  "base64-to-svg": { de: "base64-zu-svg", en: "base64-to-svg" },
  "image-to-base64": { de: "bild-zu-base64", en: "image-to-base64" },
  "base64-to-image": { de: "base64-zu-bild", en: "base64-to-image" },
};

/**
 * Catalogue category (`ToolCategory` from the registry) to its localized slug,
 * used in `/[locale]/tools/<CATEGORY_SEGMENT>/<slug>`. Every category has an
 * entry, also those without tools yet; `slugs.test.ts` checks the set.
 */
export const CATEGORY_SLUGS: Readonly<Record<ToolCategory, LocalizedSlugs>> = {
  patterns: { de: "muster", en: "patterns" },
  "css-patterns": { de: "css-muster", en: "css-patterns" },
  gradients: { de: "verlaeufe", en: "gradients" },
  backgrounds: { de: "hintergruende", en: "backgrounds" },
  "image-effects": { de: "bildeffekte", en: "image-effects" },
  colors: { de: "farben", en: "colors" },
  converters: { de: "konverter", en: "converters" },
  social: { de: "social-media", en: "social-media" },
  composer: { de: "composer", en: "composer" },
};

/** Localized segment between `tools` and a category slug. */
export const CATEGORY_SEGMENT = {
  de: "kategorie",
  en: "category",
} as const satisfies LocalizedSlugs;

/**
 * Localized first path segment of each section (internal name to slug). The
 * internal name is also the folder under `app/[locale]`. `imprint` and
 * `privacy` are the legal pages linked from the footer.
 */
export const SECTION_SLUGS = {
  tools: { de: "tools", en: "tools" },
  convert: { de: "konverter", en: "convert" },
  imprint: { de: "impressum", en: "imprint" },
  privacy: { de: "datenschutz", en: "privacy" },
} as const satisfies Record<string, LocalizedSlugs>;

export type Section = keyof typeof SECTION_SLUGS;

/** Slug format: lowercase ASCII words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function pick(entry: LocalizedSlugs, locale: AnyLocale): string {
  return entry[locale] ?? entry[SLUG_FALLBACK_LOCALE];
}

function findId<Id extends string>(
  map: Readonly<Record<Id, LocalizedSlugs>>,
  test: (entry: LocalizedSlugs) => boolean,
): Id | undefined {
  return (Object.keys(map) as Id[]).find((id) => test(map[id]));
}

function hasSlug(entry: LocalizedSlugs, value: string): boolean {
  return ALL_LOCALES.some((locale) => entry[locale] === value);
}

/** Slug of a tool in a locale. A tool without an entry falls back to its id. */
export function toolSlug(toolId: string, locale: AnyLocale): string {
  const entry = TOOL_SLUGS[toolId];
  return entry ? pick(entry, locale) : toolId;
}

/** Tool id for the slug this locale uses, or undefined. */
export function toolIdFromSlug(slug: string, locale: AnyLocale): string | undefined {
  return findId(TOOL_SLUGS, (entry) => pick(entry, locale) === slug);
}

/** Tool id for any known spelling (id or a slug of any locale), for redirects. */
export function toolIdFromAnySlug(value: string): string | undefined {
  if (Object.hasOwn(TOOL_SLUGS, value)) return value;
  return findId(TOOL_SLUGS, (entry) => hasSlug(entry, value));
}

export function converterSlug(id: ConverterId, locale: AnyLocale): string {
  return pick(CONVERTER_SLUGS[id], locale);
}

export function converterIdFromSlug(slug: string, locale: AnyLocale): ConverterId | undefined {
  return findId(CONVERTER_SLUGS, (entry) => pick(entry, locale) === slug);
}

export function converterIdFromAnySlug(value: string): ConverterId | undefined {
  if (Object.hasOwn(CONVERTER_SLUGS, value)) return value as ConverterId;
  return findId(CONVERTER_SLUGS, (entry) => hasSlug(entry, value));
}

export function sectionSlug(section: Section, locale: AnyLocale): string {
  return pick(SECTION_SLUGS[section], locale);
}

/** Section for any localized spelling of its first segment. */
export function sectionFromAnySlug(value: string): Section | undefined {
  return (Object.keys(SECTION_SLUGS) as Section[]).find((section) =>
    hasSlug(SECTION_SLUGS[section], value),
  );
}

export function categorySlug(category: ToolCategory, locale: AnyLocale): string {
  return pick(CATEGORY_SLUGS[category], locale);
}

export function categoryIdFromSlug(slug: string, locale: AnyLocale): ToolCategory | undefined {
  return findId(CATEGORY_SLUGS, (entry) => pick(entry, locale) === slug);
}

export function categoryIdFromAnySlug(value: string): ToolCategory | undefined {
  if (Object.hasOwn(CATEGORY_SLUGS, value)) return value as ToolCategory;
  return findId(CATEGORY_SLUGS, (entry) => hasSlug(entry, value));
}

export function categorySegment(locale: AnyLocale): string {
  return pick(CATEGORY_SEGMENT, locale);
}

/** Whether `value` is the category segment in any locale. */
export function isCategorySegment(value: string): boolean {
  return hasSlug(CATEGORY_SEGMENT, value);
}
