/**
 * One-colour halftone (docs/TOOLS.md E2): luminance and tone curve per
 * pixel, mean darkness per rotated cell, one dot or line segment per cell
 * in the ink colour on paper (or on transparency). Raster and SVG output
 * share the cell analysis.
 */
import { hexToRgb255 } from "@musterli/engine";
import { createPixelBuffer, type PixelBuffer } from "./buffer";
import {
  coverageLevels,
  halftoneScreen,
  halftoneSvgPlate,
  plateRow,
  screenMeans,
  type HalftonePlate,
  type HalftoneShape,
} from "./halftone";
import { normalizeWeights, type LumaWeights } from "./luminance";
import { toneCurve, type ToneOptions } from "./tone";

export interface HalftoneOptions extends ToneOptions {
  /** Cell edge in pixels of the input. */
  readonly cell: number;
  /** Screen angle in degrees. */
  readonly angle: number;
  readonly shape: HalftoneShape;
  /** Dot colour (hex). */
  readonly ink: string;
  /** Paper colour (hex) or `"transparent"`. */
  readonly paper: string;
  readonly weights: LumaWeights;
  /** Dots for the light parts instead of the dark ones (light ink on dark paper). */
  readonly invert: boolean;
}

/** The plate of a one-colour halftone for `input`. */
export function halftonePlate(input: PixelBuffer, o: HalftoneOptions): HalftonePlate {
  const w = normalizeWeights(o.weights);
  const tone = toneCurve(o);
  const screen = halftoneScreen(input.width, input.height, o.cell, o.angle);
  const invert = o.invert;
  const [means] = screenMeans(input, [screen], (r, g, b, out) => {
    const l = Math.round(r * w.r + g * w.g + b * w.b);
    const v = tone[l > 255 ? 255 : l] ?? 0;
    out[0] = invert ? v : 1 - v;
  });
  return { screen, levels: coverageLevels(means ?? new Float32Array(0)), shape: o.shape };
}

const TRANSPARENT = "transparent";

/** The halftone as pixels, the size of `input`. */
export function applyHalftone(input: PixelBuffer, o: HalftoneOptions): PixelBuffer {
  const plate = halftonePlate(input, o);
  const out = createPixelBuffer(input.width, input.height);
  const d = out.data;
  const [ir, ig, ib] = hexToRgb255(o.ink);
  const clear = o.paper === TRANSPARENT;
  const [pr, pg, pb] = clear ? [ir, ig, ib] : hexToRgb255(o.paper);
  const row = new Float32Array(input.width);
  for (let y = 0, i = 0; y < input.height; y++) {
    plateRow(plate, y, row);
    for (let x = 0; x < input.width; x++, i += 4) {
      const a = row[x] ?? 0;
      if (clear) {
        d[i] = ir;
        d[i + 1] = ig;
        d[i + 2] = ib;
        d[i + 3] = a * 255;
      } else {
        d[i] = pr + (ir - pr) * a;
        d[i + 1] = pg + (ig - pg) * a;
        d[i + 2] = pb + (ib - pb) * a;
        d[i + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * The halftone as SVG in design units (`design`), from an `input` of any
 * resolution (`o.cell` in its pixels): a paper rectangle and one plate.
 */
export function halftoneSvg(
  input: PixelBuffer,
  o: HalftoneOptions,
  design: { width: number; height: number },
): string {
  const plate = halftonePlate(input, o);
  const scale = input.width / Math.max(1, design.width);
  const { width, height } = design;
  const paper =
    o.paper === TRANSPARENT ? "" : `<rect width="${width}" height="${height}" fill="${o.paper}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `${paper}${halftoneSvgPlate(plate, o.ink, scale, design)}</svg>`
  );
}
