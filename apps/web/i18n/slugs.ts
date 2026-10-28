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
import type { ToolCategory } from "@musterli/tool-registry";

import type { ConverterId } from "@/lib/convert/ids";

import { ALL_LOCALES, SLUG_FALLBACK_LOCALE, type AnyLocale, type LocalizedSlugs } from "./locales";

/** Tool id (from `@musterli/tool-registry`) to its localized slugs. */
export const TOOL_SLUGS: Readonly<Record<string, LocalizedSlugs>> = {
  "css-gradient": { de: "css-verlauf-generator", en: "css-gradient-generator" },
  blob: { de: "blob-generator", en: "blob-generator" },
  "svg-waves": { de: "svg-wellen-generator", en: "svg-wave-generator" },
  "polka-dots": { de: "punktmuster-generator", en: "polka-dot-pattern-generator" },
  "seamless-patterns": { de: "nahtlose-muster-generator", en: "seamless-pattern-generator" },
  "geometric-patterns": {
    de: "geometrische-muster-generator",
    en: "geometric-pattern-generator",
  },
  "noise-grain": { de: "rauschen-koernung-generator", en: "noise-grain-generator" },
  "grid-patterns": { de: "rastermuster-generator", en: "grid-pattern-generator" },
  confetti: { de: "konfetti-generator", en: "confetti-generator" },
  "starry-sky": { de: "sternenhimmel-generator", en: "starry-sky-generator" },
  "dieter-dots": { de: "dieter-dots-generator", en: "dieter-dots-generator" },
  "blob-composition": { de: "blob-hintergrund-generator", en: "blob-background-generator" },
  doodles: { de: "doodle-hintergrund-generator", en: "doodle-background-generator" },
  "svg-charts": { de: "svg-diagramm-generator", en: "svg-chart-generator" },
  "mesh-gradient": { de: "mesh-verlauf-generator", en: "mesh-gradient-generator" },
  "blurry-gradient": {
    de: "verschwommener-verlauf-generator",
    en: "blurry-gradient-generator",
  },
  "striped-gradient": { de: "streifenverlauf-generator", en: "striped-gradient-generator" },
  "palette-generator": { de: "farbpaletten-generator", en: "color-palette-generator" },
  "tints-shades": { de: "farbabstufungen-generator", en: "tints-and-shades-generator" },
  "tailwind-palette": {
    de: "tailwind-farbpalette-generator",
    en: "tailwind-color-palette-generator",
  },
  "palette-from-image": { de: "farbpalette-aus-bild", en: "color-palette-from-image" },
  "css-patterns": { de: "css-muster-generator", en: "css-pattern-generator" },
  "glass-effects": { de: "glas-effekt-generator", en: "glassmorphism-generator" },
  "bento-grid": { de: "bento-grid-generator", en: "bento-grid-generator" },
  "contrast-checker": { de: "kontrast-checker", en: "contrast-checker" },
  "css-shadow": { de: "css-schatten-generator", en: "css-shadow-generator" },
  guilloche: { de: "guilloche-generator", en: "guilloche-pattern-generator" },
  "topo-lines": { de: "hoehenlinien-generator", en: "topographic-pattern-generator" },
  "flow-field": { de: "flow-field-generator", en: "flow-field-generator" },
  "low-poly": { de: "low-poly-und-voronoi-generator", en: "low-poly-voronoi-generator" },
  terrazzo: { de: "terrazzo-muster-generator", en: "terrazzo-pattern-generator" },
};

/**
 * CSS pattern library id (`CSS_PATTERNS` in `@musterli/engine`) to its
 * localized slugs, used in `/[locale]/<cssPatterns section>/<slug>`. The
 * contract test in `slugs.test.ts` requires an entry for every pattern.
 */
