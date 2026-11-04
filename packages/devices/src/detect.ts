import { DEVICES } from "./catalog";
import type { Device } from "./types";

/** What the browser reports: `screen.width`, `screen.height`, `devicePixelRatio`. */
export interface ScreenInfo {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface Detection {
  /** Native pixels: the catalog orientation on a match, else as the browser reports. */
  readonly width: number;
  readonly height: number;
  /** The catalog device with exactly these pixels, if any. */
  readonly device: Device | undefined;
}

/** Browsers round CSS sizes; allow a few native pixels of slack. */
const TOLERANCE = 4;

/**
 * Turns the browser's screen info into native pixels and finds the matching
 * catalog device. Orientation does not matter: a phone held sideways still
 * matches its portrait entry. Pure, so it runs in tests and on any thread.
 */
export function detectScreen(screen: ScreenInfo): Detection | undefined {
  const { width, height, pixelRatio } = screen;
  if (!(width > 0 && height > 0 && pixelRatio > 0)) return undefined;

  const a = Math.round(width * pixelRatio);
  const b = Math.round(height * pixelRatio);
  const short = Math.min(a, b);
  const long = Math.max(a, b);

  const device = DEVICES.find((candidate) => {
    const cShort = Math.min(candidate.width, candidate.height);
    const cLong = Math.max(candidate.width, candidate.height);
    return Math.abs(cShort - short) <= TOLERANCE && Math.abs(cLong - long) <= TOLERANCE;
  });

  if (device) return { width: device.width, height: device.height, device };

  // Unknown screen: keep the orientation the browser reports.
  return { width: a, height: b, device: undefined };
}
