/**
 * Device catalog types for the wallpaper app.
 *
 * Sizes are native pixels in the device's natural orientation: portrait for
 * phones and tablets, landscape for laptops and monitors. Safe zones are
 * fractions of the canvas (0..1), so they stay valid when a wallpaper is
 * rendered at a different scale.
 */

export const DEVICE_GROUPS = [
  "iphone",
  "android",
  "tablet",
  "laptop",
  "monitor",
  "ultrawide",
] as const;

export type DeviceGroup = (typeof DEVICE_GROUPS)[number];

/** What sits on top of the wallpaper in a safe zone. */
export type SafeZoneKind =
  /** Lock-screen clock and widgets. */
  | "clock"
  /** Status bar, notch, Dynamic Island, camera cut-out. */
  | "statusBar"
  /** macOS menu bar (includes the notch on newer MacBooks). */
  | "menuBar"
  /** Dock, taskbar, Android navigation bar, iPhone home indicator. */
  | "dock";

/** A rectangle in canvas fractions: x and width across, y and height down. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SafeZone {
  readonly kind: SafeZoneKind;
  /** Approximate area in the natural orientation, as canvas fractions. */
  readonly rect: Rect;
}

export interface Device {
  /** Stable id used in URLs, share links and saved designs. Never rename. */
  readonly id: string;
  /** Display name, may list several models that share the size. Not translated. */
  readonly name: string;
  readonly group: DeviceGroup;
  /** Native pixels in the natural orientation. */
  readonly width: number;
  readonly height: number;
  /** CSS pixel ratio the device reports (`devicePixelRatio`). */
  readonly pixelRatio: number;
  /** Release year of the newest listed model; orders the picker. */
  readonly year: number;
  readonly safeZones: readonly SafeZone[];
}
