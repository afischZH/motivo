/**
 * Low-Poly and Voronoi (docs/TOOLS.md K3). Points from Poisson-disk sampling
 * or a jittered triangular grid, then either Delaunay triangles or Voronoi
 * cells. Each face takes its colour from a gradient through the palette
 * (linear, radial or a mesh of colour anchors) sampled at its centroid, plus
 * optional per-face variation and light shading of a random relief.
 *
 * Coverage: the Delaunay points sit in the canvas grown by half the spacing,
 * plus a frame of points one spacing outside it, so the triangles always
 * cover the whole canvas. Voronoi cells are clipped to the canvas grown by
 * the gap and corner rounding, so they cover it exactly as well.
 *
 * Caps: at most `LOW_POLY_POINTS_MAX` points (the spacing grows for huge
 * canvases), so the SVG stays under about 0.5 MB even with rounded corners
 * and strokes, a render takes a few ms at the default size and stays around
 * 50 ms at 8192 × 8192.
 */
import { hexToRgb, oklabToRgb, rgbToHex, rgbToOklab, type Oklab } from "../../color";
import { formatNumber } from "../../curves";
import {
  delaunay,
  insetConvexPolygon,
  polygonCentroid,
  polygonPathData,
  roundedPolygonPathData,
  voronoiCells,
  type Rect,
} from "../../geometry";
import { poissonDisk } from "../../poisson";
import { createRng, type Rng } from "../../rng";
import { svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";

export const LOW_POLY_MODES = ["delaunay", "voronoi"] as const;
export type LowPolyMode = (typeof LOW_POLY_MODES)[number];

export const LOW_POLY_DISTRIBUTIONS = ["poisson", "grid"] as const;
export type LowPolyDistribution = (typeof LOW_POLY_DISTRIBUTIONS)[number];

export const LOW_POLY_GRADIENTS = ["linear", "radial", "mesh"] as const;
export type LowPolyGradient = (typeof LOW_POLY_GRADIENTS)[number];

/** Most points per design (sites plus frame). Keeps SVG size and render time bounded. */
export const LOW_POLY_POINTS_MAX = 2000;
/** Smallest spacing between points in px. */
export const LOW_POLY_SPACING_MIN_PX = 6;
/** Points per area of Poisson-disk sampling, times spacing² (measured, rounded up). */
const POISSON_DENSITY = 0.68;
/** Elevation of the light above the canvas, in radians (40°). */
const LIGHT_ELEVATION = (40 * Math.PI) / 180;

export interface LowPolyPointsOptions {
  readonly width: number;
  readonly height: number;
  /** Wanted distance between points in px (clamped, see `lowPolySpacing`). */
  readonly spacing: number;
  readonly distribution: LowPolyDistribution;
  /** Grid only: random offset of each point, 0 to 1 of the spacing. */
  readonly jitter: number;
  readonly rng: Rng;
  /** Animation time in [0, 1): points drift on small loops (0 = the still design). */
  readonly t?: number;
  /** Size of the drift loops, 0 to 1 of the spacing (default 0.25). */
  readonly motion?: number;
}

export interface LowPolyPoints {
  /** Sites first, then the frame points (Delaunay only uses the frame). */
  readonly points: Vec2[];
  /** Number of sites at the start of `points`. */
  readonly sites: number;
  /** Effective spacing in px. */
  readonly spacing: number;
}

function gridCount(w: number, h: number, s: number): number {
  return (Math.ceil(w / s) + 2) * (Math.ceil(h / ((s * Math.sqrt(3)) / 2)) + 2);
}

/**
 * Spacing actually used: at least `LOW_POLY_SPACING_MIN_PX`, and large
 * enough that sites plus frame stay within `LOW_POLY_POINTS_MAX`.
 */
export function lowPolySpacing(
  width: number,
  height: number,
  spacing: number,
  distribution: LowPolyDistribution,
): number {
  if (!(spacing > 0)) throw new RangeError("lowPolySpacing: spacing must be positive");
  let s = Math.max(spacing, LOW_POLY_SPACING_MIN_PX);
  const count = (v: number): number => {
    // Sites fill the canvas grown by v/2 per side, the frame runs v outside it.
    const w = width + v;
    const h = height + v;
    const frame = (2 * (w + h + 2 * v)) / v + 8;
    const sites =
      distribution === "grid" ? gridCount(w, h, v) : (w * h * POISSON_DENSITY) / (v * v);
    return sites + frame;
  };
  while (count(s) > LOW_POLY_POINTS_MAX) s *= 1.02;
  return s;
}

/** Sites and frame points for a canvas; see the module comment. */
export function lowPolyPoints(o: LowPolyPointsOptions): LowPolyPoints {
  const { width: w, height: h } = o;
  const s = lowPolySpacing(w, h, o.spacing, o.distribution);
  const half = s / 2;
  const sites: Vec2[] = [];
  if (o.distribution === "poisson") {
    for (const p of poissonDisk({ width: w + s, height: h + s, minDistance: s, rng: o.rng })) {
      sites.push({ x: p.x - half, y: p.y - half });
    }
  } else {
    const dy = (s * Math.sqrt(3)) / 2;
    // A tiny minimum jitter breaks exact co-circularity of the lattice.
    const j = Math.max(0.002, Math.min(1, o.jitter)) * s * 0.45;
    for (let row = 0; -half + row * dy <= h + half + 1e-9; row++) {
      const shift = row % 2 === 1 ? s / 2 : 0;
      for (let col = 0; -half + col * s + shift <= w + half + 1e-9; col++) {
        const jx = (o.rng.next() * 2 - 1) * j;
        const jy = (o.rng.next() * 2 - 1) * j;
        sites.push({ x: -half + col * s + shift + jx, y: -half + row * dy + jy });
      }
    }
  }

  const t = o.t ?? 0;
  if (t !== 0) {
    const a = s * Math.min(1, Math.max(0, o.motion ?? 0.25));
    const motion = createRng(Math.floor(o.rng.next() * 4294967296));
    for (let i = 0; i < sites.length; i++) {
      const p = sites[i] as Vec2;
      const phase = motion.next() * 2 * Math.PI;
      const turn = 2 * Math.PI * t;
      sites[i] = {
        x: p.x + a * (Math.cos(turn + phase) - Math.cos(phase)),
        y: p.y + a * (Math.sin(turn + phase) - Math.sin(phase)),
      };
    }
  }

  // Frame one spacing outside the canvas; equal steps, corners included.
  const frame: Vec2[] = [];
  const x0 = -s;
  const y0 = -s;
  const x1 = w + s;
  const y1 = h + s;
  const nx = Math.max(1, Math.round((x1 - x0) / s));
  const ny = Math.max(1, Math.round((y1 - y0) / s));
  for (let i = 0; i < nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    frame.push({ x, y: y0 }, { x: x1 - x + x0, y: y1 });
  }
  for (let i = 0; i < ny; i++) {
    const y = y0 + ((y1 - y0) * i) / ny;
    frame.push({ x: x1, y }, { x: x0, y: y1 - y + y0 });
  }
  return { points: [...sites, ...frame], sites: sites.length, spacing: s };
}

export interface LowPolyColorOptions {
  readonly width: number;
  readonly height: number;
  readonly colors: readonly string[];
  readonly gradient: LowPolyGradient;
  /** Linear gradient direction in degrees, CSS convention (0 = to top, 90 = to right). */
  readonly angle: number;
  /** Rng for the mesh anchors (one per colour). */
  readonly rng: Rng;
}

/**
 * Colour field of the faces: returns the OKLab colour at a point. Linear and
 * radial interpolate the palette piecewise; `mesh` blends colour anchors
 * placed at random (inverse distance weights).
 */
export function lowPolyColorField(o: LowPolyColorOptions): (p: Vec2) => Oklab {
  const labs = o.colors.map((c) => rgbToOklab(hexToRgb(c)));
  if (labs.length === 0) throw new RangeError("lowPolyColorField: at least one colour is required");
  const { width: w, height: h } = o;
  const along = (t: number): Oklab => {
    const u = Math.min(1, Math.max(0, t)) * (labs.length - 1);
    const i = Math.min(Math.floor(u), labs.length - 2);
    if (i < 0) return labs[0] as Oklab;
    const a = labs[i] as Oklab;
    const b = labs[i + 1] as Oklab;
    const f = u - i;
    return { l: a.l + (b.l - a.l) * f, a: a.a + (b.a - a.a) * f, b: a.b + (b.b - a.b) * f };
  };
  if (o.gradient === "linear") {
    const rad = (o.angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2 || 1;
    return (p) => along(0.5 + ((p.x - w / 2) * dx + (p.y - h / 2) * dy) / (2 * half));
  }
  if (o.gradient === "radial") {
    const max = Math.hypot(w / 2, h / 2) || 1;
    return (p) => along(Math.hypot(p.x - w / 2, p.y - h / 2) / max);
  }
  const anchors = labs.map((lab) => ({ lab, x: o.rng.float(0, w), y: o.rng.float(0, h) }));
  const soft = (0.08 * Math.hypot(w, h)) ** 2;
  return (p) => {
    let sw = 0;
    let l = 0;
    let a = 0;
    let b = 0;
    for (const k of anchors) {
      const d2 = (p.x - k.x) ** 2 + (p.y - k.y) ** 2 + soft;
      const wt = 1 / (d2 * Math.sqrt(d2));
      sw += wt;
      l += k.lab.l * wt;
      a += k.lab.a * wt;
      b += k.lab.b * wt;
    }
    return { l: l / sw, a: a / sw, b: b / sw };
  };
}

export interface LowPolyOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly background: string;
  readonly colors: readonly string[];
  readonly mode: LowPolyMode;
  readonly distribution: LowPolyDistribution;
  /** Distance between points in px. */
  readonly spacing: number;
  /** Grid only, 0 to 1. */
  readonly jitter: number;
  readonly gradient: LowPolyGradient;
  readonly angle: number;
  /** Random lightness change per face, 0 to 1. */
  readonly variance: number;
  /** Strength of the light shading, 0 to 1. */
  readonly lighting: number;
  /** Direction the light comes from, degrees (0 = top, 90 = right). */
  readonly lightAngle: number;
  /** Outline width in px, 0 = none. */
  readonly strokeWidth: number;
  readonly strokeColor: string;
  /** 0 to 1. */
  readonly strokeOpacity: number;
  /** Space between faces in px (each face shrinks by half of it). */
  readonly gap: number;
  /** Corner rounding in px (cut length along each edge). */
  readonly rounding: number;
  /** Animation time in [0, 1). */
  readonly t?: number;
}

export interface LowPolyFace {
  readonly poly: Vec2[];
  readonly color: string;
}

const seedOf = (rng: Rng): number => Math.floor(rng.next() * 4294967296);

/**
 * The faces of the design in paint order, already shrunk by the gap and
 * restricted to those touching the canvas. Independent random streams for
 * points, relief, anchors and colour variation, so changing one option keeps
 * the others in place.
 */
export function lowPolyFaces(o: LowPolyOptions): LowPolyFace[] {
  const { width: w, height: h } = o;
  const pointsRng = createRng(seedOf(o.rng));
  const reliefRng = createRng(seedOf(o.rng));
  const anchorRng = createRng(seedOf(o.rng));
  const faceRng = createRng(seedOf(o.rng));

  const pts = lowPolyPoints({
    width: w,
    height: h,
    spacing: o.spacing,
    distribution: o.distribution,
    jitter: o.jitter,
    rng: pointsRng,
    ...(o.t === undefined ? {} : { t: o.t }),
  });
  const field = lowPolyColorField({
    width: w,
    height: h,
    colors: o.colors,
    gradient: o.gradient,
    angle: o.angle,
    rng: anchorRng,
  });

  const la = (o.lightAngle * Math.PI) / 180;
  const light = {
    x: Math.sin(la) * Math.cos(LIGHT_ELEVATION),
    y: -Math.cos(la) * Math.cos(LIGHT_ELEVATION),
    z: Math.sin(LIGHT_ELEVATION),
  };
  const shadeOf = (nx: number, ny: number, nz: number): number => {
    const len = Math.hypot(nx, ny, nz) || 1;
    return (nx * light.x + ny * light.y + nz * light.z) / len - light.z;
  };

  const canvas: Rect = { x0: 0, y0: 0, x1: w, y1: h };
  const touches = (poly: readonly Vec2[]): boolean => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return maxX > canvas.x0 && maxY > canvas.y0 && minX < canvas.x1 && minY < canvas.y1;
  };

  const raw: { poly: Vec2[]; shade: number }[] = [];
  if (o.mode === "delaunay") {
    const heights = pts.points.map(() => reliefRng.next() * pts.spacing * 0.9);
    const tris = delaunay(pts.points);
    for (let k = 0; k + 2 < tris.length; k += 3) {
      const ia = tris[k] as number;
      const ib = tris[k + 1] as number;
      const ic = tris[k + 2] as number;
      const a = pts.points[ia] as Vec2;
      const b = pts.points[ib] as Vec2;
      const c = pts.points[ic] as Vec2;
      const poly = [a, b, c];
      if (!touches(poly)) continue;
      const az = heights[ia] as number;
      const e1 = { x: b.x - a.x, y: b.y - a.y, z: (heights[ib] as number) - az };
      const e2 = { x: c.x - a.x, y: c.y - a.y, z: (heights[ic] as number) - az };
      let nx = e1.y * e2.z - e1.z * e2.y;
      let ny = e1.z * e2.x - e1.x * e2.z;
      let nz = e1.x * e2.y - e1.y * e2.x;
      if (nz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      raw.push({ poly, shade: shadeOf(nx, ny, nz) });
    }
  } else {
    const pad = Math.max(0, o.gap) + Math.max(0, o.rounding) + Math.max(0, o.strokeWidth) + 2;
    const sites = pts.points.slice(0, pts.sites);
    const cells = voronoiCells(sites, { x0: -pad, y0: -pad, x1: w + pad, y1: h + pad });
    for (const cell of cells) {
      // Two draws per cell even when it is dropped, so neighbours keep their tilt.
      const gx = (reliefRng.next() - 0.5) * 1.4;
      const gy = (reliefRng.next() - 0.5) * 1.4;
      if (cell.length < 3 || !touches(cell)) continue;
      raw.push({ poly: cell, shade: shadeOf(-gx, -gy, 1) });
    }
  }

  const faces: LowPolyFace[] = [];
  const variance = Math.min(1, Math.max(0, o.variance));
  const lighting = Math.min(1, Math.max(0, o.lighting));
  for (const f of raw) {
    const jitter = (faceRng.next() * 2 - 1) * variance * 0.09;
    const poly = o.gap > 0 ? insetConvexPolygon(f.poly, o.gap / 2) : f.poly;
    if (poly.length < 3) continue;
    const c = polygonCentroid(f.poly);
    const lab = field({ x: Math.min(w, Math.max(0, c.x)), y: Math.min(h, Math.max(0, c.y)) });
    const l = Math.min(1, Math.max(0, lab.l + f.shade * lighting * 0.6 + jitter));
    faces.push({ poly, color: rgbToHex(oklabToRgb({ l, a: lab.a, b: lab.b })) });
  }
  return faces;
}

const f1 = (v: number): string => formatNumber(v, 2);

/** The design as SVG. */
export function lowPolySvg(o: LowPolyOptions): string {
  const { width: w, height: h } = o;
  const faces = lowPolyFaces(o);
  const rounding = Math.max(0, o.rounding);
  const pathOf = (poly: readonly Vec2[]): string =>
    rounding > 0 ? roundedPolygonPathData(poly, rounding, 1) : polygonPathData(poly, 1);
  const outline = o.strokeWidth > 0 && o.strokeOpacity > 0;
  // Without outline and gap, each face is stroked in its own colour to hide
  // the hairline seams anti-aliasing leaves between neighbours.
  const seams = !outline && !(o.gap > 0);
  let group: string;
  let body = "";
  if (outline) {
    const opacity = Math.min(1, o.strokeOpacity);
    group =
      `<g stroke="${o.strokeColor}" stroke-width="${f1(o.strokeWidth)}" stroke-linejoin="round"` +
      `${opacity < 1 ? ` stroke-opacity="${f1(opacity)}"` : ""}>`;
    for (const face of faces) body += `<path fill="${face.color}" d="${pathOf(face.poly)}"/>`;
  } else if (seams) {
    group = `<g stroke-width="0.6" stroke-linejoin="round">`;
    for (const face of faces) {
      body += `<path fill="${face.color}" stroke="${face.color}" d="${pathOf(face.poly)}"/>`;
    }
  } else {
    group = "<g>";
    for (const face of faces) body += `<path fill="${face.color}" d="${pathOf(face.poly)}"/>`;
  }
  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${group}${body}</g>`);
}
