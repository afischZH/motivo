/**
 * Contrast of the "Im Kontext ansehen" text on the motif (W1-AP02). Pure, so
 * it is tested without a browser: the caller samples the motif under the
 * text block as RGBA pixels.
 */

/** Text colours of the mock hero: near black and white, as on most sites. */
export const CONTEXT_TEXT_COLORS = {
  dark: [17, 17, 17],
  light: [255, 255, 255],
} as const;

export type ContextTone = keyof typeof CONTEXT_TEXT_COLORS;

/** The text block of the mock hero, as fractions of the motif (left, top, width, height). */
export const CONTEXT_TEXT_BOX = { x: 0.08, y: 0.3, width: 0.56, height: 0.42 } as const;

/** Share of the pixels under the text that may be below the reported contrast. */
export const CONTRAST_TOLERANCE = 0.05;

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2 relative luminance of an sRGB colour (0 to 255 per channel). */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 contrast ratio of two luminances (1 to 21). */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Contrast of `tone` text over the sampled pixels: the ratio that all but
 * the weakest `CONTRAST_TOLERANCE` of the pixels reach (single stars or
 * specks do not decide). Transparent pixels count as the white page.
 */
export function textContrast(pixels: ArrayLike<number>, tone: ContextTone): number {
  const [tr, tg, tb] = CONTEXT_TEXT_COLORS[tone];
  const text = luminance(tr, tg, tb);
  const ratios: number[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = (pixels[i + 3] ?? 255) / 255;
    // Over white: c * a + 255 * (1 - a).
    const mix = (c: number) => c * a + 255 * (1 - a);
    ratios.push(
      contrastRatio(
        text,
        luminance(mix(pixels[i] ?? 0), mix(pixels[i + 1] ?? 0), mix(pixels[i + 2] ?? 0)),
      ),
    );
  }
  if (ratios.length === 0) return 1;
  ratios.sort((x, y) => x - y);
  return ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * CONTRAST_TOLERANCE))] ?? 1;
}

/** The tone with the better contrast, and both ratios. */
export function bestTone(pixels: ArrayLike<number>): {
  tone: ContextTone;
  ratios: Record<ContextTone, number>;
} {
  const ratios = { dark: textContrast(pixels, "dark"), light: textContrast(pixels, "light") };
  return { tone: ratios.light > ratios.dark ? "light" : "dark", ratios };
}

/** WCAG level of large text (the hero title) and of body text. */
export function contrastLevel(ratio: number): "aaa" | "aa" | "aa-large" | "fail" {
  if (ratio >= 7) return "aaa";
  if (ratio >= 4.5) return "aa";
  if (ratio >= 3) return "aa-large";
  return "fail";
}
