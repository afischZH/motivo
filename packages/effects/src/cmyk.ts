/**
 * CMYK halftone (docs/TOOLS.md E3): RGB to CMYK with a simple grey
 * component replacement, one halftone screen per ink at its own angle,
 * inks multiplied onto the paper colour, each plate optionally shifted
 * (misregistration). Raster and SVG output share the cell analysis.
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
import { toneCurve, type ToneOptions } from "./tone";

export const CMYK_INKS = ["c", "m", "y", "k"] as const;
export type CmykInk = (typeof CMYK_INKS)[number];

/** Classic screen angles in degrees (cyan 15°, magenta 75°, yellow 0°, black 45°). */
export const CMYK_CLASSIC_ANGLES: Readonly<Record<CmykInk, number>> = {
  c: 15,
  m: 75,
  y: 0,
  k: 45,
};

/**
 * Ink coverage (0 to 1 each) of an RGB colour (0 to 1 each): naive CMY,
 * then `gcr` (0 to 1) of the common grey moved to black and the colours
 * reduced accordingly (`(c - k) / (1 - k)`). Writes C, M, Y, K to `out`.
 */
export function rgbToCmyk(r: number, g: number, b: number, gcr: number, out: Float32Array): void {
  const c = 1 - r;
  const m = 1 - g;
  const y = 1 - b;
  const k = Math.min(c, m, y) * Math.min(1, Math.max(0, gcr));
  if (k >= 1) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return;
  }
  const rest = 1 - k;
  out[0] = (c - k) / rest;
  out[1] = (m - k) / rest;
  out[2] = (y - k) / rest;
  out[3] = k;
}

export interface CmykHalftoneOptions extends ToneOptions {
  /** Cell edge in pixels of the input. */
  readonly cell: number;
  /** Screen angle per ink in degrees. */
  readonly angles: Readonly<Record<CmykInk, number>>;
  readonly shape: HalftoneShape;
  /** Ink colours (hex), multiplied onto the paper. */
  readonly inks: Readonly<Record<CmykInk, string>>;
  readonly paper: string;
  /** 0 to 1: share of the common grey printed in black. */
  readonly gcr: number;
  /** Plate offsets in pixels of the input (misregistration). */
  readonly offsets: Readonly<Record<CmykInk, readonly [number, number]>>;
  /** Inks printed (default all). */
  readonly enabled?: Readonly<Record<CmykInk, boolean>>;
}

/** The plates (C, M, Y, K, left out when disabled) for `input`. */
export function cmykPlates(input: PixelBuffer, o: CmykHalftoneOptions): HalftonePlate[] {
  const tone = toneCurve(o);
  const inks = CMYK_INKS.filter((ink) => o.enabled?.[ink] ?? true);
  // Offsets push plates past the picture: grow the grid so the shifted edge stays printed.
  const reach = Math.max(0, ...inks.map((ink) => Math.hypot(o.offsets[ink][0], o.offsets[ink][1])));
  const margin = 1 + Math.ceil(reach / Math.max(1e-3, o.cell));
  const screens = inks.map((ink) =>
    halftoneScreen(input.width, input.height, o.cell, o.angles[ink], margin),
  );
  const tmp = new Float32Array(4);
  const index = inks.map((ink) => CMYK_INKS.indexOf(ink));
  const means = screenMeans(input, screens, (r, g, b, out) => {
    rgbToCmyk(tone[r] ?? 0, tone[g] ?? 0, tone[b] ?? 0, o.gcr, tmp);
    for (let s = 0; s < index.length; s++) out[s] = tmp[index[s] ?? 0] ?? 0;
  });
  return inks.map((ink, s) => ({
    screen: screens[s] as HalftonePlate["screen"],
    levels: coverageLevels(means[s] ?? new Float32Array(0)),
    shape: o.shape,
    dx: o.offsets[ink][0],
    dy: o.offsets[ink][1],
  }));
}

/** The CMYK halftone as pixels, the size of `input` (opaque, on the paper colour). */
export function applyCmykHalftone(input: PixelBuffer, o: CmykHalftoneOptions): PixelBuffer {
  const plates = cmykPlates(input, o);
  const inks = CMYK_INKS.filter((ink) => o.enabled?.[ink] ?? true);
  // Per ink: how much each channel is absorbed at full coverage (1 - ink / 255).
  const absorb = inks.map((ink) => hexToRgb255(o.inks[ink]).map((v) => 1 - v / 255));
  const [pr, pg, pb] = hexToRgb255(o.paper);
  const out = createPixelBuffer(input.width, input.height);
  const d = out.data;
  const w = input.width;
  const rows = plates.map(() => new Float32Array(w));
  for (let y = 0; y < input.height; y++) {
    for (let s = 0; s < plates.length; s++)
      plateRow(plates[s] as HalftonePlate, y, rows[s] as Float32Array);
    for (let x = 0, i = y * w * 4; x < w; x++, i += 4) {
      let r = pr;
      let g = pg;
      let b = pb;
      for (let s = 0; s < plates.length; s++) {
        const a = (rows[s] as Float32Array)[x] ?? 0;
        if (a === 0) continue;
        const k = absorb[s] as number[];
        r *= 1 - a * (k[0] ?? 0);
        g *= 1 - a * (k[1] ?? 0);
        b *= 1 - a * (k[2] ?? 0);
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  return out;
}

/**
 * The CMYK halftone as SVG in design units: the paper and one group per
 * ink with `mix-blend-mode: multiply` (browsers and Figma show the same
 * overprint; editors without blend modes stack the inks).
 */
export function cmykHalftoneSvg(
  input: PixelBuffer,
  o: CmykHalftoneOptions,
  design: { width: number; height: number },
): string {
  const plates = cmykPlates(input, o);
  const inks = CMYK_INKS.filter((ink) => o.enabled?.[ink] ?? true);
  const scale = input.width / Math.max(1, design.width);
  const { width, height } = design;
  const groups = plates
    .map((plate, s) =>
      halftoneSvgPlate(
        plate,
        o.inks[inks[s] as CmykInk],
        scale,
        design,
        ' style="mix-blend-mode:multiply"',
      ),
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="isolation:isolate">` +
    `<rect width="${width}" height="${height}" fill="${o.paper}"/>${groups}</svg>`
  );
}
