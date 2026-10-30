import { hexToRgb, rgbToHex } from "@musterli/engine";

/** HSV for the colour area: hue in degrees [0, 360), saturation and value in [0, 1]. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** `#rgb` or `#rrggbb` to HSV. Greys and black report hue 0. */
export function hexToHsv(hex: string): Hsv {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** HSV to lowercase `#rrggbb`. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex({ r: f(5), g: f(3), b: f(1) });
}

/**
 * HSV for `hex`, keeping the hue (and saturation) of `previous` where the
 * colour itself has none: dragging into the grey or black edge of the area
 * must not snap the hue slider back to red.
 */
export function syncHsv(previous: Hsv, hex: string): Hsv {
  if (hsvToHex(previous) === hsvToHex(hexToHsv(hex))) return previous;
  const next = hexToHsv(hex);
  if (next.v === 0) return { h: previous.h, s: previous.s, v: 0 };
  if (next.s === 0) return { h: previous.h, s: 0, v: next.v };
  return next;
}