export const PATTERN_SLUGS: Readonly<Record<string, LocalizedSlugs>> = {
  polka: { de: "punkte", en: "polka-dots" },
  "polka-staggered": { de: "versetzte-punkte", en: "staggered-dots" },
  "dots-duo": { de: "zweifarbige-punkte", en: "two-tone-dots" },
  "dots-mixed": { de: "gemischte-punkte", en: "mixed-dots" },
  rings: { de: "ringe", en: "rings" },
  target: { de: "zielscheiben", en: "targets" },
  "grid-lines": { de: "rasterlinien", en: "grid-lines" },
  "graph-paper": { de: "millimeterpapier", en: "graph-paper" },
  "dotted-grid": { de: "raster-mit-knoten", en: "dotted-grid" },
  crosshatch: { de: "kreuzschraffur", en: "crosshatch" },
  bricks: { de: "backsteine", en: "bricks" },
  tiles: { de: "fliesen", en: "tiles" },
  stripes: { de: "streifen", en: "stripes" },
  candy: { de: "zuckerstange", en: "candy-stripes" },
  pinstripes: { de: "nadelstreifen", en: "pinstripes" },
  tricolor: { de: "dreifarbige-streifen", en: "tricolor-stripes" },
  gingham: { de: "vichy-karo", en: "gingham" },
  plaid: { de: "schottenkaro", en: "plaid" },
  barcode: { de: "strichcode", en: "barcode" },
  ripples: { de: "wellenringe", en: "ripples" },
  sunrise: { de: "sonnenaufgang", en: "sunrise" },
  "wavy-lines": { de: "wellenlinien", en: "wavy-lines" },
  scallops: { de: "bogenkante", en: "scallops" },
  scales: { de: "schuppen", en: "scales" },
  rainbow: { de: "regenbogen", en: "rainbows" },
  checkerboard: { de: "schachbrett", en: "checkerboard" },
  diamonds: { de: "rauten", en: "diamonds" },
  argyle: { de: "argyle", en: "argyle" },
  zigzag: { de: "zickzack", en: "zigzag" },
  chevron: { de: "chevron", en: "chevron" },
  triangles: { de: "dreiecke", en: "triangles" },
  pinwheel: { de: "windrad", en: "pinwheel" },
  crosses: { de: "kreuze", en: "crosses" },
  squares: { de: "quadrate", en: "squares" },
};

/**
 * Curated gradient collection (`lib/collections/gradients.ts`) id to its
 * localized slugs, used in `/[locale]/<gradients section>/<slug>`. The
 * contract test in `slugs.test.ts` requires an entry for every gradient.
 */
export const GRADIENT_SLUGS: Readonly<Record<string, LocalizedSlugs>> = {
  alpenglow: { de: "alpengluehen", en: "alpenglow" },
  apricot: { de: "aprikose", en: "apricot" },
  embers: { de: "glut", en: "embers" },
  "pumpkin-patch": { de: "kuerbisfeld", en: "pumpkin-patch" },
  terracotta: { de: "terrakotta", en: "terracotta" },
  "cinnamon-star": { de: "zimtstern", en: "cinnamon-star" },
  glacier: { de: "gletscher", en: "glacier" },
  "mountain-lake": { de: "bergsee", en: "mountain-lake" },
  "north-wind": { de: "nordwind", en: "north-wind" },
  "rhine-falls": { de: "rheinfall", en: "rhine-falls" },
  "foehn-sky": { de: "foehnhimmel", en: "foehn-sky" },
  peppermint: { de: "pfefferminz", en: "peppermint" },
  "candy-floss": { de: "zuckerwatte", en: "candy-floss" },
  "peach-blossom": { de: "pfirsichbluete", en: "peach-blossom" },
  "lavender-field": { de: "lavendelfeld", en: "lavender-field" },
  "morning-dew": { de: "morgentau", en: "morning-dew" },
  macaron: { de: "macaron", en: "macaron" },
  "soap-bubble": { de: "seifenblase", en: "soap-bubble" },
  kingfisher: { de: "eisvogel", en: "kingfisher" },
  "neon-night": { de: "neonnacht", en: "neon-night" },
  parrot: { de: "papagei", en: "parrot" },
  hibiscus: { de: "hibiskus", en: "hibiscus" },
  carnival: { de: "fasnacht", en: "carnival" },
  "northern-lights": { de: "nordlicht", en: "northern-lights" },
  observatory: { de: "sternwarte", en: "observatory" },
  "fir-forest": { de: "tannenwald", en: "fir-forest" },
  "deep-sea": { de: "tiefsee", en: "deep-sea" },
  blackberry: { de: "brombeere", en: "blackberry" },
  volcano: { de: "vulkan", en: "volcano" },
  espresso: { de: "espresso", en: "espresso" },
  "sea-of-fog": { de: "nebelmeer", en: "sea-of-fog" },
  linen: { de: "leinen", en: "linen" },
  pebble: { de: "kieselstein", en: "pebble" },
  parchment: { de: "pergament", en: "parchment" },
  "dawn-gray": { de: "morgengrau", en: "dawn-gray" },
  slate: { de: "schiefer", en: "slate" },
};

