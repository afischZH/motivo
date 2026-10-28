/**
 * Mesh gradient (docs/TOOLS.md C1): a few large, softly deformed colour
 * blobs at well spread seeded positions, merged by one Gaussian blur.
 *
 * Warp deforms the blob outlines (radial noise plus a seeded stretch) in the
 * geometry itself instead of an `feTurbulence` + `feDisplacementMap` filter:
 * turbulence renders differently per browser, while plain paths and a
 * Gaussian blur look the same in preview, export and other SVG editors.
 * Grain is the shared raster tile (`grainOverlay`), not `feTurbulence`.
 *
 * The blur has two forms (`meshBlurPlan`), chosen from the design alone, so
 * the preview and every export size share one SVG:
 * - small blur: one `feGaussianBlur` over the blob paths;
 * - large blur: the blurred blobs as a small PNG (`meshFieldImage`), computed
 *   here and upscaled by the browser. SVG filters run at device resolution
 *   (a scaled-down group under `transform="scale(k)"` does not help) and
 *   browsers clamp the standard deviation (measured in Chromium: about
 *   520 px; Firefox caps at 500 px, WebKit's kernel at about 270 px). A 4K
 *   or 8K export of a large `feGaussianBlur` therefore came out sharper than
 *   the preview and needed a filter surface of up to 18k x 18k px. A blurred
 *   field has no fine detail, so a few pixels per standard deviation are
 *   visually lossless after upscaling.
 *
 * Every blob consumes the same number of rng draws whatever blur and warp
 * are, so changing those sliders never moves the blobs.
 */
import { hexToRgb } from "../../color";
import { type CubicPath, catmullRomToBezier, cubicPathToSvg, formatNumber } from "../../curves";
import { pngDataUri, type RgbaBuffer } from "../../png";
import {
  createFloatRgba,
  flattenCubicPath,
  gaussianBlurRgba,
  paintCoverage,
  polygonCoverage,
  toRgba8,
} from "../../raster";
import type { Rng } from "../../rng";
import { stableId, svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";
import { circleTension } from "../blob";
import { type GrainLayer, grainOverlay } from "../noise-grain";

export const MESH_POINTS_MIN = 3;
export const MESH_POINTS_MAX = 8;

/** Gaussian blur standard deviation at `blur = 1`, as a share of the shorter edge. */
export const MESH_BLUR_MAX = 0.2;

/**
 * Longest edge any export can have (equals `CANVAS_EDGE_MAX` of the tool
 * registry, checked there). The blur plan assumes the SVG may be scaled up
 * until its longer edge has this many pixels.
 */
export const MESH_OUTPUT_EDGE_MAX = 8192;
/**
 * Largest standard deviation, in output pixels, left to `feGaussianBlur`.
 * Below every browser clamp (WebKit's is the lowest, about 270 px), and it
 * keeps the filter surface under 9.4k px per edge at 8K.
 */
export const MESH_FILTER_SIGMA_MAX = 200;
/** Standard deviation in field pixels when the blur is rendered as a raster field. */
export const MESH_FIELD_SIGMA = 4;

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
  /** Closed outline. */
  readonly path: CubicPath;
  /** Closed SVG path. */
  readonly d: string;
}

export interface MeshGradientOptions {
  readonly width: number;
  readonly height: number;
  /** Colour or `"transparent"`, drawn unblurred below the blobs. */
  readonly background: string;
  /** Blob colours (hex); blob i takes `colors[i % colors.length]`. */
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
    const path = catmullRomToBezier(pts, { closed: true, tension });
    const d = cubicPathToSvg(path, 1);
    return { cx: c.x, cy: c.y, radius, color: colors[i % colors.length] as string, path, d };
  });
}

/** How the blob group is blurred, see the module comment. */
export type MeshBlurPlan =
  | { readonly kind: "none" }
  | { readonly kind: "filter"; readonly sigma: number }
  | {
      readonly kind: "raster";
      readonly sigma: number;
      /** Edge of one field pixel in user units. */
      readonly pixel: number;
    };

/**
 * Picks the blur form for a design of `width` x `height` with standard
 * deviation `sigma` (user units). The filter stays as long as the largest
 * possible export (longer edge `MESH_OUTPUT_EDGE_MAX`) keeps the standard
 * deviation within `MESH_FILTER_SIGMA_MAX` output pixels. Above that the
 * field is rasterised with `MESH_FIELD_SIGMA` pixels per standard deviation,
 * so its longer edge stays under about 165 px (plus a 1 px border).
 */
export function meshBlurPlan(width: number, height: number, sigma: number): MeshBlurPlan {
  if (!(sigma >= 0.5)) return { kind: "none" };
  const maxScale = MESH_OUTPUT_EDGE_MAX / Math.max(1, width, height);
  if (sigma * maxScale <= MESH_FILTER_SIGMA_MAX) return { kind: "filter", sigma };
  return { kind: "raster", sigma, pixel: sigma / MESH_FIELD_SIGMA };
}

