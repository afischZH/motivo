/**
 * Dieter Dots: concentric rings of dots around the canvas centre, like a
 * perforated speaker grille. Ring `i` (1-based) holds `dotsPerRing * i` dots,
 * so the spacing along every ring stays the same as on the first one.
 */
import { samplePalette } from "../../color";
import { formatNumber } from "../../curves";
import { svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";

export const DIETER_COLOR_MODES = ["single", "alternate", "gradient"] as const;
/** `single`: first colour; `alternate`: cycles per ring; `gradient`: blends centre to edge. */
export type DieterColorMode = (typeof DIETER_COLOR_MODES)[number];

/** Smallest ring distance in px. */
export const MIN_RING_SPACING_PX = 4;
/** Upper bound for dots per render, so extreme params cannot freeze the UI. */
export const MAX_DIETER_DOTS = 10_000;

/** Dots for `rings` rings plus the centre dot. */
export function dieterDotCount(rings: number, dotsPerRing: number): number {
  return 1 + (dotsPerRing * rings * (rings + 1)) / 2;
}

/**
 * Rings actually drawn: no more than reach the canvas corners, and reduced
 * from the outside until the dot count is at most `MAX_DIETER_DOTS`.
 */
export function effectiveRings(o: {
  readonly width: number;
  readonly height: number;
  readonly rings: number;
  readonly dotsPerRing: number;
  readonly ringSpacing: number;
}): number {
  const sp = Math.max(o.ringSpacing, MIN_RING_SPACING_PX);
  const visible = Math.ceil(Math.hypot(o.width, o.height) / 2 / sp) + 1;
  let rings = Math.max(0, Math.min(Math.floor(o.rings), visible));
  const perRing = Math.max(1, Math.floor(o.dotsPerRing));
  while (rings > 0 && dieterDotCount(rings, perRing) > MAX_DIETER_DOTS) rings--;
  return rings;
}

export interface DieterDot extends Vec2 {
  /** 0 for the centre dot, 1 for the first ring, and so on. */
  readonly ring: number;
}

export interface DieterLayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly rings: number;
  readonly dotsPerRing: number;
  /** Distance between rings in px. */
  readonly ringSpacing: number;
  /** Extra rotation per ring in degrees, turns the rings into a spiral. */
  readonly twist: number;
}

/** Dot centres (including ones outside the canvas), clamped by `effectiveRings`. */
export function dieterDotSites(o: DieterLayoutOptions): DieterDot[] {
  const sp = Math.max(o.ringSpacing, MIN_RING_SPACING_PX);
  const rings = effectiveRings(o);
  const perRing = Math.max(1, Math.floor(o.dotsPerRing));
  const cx = o.width / 2;
  const cy = o.height / 2;
  const out: DieterDot[] = [{ x: cx, y: cy, ring: 0 }];
  for (let i = 1; i <= rings; i++) {
    const n = perRing * i;
    const r = i * sp;
    // Start at 12 o'clock; `twist` rotates each ring a little further.
    const offset = ((i * o.twist - 90) * Math.PI) / 180;
    for (let k = 0; k < n; k++) {
      const a = offset + (k / n) * 2 * Math.PI;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, ring: i });
    }
  }
  return out;
}

export interface DieterDotsSvgOptions extends DieterLayoutOptions {
  readonly background: string;
  readonly colors: readonly string[];
  /** Dot diameter relative to the ring spacing, (0, 1]. */
  readonly scale: number;
  /** How much dots shrink towards the outermost ring, [0, 1]. */
  readonly falloff: number;
  readonly colorMode: DieterColorMode;
}

/** Renders the dots. Uses no randomness: the result depends on params and size only. */
export function dieterDotsSvg(o: DieterDotsSvgOptions): string {
  const { width: w, height: h } = o;
  const sp = Math.max(o.ringSpacing, MIN_RING_SPACING_PX);
  const rings = effectiveRings(o);
  const sites = dieterDotSites(o);
  const baseR = (sp * o.scale) / 2;
  const ramp =
    o.colorMode === "gradient" && o.colors.length > 0
      ? samplePalette(o.colors, rings + 1)
      : undefined;
  const f = (v: number): string => formatNumber(v, 2);
  const groups = new Map<string, string[]>();

  for (const d of sites) {
    const r = baseR * (1 - o.falloff * (rings > 0 ? d.ring / rings : 0));
    if (r < 0.05 || d.x + r < 0 || d.y + r < 0 || d.x - r > w || d.y - r > h) continue;
    const n = o.colors.length;
    const color =
      (o.colorMode === "single"
        ? o.colors[0]
        : o.colorMode === "alternate"
          ? o.colors[d.ring % Math.max(n, 1)]
          : ramp?.[d.ring]) ?? "#000000";
    const el = `<circle cx="${f(d.x)}" cy="${f(d.y)}" r="${f(r)}"/>`;
    const list = groups.get(color);
    if (list === undefined) groups.set(color, [el]);
    else list.push(el);
  }

  const body = [...groups.entries()]
    .map(([color, els]) => `<g fill="${color}">${els.join("")}</g>`)
    .join("");
  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${body}`);
}
