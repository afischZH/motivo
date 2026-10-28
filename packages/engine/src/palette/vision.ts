/**
 * Colour vision deficiency simulation (docs/TOOLS.md F6).
 *
 * Dichromacy (protanopia, deuteranopia, tritanopia) uses the matrices for
 * severity 1.0 published as supplementary data of:
 *
 *   G. M. Machado, M. M. Oliveira, L. A. F. Fernandes (2009). "A
 *   Physiologically-based Model for Simulation of Color Vision Deficiency".
 *   IEEE Transactions on Visualization and Computer Graphics 15(6),
 *   1291-1298. doi:10.1109/TVCG.2009.113
 *
 * The values below were checked against the copy of that table in the
 * colorspacious library (`MACHADO_ET_AL_MATRICES[...][100]`, cvd.py). The
 * matrices act on linear sRGB, so colours are linearised first and encoded
 * again afterwards; results outside [0, 1] are clamped.
 *
 * Achromatopsia (no colour vision) maps every colour to the grey of the same
 * relative luminance (Rec. 709 / sRGB coefficients, as in WCAG).
 */
import { hexToRgb, rgbToHex, type Rgb } from "../color";

export const VISION_SIMULATIONS = [
  "none",
  "protanopia",
  "deuteranopia",
  "tritanopia",
  "achromatopsia",
] as const;
export type VisionSimulation = (typeof VISION_SIMULATIONS)[number];

/** Row-major 3 × 3 matrix acting on linear RGB column vectors. */
export type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** Machado, Oliveira, Fernandes (2009), severity 1.0. */
export const MACHADO_2009: Readonly<Record<"protanopia" | "deuteranopia" | "tritanopia", Matrix3>> =
  {
    protanopia: [
      [0.152286, 1.052583, -0.204868],
      [0.114503, 0.786281, 0.099216],
      [-0.003882, -0.048116, 1.051998],
    ],
    deuteranopia: [
      [0.367322, 0.860646, -0.227968],
      [0.280085, 0.672501, 0.047413],
      [-0.01182, 0.04294, 0.968881],
    ],
    tritanopia: [
      [1.255528, -0.076749, -0.178779],
      [-0.078411, 0.930809, 0.147602],
      [0.004733, 0.691367, 0.3039],
    ],
  };

/** sRGB transfer function, gamma-encoded channel in [0, 1] to linear (IEC 61966-2-1). */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Inverse of `srgbToLinear`; clamps to [0, 1]. */
export function linearToSrgb(channel: number): number {
  const c = channel <= 0 ? 0 : channel >= 1 ? 1 : channel;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function applyMatrix(m: Matrix3, rgb: Rgb): Rgb {
  const [r0, r1, r2] = m;
  return {
    r: r0[0] * rgb.r + r0[1] * rgb.g + r0[2] * rgb.b,
    g: r1[0] * rgb.r + r1[1] * rgb.g + r1[2] * rgb.b,
    b: r2[0] * rgb.r + r2[1] * rgb.g + r2[2] * rgb.b,
  };
}

/** Simulates how a colour appears with the given deficiency. Returns lower-case `#rrggbb`. */
export function simulateVision(hex: string, simulation: VisionSimulation): string {
  const encoded = hexToRgb(hex);
  if (simulation === "none") return rgbToHex(encoded);
  const lin: Rgb = {
    r: srgbToLinear(encoded.r),
    g: srgbToLinear(encoded.g),
    b: srgbToLinear(encoded.b),
  };
  let out: Rgb;
  if (simulation === "achromatopsia") {
    const y = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
    out = { r: y, g: y, b: y };
  } else {
    out = applyMatrix(MACHADO_2009[simulation], lin);
  }
  return rgbToHex({ r: linearToSrgb(out.r), g: linearToSrgb(out.g), b: linearToSrgb(out.b) });
}
