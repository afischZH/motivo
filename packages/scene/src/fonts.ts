/**
 * Fonts of text layers (M6-AP03). A text layer draws with `fontFamily`, a
 * CSS family list, and remembers where that family comes from in `font`:
 *
 *  - `library`: one of the self-hosted OFL fonts below. The editor registers
 *    them under an internal family name (`musterli-<id>`) so a font of the
 *    same name installed on the device never takes their place, and the
 *    preview looks the same on every machine.
 *  - `brand`: a font of the user's brand kit (IndexedDB only), registered as
 *    `musterli-brand-<id>`. Without the brand kit entry (another device, a
 *    deleted font) the family list falls back to the system stack.
 *
 * Text layers without `font` (AP02 scenes) use a system stack.
 *
 * Only data and pure helpers: the font files and their loading live in the
 * app (`components/social-editor/font-files.ts`, `fonts.ts`).
 */
// Namespace import keeps zod tree-shakable (see tool-registry/common.ts).
import * as z from "zod";

export const FONT_CATEGORIES = ["sans", "serif", "display", "mono", "handwriting"] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

/** System stacks: the fallback after every font and the "System" choices of the picker. */
export const SYSTEM_FONT_STACKS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as const;
export type SystemFontId = keyof typeof SYSTEM_FONT_STACKS;

export interface LibraryFont {
  /** Stable id: font reference in scenes and folder of the files. */
  id: string;
  /** Name shown in the picker (the font's own name, not translated). */
  name: string;
  category: FontCategory;
  /** Weights with files, ascending. Other weights fall back to the nearest one. */
  weights: readonly number[];
}

/**
 * The self-hosted fonts, all under the SIL Open Font License 1.1, built
 * from google/fonts by `assets/fonts/build-fonts.py` (licences and versions
 * in `assets/LICENSES.md`). Order: picker order within a category.
 */
export const LIBRARY_FONTS: readonly LibraryFont[] = [
  { id: "inter", name: "Inter", category: "sans", weights: [400, 700] },
  { id: "roboto-flex", name: "Roboto Flex", category: "sans", weights: [400, 700] },
  { id: "poppins", name: "Poppins", category: "sans", weights: [400, 700] },
  { id: "montserrat", name: "Montserrat", category: "sans", weights: [400, 700] },
  { id: "space-grotesk", name: "Space Grotesk", category: "sans", weights: [400, 700] },
  { id: "fraunces", name: "Fraunces", category: "serif", weights: [400, 700] },
  { id: "eb-garamond", name: "EB Garamond", category: "serif", weights: [400, 700] },
  { id: "dm-serif-display", name: "DM Serif Display", category: "display", weights: [400] },
  { id: "bebas-neue", name: "Bebas Neue", category: "display", weights: [400] },
  { id: "jetbrains-mono", name: "JetBrains Mono", category: "mono", weights: [400, 700] },
  { id: "caveat", name: "Caveat", category: "handwriting", weights: [400, 700] },
  { id: "pacifico", name: "Pacifico", category: "handwriting", weights: [400] },
];

/** The font of new text layers. */
export const DEFAULT_LIBRARY_FONT_ID = "inter";

const FONT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Brand kit ids (128 random bits as hex) and anything of that shape. */
const BRAND_FONT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Where the font of a text layer comes from; `name` keeps it readable without the source. */
export const fontRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("library"),
    id: z.string().max(64).regex(FONT_ID),
    name: z.string().max(120),
  }),
  z.object({
    kind: z.literal("brand"),
    id: z.string().regex(BRAND_FONT_ID),
    name: z.string().max(120),
  }),
]);
export type FontRef = z.output<typeof fontRefSchema>;

export function libraryFont(id: string): LibraryFont | undefined {
  return LIBRARY_FONTS.find((f) => f.id === id);
}

/** Fallback stack after a font of a category (handwriting and display fall back to sans). */
export function fallbackStack(category: FontCategory | null): string {
  if (category === "serif") return SYSTEM_FONT_STACKS.serif;
  if (category === "mono") return SYSTEM_FONT_STACKS.mono;
  return SYSTEM_FONT_STACKS.sans;
}

/** Internal family name a library font is registered under. */
export function libraryFamilyName(id: string): string {
  return `musterli-${id}`;
}

/** Internal family name a brand font is registered under. */
export function brandFamilyName(id: string): string {
  return `musterli-brand-${id}`;
}

/** The registered family of a font reference. */
export function familyNameOf(ref: FontRef): string {
  return ref.kind === "library" ? libraryFamilyName(ref.id) : brandFamilyName(ref.id);
}

/** `fontFamily` of a text layer that uses `ref`: the registered family, then the fallback stack. */
export function fontFamilyFor(ref: FontRef): string {
  const category = ref.kind === "library" ? (libraryFont(ref.id)?.category ?? null) : null;
  return `${familyNameOf(ref)}, ${fallbackStack(category)}`;
}

/** The reference of a library font (its name taken from the catalogue). */
export function libraryFontRef(id: string): FontRef {
  return { kind: "library", id, name: libraryFont(id)?.name ?? id };
}

/**
 * The weight a font actually draws for `weight`, by the CSS font matching
 * rules (400 to 500 look up first, below 400 look down, above 500 look up).
 */
export function nearestWeight(available: readonly number[], weight: number): number {
  if (available.length === 0) return weight;
  if (available.includes(weight)) return weight;
  const sorted = [...available].sort((a, b) => a - b);
  const below = sorted.filter((w) => w < weight).reverse();
  const above = sorted.filter((w) => w > weight);
  if (weight >= 400 && weight <= 500) {
    const up = above.find((w) => w <= 500);
    if (up !== undefined) return up;
    return below[0] ?? above[0] ?? weight;
  }
  if (weight < 400) return below[0] ?? above[0] ?? weight;
  return above[0] ?? below[0] ?? weight;
}

/** The system stack a family list is, if it is one (AP02 scenes, the "System" choices). */
export function systemFontOf(fontFamily: string): SystemFontId | null {
  for (const [id, stack] of Object.entries(SYSTEM_FONT_STACKS)) {
    if (stack === fontFamily) return id as SystemFontId;
  }
  return null;
}
