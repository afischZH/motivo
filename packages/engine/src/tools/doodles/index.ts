/**
 * Doodle backgrounds: simple procedural strokes (squiggles, zigzags,
 * spirals, loops, triangles, stars, crosses, arcs) that look hand-drawn.
 *
 * Every doodle starts as a polyline in unit coordinates; each point is moved
 * by smooth 1D gradient noise along the stroke ("wobble"), then the line is
 * smoothed with a Catmull-Rom spline and drawn with round caps and joins.
 * Doodles are spread with Poisson-disk sampling. All shapes are generic
 * geometric primitives defined here.
 */
import { catmullRomToBezier, cubicPathToSvg, formatNumber } from "../../curves";
import { NOISE_PERIOD, type Noise1D, createNoise1D } from "../../noise";
import { poissonDisk } from "../../poisson";
import type { Rng } from "../../rng";
import { svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";

export const DOODLE_SHAPES = [
  "mixed",
  "squiggle",
  "zigzag",
  "spiral",
  "loop",
  "triangle",
  "star",
  "cross",
  "arc",
] as const;
export type DoodleShape = (typeof DOODLE_SHAPES)[number];

/** The concrete strokes `mixed` picks from. */
export const DOODLE_KINDS = [
  "squiggle",
  "zigzag",
  "spiral",
  "loop",
  "triangle",
  "star",
  "cross",
  "arc",
] as const;
export type DoodleKind = (typeof DOODLE_KINDS)[number];

/** Smallest Poisson distance in px. */
export const MIN_DOODLE_SPACING_PX = 8;
/** Most doodles per render (each is a path of up to about 30 points). */
export const MAX_DOODLES = 2500;

/** One stroke of a doodle in unit coordinates (about [-0.5, 0.5]). */
interface Stroke {
  readonly points: Vec2[];
  readonly closed: boolean;
  /** Catmull-Rom tension; low values keep corners. */
  readonly tension: number;
}

const TAU = 2 * Math.PI;

const polar = (r: number, a: number): Vec2 => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });

/** Inserts `steps - 1` evenly spaced points between consecutive corners. */
function subdivide(corners: readonly Vec2[], steps: number, closed: boolean): Vec2[] {
  const out: Vec2[] = [];
  const n = corners.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = corners[i] as Vec2;
    const b = corners[(i + 1) % n] as Vec2;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (!closed) out.push(corners[n - 1] as Vec2);
  return out;
}

/** Strokes of one doodle kind in unit coordinates. */
export function doodleStrokes(kind: DoodleKind): readonly Stroke[] {
  switch (kind) {
    case "squiggle": {
      const pts: Vec2[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        pts.push({ x: t - 0.5, y: Math.sin(t * 2 * TAU) * 0.16 });
      }
      return [{ points: pts, closed: false, tension: 0.5 }];
    }
    case "zigzag": {
      const corners: Vec2[] = [];
      for (let i = 0; i <= 5; i++) corners.push({ x: i / 5 - 0.5, y: i % 2 === 0 ? 0.16 : -0.16 });
      return [{ points: subdivide(corners, 2, false), closed: false, tension: 0.15 }];
    }
    case "spiral": {
      const pts: Vec2[] = [];
      const turns = 2.25;
      for (let i = 0; i <= 28; i++) {
        const t = i / 28;
        pts.push(polar(0.04 + 0.44 * t, t * turns * TAU));
      }
      return [{ points: pts, closed: false, tension: 0.5 }];
    }
    case "loop": {
      // A circle drawn in one go that overshoots its start, like a pen stroke.
      const pts: Vec2[] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 12;
        pts.push(polar(0.4 - 0.03 * t, -Math.PI / 2 + t * TAU));
      }
      return [{ points: pts, closed: false, tension: 0.5 }];
    }
    case "triangle": {
      const corners = [0, 1, 2].map((k) => polar(0.45, -Math.PI / 2 + (k * TAU) / 3));
      return [{ points: subdivide(corners, 3, true), closed: true, tension: 0.2 }];
    }
    case "star": {
      const corners = Array.from({ length: 10 }, (_, k) =>
        polar(k % 2 === 0 ? 0.48 : 0.2, -Math.PI / 2 + (k * TAU) / 10),
      );
      return [{ points: subdivide(corners, 2, true), closed: true, tension: 0.15 }];
    }
    case "cross":
      return [
        {
          points: subdivide(
            [
              { x: -0.32, y: -0.32 },
              { x: 0.32, y: 0.32 },
            ],
            3,
            false,
          ),
          closed: false,
          tension: 0.5,
        },
        {
          points: subdivide(
            [
              { x: 0.32, y: -0.32 },
              { x: -0.32, y: 0.32 },
            ],
            3,
            false,
          ),
          closed: false,
          tension: 0.5,
        },
      ];
    case "arc": {
      const pts: Vec2[] = [];
      for (let i = 0; i <= 10; i++) pts.push(polar(0.42, Math.PI * 0.1 + (i / 10) * Math.PI * 0.8));
      return [{ points: pts.map((p) => ({ x: p.x, y: p.y - 0.2 })), closed: false, tension: 0.5 }];
    }
  }
}

export interface DoodleOptions {
  readonly kind: DoodleKind;
  readonly center: Vec2;
  /** Doodle size in px (the unit square is scaled to it). */
  readonly size: number;
  /** Rotation in radians. */
  readonly angle: number;
  /** Noise amplitude, 0 = clean geometry, 1 = very shaky. */
  readonly wobble: number;
  /** Shared noise pair (x and y offsets), see `doodleNoise`. */
  readonly noise: DoodleNoise;
  /** Where along the noise this doodle starts, so doodles differ. */
  readonly phase: number;
}

