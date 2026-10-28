/**
 * Colour helpers for the curated collections: our own colours are defined
 * as OKLCH triples (lightness 0 to 1, chroma, hue in degrees) and turned
 * into hex once, with the engine's gamut mapping. Every text format shown
 * on a page comes from the engine's formatters, like the colour tools.
 */
import {
  bestTextColor,
  formatColor,
  formatRatio,
  oklchToHex,
  type ColorFormat,
} from "@motivo/engine";

/** `[lightness 0..1, chroma, hue in degrees]`. */
export type Lch = readonly [l: number, c: number, h: number];

/** Formats shown next to each swatch (and offered for copying). */
export const SWATCH_FORMATS = ["hex", "rgb", "oklch"] as const satisfies readonly ColorFormat[];
export type SwatchFormat = (typeof SWATCH_FORMATS)[number];

export function lchToHex([l, c, h]: Lch): string {
  return oklchToHex({ l, c, h });
}

export interface ColorInfo {
  hex: string;
  values: Record<SwatchFormat, string>;
  /** Black or white, whichever reads better on the colour. */
  text: string;
  /** Contrast of `text` on the colour, e.g. "7.2". */
  ratio: string;
}

export function colorInfo(hex: string): ColorInfo {
  const values = Object.fromEntries(
    SWATCH_FORMATS.map((format) => [format, formatColor(hex, format)]),
  ) as Record<SwatchFormat, string>;
  const best = bestTextColor(hex);
  return { hex: values.hex, values, text: best.color, ratio: formatRatio(best.ratio) };
}

/** How many similar items an item page links to. */
export const RELATED_COUNT = 6;

/**
 * Similar items: the same group first (in collection order, starting after
 * the item), then the following items of other groups.
 */
export function relatedItems<T extends { id: string; group: string }>(
  all: readonly T[],
  item: T,
  max: number = RELATED_COUNT,
): T[] {
  const index = all.indexOf(item);
  const rotated = [...all.slice(index + 1), ...all.slice(0, Math.max(index, 0))];
  const same = rotated.filter((other) => other.group === item.group);
  const rest = rotated.filter((other) => other.group !== item.group);
  return [...same, ...rest].slice(0, max);
}