/**
 * Curated palette collection (`lib/collections/palettes.ts`) id to its
 * localized slugs, used in `/[locale]/<palettes section>/<slug>`. The
 * contract test in `slugs.test.ts` requires an entry for every palette.
 */
export const PALETTE_SLUGS: Readonly<Record<string, LocalizedSlugs>> = {
  "clay-oven": { de: "lehmofen", en: "clay-oven" },
  "autumn-forest": { de: "herbstwald", en: "autumn-forest" },
  vineyard: { de: "rebberg", en: "vineyard" },
  "spice-market": { de: "gewuerzmarkt", en: "spice-market" },
  sandstone: { de: "sandstein", en: "sandstone" },
  moorland: { de: "moorland", en: "moorland" },
  lemongrass: { de: "zitronengras", en: "lemongrass" },
  lido: { de: "seebad", en: "lido" },
  "garden-party": { de: "gartenparty", en: "garden-party" },
  "mint-ice": { de: "minzeis", en: "mint-ice" },
  "spring-market": { de: "fruehlingsmarkt", en: "spring-market" },
  "alpine-meadow": { de: "bergwiese", en: "alpine-meadow" },
  sorbet: { de: "sorbet", en: "sorbet" },
  "cloud-castle": { de: "wolkenschloss", en: "cloud-castle" },
  gelato: { de: "glace", en: "gelato" },
  watercolor: { de: "aquarell", en: "watercolor" },
  peony: { de: "pfingstrose", en: "peony" },
  "chalk-drawing": { de: "kreidezeichnung", en: "chalk-drawing" },
  "pop-art": { de: "pop-art", en: "pop-art" },
  "street-party": { de: "strassenfest", en: "street-party" },
  signal: { de: "signal", en: "signal" },
  hummingbird: { de: "kolibri", en: "hummingbird" },
  workshop: { de: "werkstatt", en: "workshop" },
  fireworks: { de: "feuerwerk", en: "fireworks" },
  "night-train": { de: "nachtzug", en: "night-train" },
  "ocean-trench": { de: "ozeangraben", en: "ocean-trench" },
  fireside: { de: "kaminfeuer", en: "fireside" },
  "velvet-curtain": { de: "samtvorhang", en: "velvet-curtain" },
  "forest-night": { de: "waldnacht", en: "forest-night" },
  planetarium: { de: "planetarium", en: "planetarium" },
  concrete: { de: "beton", en: "concrete" },
  "wool-sweater": { de: "wollpullover", en: "wool-sweater" },
  granite: { de: "granit", en: "granite" },
  "print-shop": { de: "druckerei", en: "print-shop" },
  "timber-cabin": { de: "holzhaus", en: "timber-cabin" },
  "winter-sky": { de: "winterhimmel", en: "winter-sky" },
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
  "css-effects": { de: "css-effekte", en: "css-effects" },
};

