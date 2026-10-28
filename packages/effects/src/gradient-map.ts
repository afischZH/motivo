/**
 * Gradient maps: a colour per tone value, between evenly spaced stops,
 * mixed in OKLab (no muddy midpoints between complementary colours).
 */
import { hexToRgb, oklabToRgb, rgbToOklab } from "@musterli/engine";

/** Entries of a gradient lookup table (one per byte value). */
export const GRADIENT_LUT_SIZE = 256;

const to8 = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);

/**
 * RGB bytes (`3 × 256`) of the gradient through `stops` (hex, dark end
 * first), evenly spaced. One stop gives a flat colour.
 */
export function gradientLut(stops: readonly string[]): Uint8Array {
  if (stops.length === 0) throw new RangeError("gradientLut: at least one stop is required");
  const labs = stops.map((hex) => rgbToOklab(hexToRgb(hex)));
  const lut = new Uint8Array(GRADIENT_LUT_SIZE * 3);
  const segments = Math.max(1, labs.length - 1);
  for (let i = 0; i < GRADIENT_LUT_SIZE; i++) {
    const f = (i / (GRADIENT_LUT_SIZE - 1)) * segments;
    const k = Math.min(Math.floor(f), segments - 1);
    const a = labs[Math.min(k, labs.length - 1)];
    const b = labs[Math.min(k + 1, labs.length - 1)];
    if (!a || !b) continue;
    const t = f - k;
    const rgb = oklabToRgb({
      l: a.l + (b.l - a.l) * t,
      a: a.a + (b.a - a.a) * t,
      b: a.b + (b.b - a.b) * t,
    });
    lut[i * 3] = to8(rgb.r);
    lut[i * 3 + 1] = to8(rgb.g);
    lut[i * 3 + 2] = to8(rgb.b);
  }
  return lut;
}