/** The blurred field, placed in user units. */
export interface MeshField {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Straight (non-premultiplied) 8-bit RGBA, `image.width` x `image.height` pixels. */
  readonly image: RgbaBuffer;
}

/** `MeshField` encoded for SVG. */
export interface MeshFieldImage extends Omit<MeshField, "image"> {
  readonly columns: number;
  readonly rows: number;
  /** PNG data URI (RGB when fully opaque). */
  readonly href: string;
}

/**
 * The blob group blurred by `sigma` (user units) on a grid of `pixel` user
 * units. Same model as the filter path: sRGB, premultiplied alpha, blobs up
 * to 3 standard deviations outside the canvas count. The image covers the
 * canvas plus one pixel on every side, so the browser's interpolation at the
 * canvas edges uses real neighbours instead of clamping.
 */
export function meshField(
  blobs: readonly MeshBlob[],
  width: number,
  height: number,
  sigma: number,
  pixel: number,
): MeshField {
  const fieldSigma = sigma / pixel;
  const radius = Math.max(1, Math.ceil(3 * fieldSigma));
  // Pixels of the output image (canvas plus 1 px border) ...
  const columns = Math.ceil(width / pixel) + 2;
  const rows = Math.ceil(height / pixel) + 2;
  // ... inside a work area `radius` larger on every side, so the blur sees every contributing blob.
  const field = createFloatRgba(columns + 2 * radius, rows + 2 * radius);
  const originX = -(radius + 1) * pixel;
  const originY = -(radius + 1) * pixel;
  for (const blob of blobs) {
    const pts = flattenCubicPath(blob.path).map((p) => ({
      x: (p.x - originX) / pixel,
      y: (p.y - originY) / pixel,
    }));
    const { r, g, b } = hexToRgb(blob.color);
    paintCoverage(field, polygonCoverage(pts, field.width, field.height), r, g, b);
  }
  const image = toRgba8(gaussianBlurRgba(field, fieldSigma), radius, radius, columns, rows);
  return { x: -pixel, y: -pixel, width: columns * pixel, height: rows * pixel, image };
}

/** `meshField` as a PNG data URI. */
export function meshFieldImage(
  blobs: readonly MeshBlob[],
  width: number,
  height: number,
  sigma: number,
  pixel: number,
): MeshFieldImage {
  const { image, ...place } = meshField(blobs, width, height, sigma, pixel);
  let opaque = true;
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  return {
    ...place,
    columns: image.width,
    rows: image.height,
    href: pngDataUri(image, opaque ? "rgb" : "rgba"),
  };
}

/**
 * SVG document: background, the blurred blobs (see `meshBlurPlan`: the blob
 * paths under one `feGaussianBlur` in sRGB with a filter region 3 standard
 * deviations past the canvas, or the pre-blurred raster field) and the
 * optional grain on top.
 */
export function meshGradientSvg(o: MeshGradientOptions): string {
  const blobs = meshBlobs(o);
  const sigma = clamp01(o.blur) * MESH_BLUR_MAX * Math.min(o.width, o.height);
  const plan = meshBlurPlan(o.width, o.height, sigma);
  const paths = (): string => blobs.map((b) => `<path d="${b.d}" fill="${b.color}"/>`).join("");
  let defs = "";
  let body: string;
  if (plan.kind === "filter") {
    const pad = 3 * plan.sigma;
    const f = (v: number): string => formatNumber(v, 1);
    const filter =
      `<filter x="${f(-pad)}" y="${f(-pad)}" width="${f(o.width + 2 * pad)}" ` +
      `height="${f(o.height + 2 * pad)}" filterUnits="userSpaceOnUse" ` +
      `color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${f(plan.sigma)}"/></filter>`;
    const id = stableId("m", filter);
    defs += filter.replace("<filter ", `<filter id="${id}" `);
    body = `<g filter="url(#${id})">${paths()}</g>`;
  } else if (plan.kind === "raster") {
    const img = meshFieldImage(blobs, o.width, o.height, plan.sigma, plan.pixel);
    const f = (v: number): string => formatNumber(v, 3);
    body =
      `<image x="${f(img.x)}" y="${f(img.y)}" width="${f(img.width)}" height="${f(img.height)}" ` +
      `preserveAspectRatio="none" xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${img.href}"/>`;
  } else {
    body = `<g>${paths()}</g>`;
  }
  const grain = o.grain ? grainOverlay(o.width, o.height, o.grain) : { def: "", rect: "" };
  defs += grain.def;
  return svgDocument(
    o.width,
    o.height,
    `${defs ? `<defs>${defs}</defs>` : ""}${svgBackground(o.background, o.width, o.height)}${body}${grain.rect}`,
  );
}