/** Localized segment between `tools` and a category slug. */
export const CATEGORY_SEGMENT = {
  de: "kategorie",
  en: "category",
} as const satisfies LocalizedSlugs;

/**
 * Localized first path segment of each section (internal name to slug). The
 * internal name is also the folder under `app/[locale]`. `imprint`,
 * `privacy` and `terms` are the legal pages linked from the footer, `support`
 * is the donation page.
 */
export const SECTION_SLUGS = {
  tools: { de: "tools", en: "tools" },
  convert: { de: "konverter", en: "convert" },
  cssPatterns: { de: "css-muster", en: "css-patterns" },
  imprint: { de: "impressum", en: "imprint" },
  privacy: { de: "datenschutz", en: "privacy" },
  terms: { de: "nutzungsbedingungen", en: "terms" },
  support: { de: "unterstuetzen", en: "support" },
  gradients: { de: "farbverlaeufe", en: "gradients" },
  palettes: { de: "farbpaletten", en: "color-palettes" },
  // Saved designs in this browser: noindex, never in the sitemap.
  myDesigns: { de: "meine-designs", en: "my-designs" },
  // The brand kit in this browser: noindex, never in the sitemap.
  brandKit: { de: "brand-kit", en: "brand-kit" },
} as const satisfies Record<string, LocalizedSlugs>;

export type Section = keyof typeof SECTION_SLUGS;

/**
 * First segments of retired sections (the Founders waitlist, removed with the
 * switch to donations on 2026-10-28). Any path below them, in any locale,
 * gets one permanent redirect to the section that replaced it.
 */
export const RETIRED_SECTION_SLUGS: Readonly<Record<string, Section>> = {
  founders: "support",
  "founders-warteliste": "support",
  "founders-waitlist": "support",
};

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

/** Slug of a CSS library pattern in a locale. A pattern without an entry falls back to its id. */
export function patternSlug(patternId: string, locale: AnyLocale): string {
  const entry = PATTERN_SLUGS[patternId];
  return entry ? pick(entry, locale) : patternId;
}

/** Pattern id for the slug this locale uses, or undefined. */
export function patternIdFromSlug(slug: string, locale: AnyLocale): string | undefined {
  return findId(PATTERN_SLUGS, (entry) => pick(entry, locale) === slug);
}

/** Pattern id for any known spelling (id or a slug of any locale), for redirects. */
export function patternIdFromAnySlug(value: string): string | undefined {
  if (Object.hasOwn(PATTERN_SLUGS, value)) return value;
  return findId(PATTERN_SLUGS, (entry) => hasSlug(entry, value));
}

/** The two curated collections: gradients and palettes. */
export type CollectionKind = "gradients" | "palettes";

const COLLECTION_SLUGS: Readonly<Record<CollectionKind, Readonly<Record<string, LocalizedSlugs>>>> =
  { gradients: GRADIENT_SLUGS, palettes: PALETTE_SLUGS };

/** Slug of a collection item in a locale. An item without an entry falls back to its id. */
export function collectionItemSlug(kind: CollectionKind, id: string, locale: AnyLocale): string {
  const entry = COLLECTION_SLUGS[kind][id];
  return entry ? pick(entry, locale) : id;
}

/** Item id for the slug this locale uses, or undefined. */
export function collectionItemFromSlug(
  kind: CollectionKind,
  slug: string,
  locale: AnyLocale,
): string | undefined {
  return findId(COLLECTION_SLUGS[kind], (entry) => pick(entry, locale) === slug);
}

/** Item id for any known spelling (id or a slug of any locale), for redirects. */
export function collectionItemFromAnySlug(kind: CollectionKind, value: string): string | undefined {
  const map = COLLECTION_SLUGS[kind];
  if (Object.hasOwn(map, value)) return value;
  return findId(map, (entry) => hasSlug(entry, value));
}
