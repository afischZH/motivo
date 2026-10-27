/**
 * Text representations of hex colours for labels and code exports.
 */
import { hexToOklch, hexToRgb, rgbToHex } from "../color";
import { formatNumber } from "../curves";

export const COLOR_FORMATS = ["hex", "rgb", "hsl", "oklch"] as const;
export type ColorFormat = (typeof COLOR_FORMATS)[number];

/** Lowercase `#rrggbb` (expands `#rgb`). */
export function normalizeHex(hex: string): string {
  return rgbToHex(hexToRgb(hex));
}

/** 0 to 255 channels. */
export function hexToRgb255(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** HSL with hue in degrees and saturation/lightness in percent. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: s * 100, l: l * 100 };
}

/** `rgb(30, 144, 255)`: comma syntax for the widest tool support. */
export function formatRgb(hex: string): string {
  return `rgb(${hexToRgb255(hex).join(", ")})`;
}

/** `hsl(210, 100%, 55.9%)`. */
export function formatHsl(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return `hsl(${formatNumber(h, 0)}, ${formatNumber(s, 1)}%, ${formatNumber(l, 1)}%)`;
}

/**
 * `oklch(62.3% 0.214 259.8)` in the notation Tailwind v4 uses. Achromatic
 * colours get hue 0, which CSS treats like a missing hue at chroma 0.
 */
export function formatOklch(hex: string): string {
  const { l, c, h } = hexToOklch(hex);
  const achromatic = Number.isNaN(h) || c < 0.0005;
  const hue = achromatic ? "0" : formatNumber(h, 1);
  const chroma = achromatic ? "0" : formatNumber(c, 3);
  return `oklch(${formatNumber(l * 100, 1)}% ${chroma} ${hue})`;
}

export function formatColor(hex: string, format: ColorFormat): string {
  switch (format) {
    case "hex":
      return normalizeHex(hex);
    case "rgb":
      return formatRgb(hex);
    case "hsl":
      return formatHsl(hex);
    case "oklch":
      return formatOklch(hex);
  }
}

/**
 * Turns free text into a CSS custom property / Tailwind colour name:
 * lowercase ASCII letters, digits and single hyphens, starting with a
 * letter. Returns `fallback` if nothing usable is left.
 */
export function toCssName(text: string, fallback: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  return slug.length > 0 ? slug : fallback;
}
