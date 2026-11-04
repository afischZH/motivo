import { CANVAS_EDGE_MAX } from "@musterli/tool-registry";
import { getDevice, type Device } from "@musterli/devices";

/** What the wallpaper is made for: a catalog device or a custom pixel size. */
export type Target =
  | { readonly kind: "device"; readonly id: string }
  | { readonly kind: "custom"; readonly width: number; readonly height: number };

export interface ResolvedTarget {
  /** Native output pixels. */
  readonly width: number;
  readonly height: number;
  readonly device: Device | undefined;
  /** Design size the generator renders at (CSS pixels), see `designSize`. */
  readonly design: { readonly width: number; readonly height: number };
}

export const MIN_EDGE = 64;

export function clampEdge(value: number): number {
  if (!Number.isFinite(value)) return MIN_EDGE;
  return Math.min(CANVAS_EDGE_MAX, Math.max(MIN_EDGE, Math.round(value)));
}

/**
 * Generators size lines, dots and blobs in CSS pixels. Rendering at the
 * native pixel size of a 3x phone would make them a third as thick as on
 * screen, so the design is rendered at native / scale and exported at the
 * native size. The scale divides both edges exactly (the design size must
 * be whole pixels, and a rounded size would leave a thin empty edge), and
 * is the largest such divisor not above the device pixel ratio (never
 * thicker than on screen).
 */
export function designSize(
  width: number,
  height: number,
  pixelRatio: number,
): { width: number; height: number; scale: number } {
  const scale = [4, 3, 2].find((s) => s <= pixelRatio && width % s === 0 && height % s === 0) ?? 1;
  return { width: width / scale, height: height / scale, scale };
}

/** Pixel ratio assumed for custom sizes: large screens are usually HiDPI. */
export function customPixelRatio(width: number, height: number): number {
  return Math.max(width, height) > 2560 ? 2 : 1;
}

export function resolveTarget(target: Target): ResolvedTarget | undefined {
  if (target.kind === "device") {
    const device = getDevice(target.id);
    if (!device) return undefined;
    const { width, height } = designSize(device.width, device.height, device.pixelRatio);
    return { width: device.width, height: device.height, device, design: { width, height } };
  }
  const w = clampEdge(target.width);
  const h = clampEdge(target.height);
  const { width, height } = designSize(w, h, customPixelRatio(w, h));
  return { width: w, height: h, device: undefined, design: { width, height } };
}
