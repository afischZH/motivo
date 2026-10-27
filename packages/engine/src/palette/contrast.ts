/**
 * WCAG 2.x contrast: relative luminance of sRGB colours and the contrast
 * ratio (L1 + 0.05) / (L2 + 0.05), from 1:1 to 21:1.
 */
import { hexToRgb } from "../color";

/** Linearises one gamma-encoded sRGB channel in [0, 1] (IEC 61966-2-1). */
function linear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a hex colour, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio between two hex colours, symmetric, in [1, 21]. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Conformance for normal-size text: AAA from 7:1, AA from 4.5:1, `aa-large`
 * from 3:1 (enough for large text and UI components only), else `fail`.
 */
export type WcagLevel = "aaa" | "aa" | "aa-large" | "fail";

export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return "aaa";
  if (ratio >= 4.5) return "aa";
  if (ratio >= 3) return "aa-large";
  return "fail";
}

/**
 * Formats a ratio with one decimal, rounded down, so a displayed value never
 * claims a pass the exact ratio misses (4.48 shows as 4.4, not 4.5).
 */
export function formatRatio(ratio: number): string {
  // The epsilon absorbs float noise such as 20.999999999999996 for #000/#fff.
  return (Math.floor(ratio * 10 + 1e-9) / 10).toFixed(1);
}

export interface TextColorChoice {
  color: string;
  ratio: number;
}

/** The candidate with the higher contrast on `background` (ties go to the first). */
export function bestTextColor(
  background: string,
  candidates: readonly [string, string] = ["#ffffff", "#000000"],
): TextColorChoice {
  const [a, b] = candidates;
  const ra = contrastRatio(background, a);
  const rb = contrastRatio(background, b);
  return rb > ra ? { color: b, ratio: rb } : { color: a, ratio: ra };
}
