/**
 * Mesh gradient (docs/TOOLS.md C1): a few large, softly deformed colour
 * blobs at well spread seeded positions, merged by one `feGaussianBlur`.
 *
 * Warp deforms the blob outlines (radial noise plus a seeded stretch) in the
 * geometry itself instead of an `feTurbulence` + `feDisplacementMap` filter:
 * turbulence renders differently per browser, while plain paths and one
 * Gaussian blur look the same in preview, export and other SVG editors.
 * Grain is the shared raster tile (`grainOverlay`), not `feTurbulence`.
 *
 * Every blob consumes the same number of rng draws whatever blur and warp
 * are, so changing those sliders never moves the blobs.
 */
import { catmullRomToBezier, cubicPathToSvg, formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { stableId, svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";
import { circleTension } from "../blob";
import { type GrainLayer, grainOverlay } from "../noise-grain";

export const MESH_POINTS_MIN = 3;
export const MESH_POINTS_MAX = 8;

/** Gaussian blur standard deviation at `blur = 1`, as a share of the shorter edge. */
export const MESH_BLUR_MAX = 0.2;

/** Vertices of a blob outline. */
const BLOB_VERTICES = 6;
/** Candidates per blob for best-candidate sampling (fixed, so draws stay constant). */
const CANDIDATES = 10;
/** Blob centres may lie this far outside the canvas (share of each edge), so colour reaches the edges. */
const MARGIN = 0.12;

export interface MeshBlob {
  readonly cx: number;
  readonly cy: number;
  /** Base radius before warp. */
  readonly radius: number;
  readonly color: string;
  /** Closed SVG path. */
  readonly d: string;
}

export interface MeshGradientOptions {
  readonly width: number;
  readonly height: number;
  /** Colour or `"transparent"`, drawn unblurred below the blobs. */
  readonly background: string;
  /** Blob colours; blob i takes `colors[i % colors.length]`. */
  readonly colors: readonly string[];
  /** Number of blobs, clamped to [MESH_POINTS_MIN, MESH_POINTS_MAX]. */
  readonly points: number;
  /** Blur in [0, 1]; 1 = `MESH_BLUR_MAX` of the shorter edge. */
  readonly blur: number;
  /** Outline deformation in [0, 1]. */
  readonly warp: number;
  readonly rng: Rng;
  /** Optional grain on top; omitted or zero opacity = none. */
  readonly grain?: GrainLayer | null;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Best-candidate sampling (Mitchell): each new centre is the candidate
 * furthest from all centres placed so far. Spreads blobs evenly without the
 * clumps of plain uniform sampling. Consumes `2 * CANDIDATES` draws per point.
 */
export function spreadPoints(
  rng: Rng,
  count: number,
  width: number,
  height: number,
  margin = MARGIN,
): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    let best: Vec2 = { x: width / 2, y: height / 2 };
    let bestDist = -Infinity;
    for (let c = 0; c < CANDIDATES; c++) {
      const p = {
        x: rng.float(-margin, 1 + margin) * width,
        y: rng.float(-margin, 1 + margin) * height,
      };
      let d = Infinity;
      for (const q of out) d = Math.min(d, (p.x - q.x) ** 2 + (p.y - q.y) ** 2);
      // The first point has no neighbour: prefer the candidate nearest the centre.
      if (out.length === 0) d = -((p.x - width / 2) ** 2 + (p.y - height / 2) ** 2);
      if (d > bestDist) {
        best = p;
        bestDist = d;
      }
    }
    out.push(best);
  }
  return out;
}

/** Blob geometry, without SVG around it. Deterministic for a given rng state. */
export function meshBlobs(o: MeshGradientOptions): MeshBlob[] {
  const n = Math.round(Math.min(MESH_POINTS_MAX, Math.max(MESH_POINTS_MIN, o.points)));
  const warp = clamp01(o.warp);
  const centres = spreadPoints(o.rng, n, o.width, o.height);
  // Radius so n blobs cover the canvas generously: area per blob, enlarged.
  const base = Math.sqrt((o.width * o.height) / n) * 0.78;
  const colors = o.colors.length > 0 ? o.colors : ["#000000"];
  const tension = circleTension(BLOB_VERTICES);
  return centres.map((c, i) => {
    const radius = base * o.rng.float(0.85, 1.2);
    const phase = o.rng.float(0, (2 * Math.PI) / BLOB_VERTICES);
    const theta = o.rng.float(0, Math.PI);
    const stretch = 1 + warp * o.rng.float(0.4, 1.2);
    const sx = Math.sqrt(stretch);
    const sy = 1 / sx;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const pts: Vec2[] = [];
    for (let k = 0; k < BLOB_VERTICES; k++) {
      const a = phase + (k / BLOB_VERTICES) * 2 * Math.PI;
      const r = radius * (1 + warp * 0.45 * o.rng.float(-1, 1));
      // Point on the deformed circle, stretched along the blob's own axis.
      const lx = Math.cos(a) * r * sx;
      const ly = Math.sin(a) * r * sy;
      pts.push({ x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos });
    }
    const d = cubicPathToSvg(catmullRomToBezier(pts, { closed: true, tension }), 1);
    return { cx: c.x, cy: c.y, radius, color: colors[i % colors.length] as string, d };
  });
}

/**
 * SVG document: background, the blobs in one group blurred by a single
 * `feGaussianBlur` (sRGB interpolation, as CSS blur does), and the optional
 * grain on top. The filter region extends 3 standard deviations past the
 * canvas so blobs leaving the canvas do not fade at its edges.
 */
export function meshGradientSvg(o: MeshGradientOptions): string {
  const blobs = meshBlobs(o);
  const sigma = clamp01(o.blur) * MESH_BLUR_MAX * Math.min(o.width, o.height);
  const paths = blobs.map((b) => `<path d="${b.d}" fill="${b.color}"/>`).join("");
  let defs = "";
  let body: string;
  if (sigma >= 0.5) {
    const pad = 3 * sigma;
    const f = (v: number): string => formatNumber(v, 1);
    const filter =
      `<filter x="${f(-pad)}" y="${f(-pad)}" width="${f(o.width + 2 * pad)}" ` +
      `height="${f(o.height + 2 * pad)}" filterUnits="userSpaceOnUse" ` +
      `color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${f(sigma)}"/></filter>`;
    const id = stableId("m", filter);
    defs += filter.replace("<filter ", `<filter id="${id}" `);
    body = `<g filter="url(#${id})">${paths}</g>`;
  } else {
    body = `<g>${paths}</g>`;
  }
  const grain = o.grain ? grainOverlay(o.width, o.height, o.grain) : { def: "", rect: "" };
  defs += grain.def;
  return svgDocument(
    o.width,
    o.height,
    `${defs ? `<defs>${defs}</defs>` : ""}${svgBackground(o.background, o.width, o.height)}${body}${grain.rect}`,
  );
}