export interface DoodleNoise {
  readonly x: Noise1D;
  readonly y: Noise1D;
}

/** The noise pair of one render (2 * NOISE_PERIOD rng draws). */
export function doodleNoise(rng: Rng): DoodleNoise {
  return { x: createNoise1D(rng), y: createNoise1D(rng) };
}

/** Largest point offset at `wobble = 1`, relative to the doodle size. */
export const MAX_WOBBLE = 0.16;
/** Noise cycles per unit of stroke length (unit coordinates). */
const NOISE_FREQUENCY = 1.8;

/** SVG path data of one doodle, with noise applied and splines smoothed. */
export function doodlePath(o: DoodleOptions, precision = 1): string {
  const { x: nx, y: ny } = o.noise;
  const phase = o.phase;
  const amp = Math.min(Math.max(o.wobble, 0), 1) * MAX_WOBBLE * o.size * 2;
  const cos = Math.cos(o.angle);
  const sin = Math.sin(o.angle);
  const parts: string[] = [];
  for (const stroke of doodleStrokes(o.kind)) {
    let travelled = 0;
    let prev: Vec2 | undefined;
    const pts = stroke.points.map((p) => {
      if (prev) travelled += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
      const t = phase + travelled * NOISE_FREQUENCY;
      const x = p.x * o.size + nx(t) * amp;
      const y = p.y * o.size + ny(t + 101.5) * amp;
      return { x: o.center.x + x * cos - y * sin, y: o.center.y + x * sin + y * cos };
    });
    const path = catmullRomToBezier(pts, { closed: stroke.closed, tension: stroke.tension });
    parts.push(cubicPathToSvg(path, precision).replace(/ ([MCZ])/g, "$1"));
  }
  return parts.join("");
}

export interface DoodlesSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly background: string;
  readonly colors: readonly string[];
  readonly shape: DoodleShape;
  /** Minimum distance between doodles in px (clamped, see `effectiveDoodleSpacing`). */
  readonly spacing: number;
  /** Doodle size relative to the spacing, (0, 1.5]. */
  readonly size: number;
  /** Random shrink per doodle, [0, 1]. */
  readonly sizeVariance: number;
  /** Maximum random rotation in degrees, [0, 180]. */
  readonly rotation: number;
  readonly wobble: number;
  /** Stroke width in px. */
  readonly strokeWidth: number;
}

/**
 * Spacing actually used: at least `MIN_DOODLE_SPACING_PX`, and large enough
 * that the padded canvas holds at most about `MAX_DOODLES` doodles (a
 * Poisson-disk set covers about 0.7 / d^2 points per unit area).
 */
export function effectiveDoodleSpacing(width: number, height: number, spacing: number): number {
  if (!(spacing > 0)) throw new RangeError("doodles: spacing must be positive");
  const s = Math.max(spacing, MIN_DOODLE_SPACING_PX);
  const area = (width + s) * (height + s);
  const minByCount = Math.sqrt((0.75 * area) / MAX_DOODLES);
  return Math.max(s, minByCount);
}

/** Renders the doodles, grouped by colour. */
export function doodlesSvg(o: DoodlesSvgOptions): string {
  const { width: w, height: h } = o;
  const s = effectiveDoodleSpacing(w, h, o.spacing);
  const noise = doodleNoise(o.rng);
  const sites = poissonDisk({ width: w + s, height: h + s, minDistance: s, rng: o.rng });
  const groups = new Map<string, string[]>();
  const n = o.colors.length;
  const maxAngle = (o.rotation * Math.PI) / 180;
  let count = 0;

  for (const p of sites) {
    // Always five draws per site, so changing one option keeps the others stable.
    const kindPick = o.rng.next();
    const colorPick = o.rng.next();
    const shrink = o.rng.next();
    const turn = o.rng.float(-1, 1);
    const phase = o.rng.float(0, NOISE_PERIOD);

    if (count >= MAX_DOODLES) break;
    const center = { x: p.x - s / 2, y: p.y - s / 2 };
    const size = s * o.size * (1 - 0.7 * o.sizeVariance * shrink);
    const reach = size * 0.75 + o.strokeWidth;
    if (size < 1) continue;
    if (
      center.x + reach < 0 ||
      center.y + reach < 0 ||
      center.x - reach > w ||
      center.y - reach > h
    ) {
      continue;
    }
    const kind =
      o.shape === "mixed"
        ? (DOODLE_KINDS[
            Math.min(Math.floor(kindPick * DOODLE_KINDS.length), DOODLE_KINDS.length - 1)
          ] ?? "squiggle")
        : o.shape;
    const color = o.colors[Math.min(Math.floor(colorPick * n), n - 1)] ?? "#000000";
    const d = doodlePath({
      kind,
      center,
      size,
      angle: turn * maxAngle,
      wobble: o.wobble,
      noise,
      phase,
    });
    const list = groups.get(color);
    if (list === undefined) groups.set(color, [d]);
    else list.push(d);
    count++;
  }

  const sw = formatNumber(o.strokeWidth, 1);
  const body = [...groups.entries()]
    .map(
      ([c, ds]) =>
        `<path d="${ds.join("")}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${body}`);
}
