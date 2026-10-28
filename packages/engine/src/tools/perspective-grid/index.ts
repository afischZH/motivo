/**
 * M5-AP03: 3D perspective grid (docs/TOOLS.md D4). A retro "synthwave" floor
 * grid seen through a pinhole camera, with an optional mirrored ceiling, a
 * striped sun, stars, a mountain silhouette, horizon haze and a glow layer.
 *
 * Projection (no 3D library): the camera sits `cameraHeight` cells above the
 * ground plane and looks straight ahead; the horizon is the image of every
 * point at infinite depth. A ground point at lateral offset `X` and depth `d`
 * lands on `(cx + f·X/d, horizon + f·h/d)`, a ceiling point on the mirrored
 * row `horizon − f·h/d`. Pitching the camera only moves the horizon (and
 * stretches the image vertically by 1/cos), so the horizon position stands in
 * for the pitch; `tilt` is the roll of the camera (a slanted horizon).
 *
 * Lines are thin filled shapes (rows as rectangles, columns as quads towards
 * the vanishing point), so their width can shrink with depth like a real
 * strip on the floor. Everything stays strictly between the near edge of the
 * picture and the far distance `zFar`: no line reaches or crosses the
 * horizon, and every coordinate is finite. The fade towards the horizon is
 * one vertical `linearGradient` shared by all lines (depth only depends on
 * the row of the picture), so it costs a few stops instead of one attribute
 * per line.
 *
 * Budgets are independent of the canvas size (docs/ARCHITECTURE.md 4.9 and
 * 4.17): at most `PERSPECTIVE_ROWS_MAX` rows and `PERSPECTIVE_COLUMNS_MAX`
 * columns per plane, `PERSPECTIVE_STARS_MAX` stars and
 * `PERSPECTIVE_MOUNTAIN_POINTS` silhouette points.
 */
import { formatNumber } from "../../curves";
import { createNoise2D, fbm2D } from "../../noise2d";
import { numberFormatter } from "../../polyline";
import { createRng, type Rng } from "../../rng";
import { stableId, svgDocument } from "../../svg";
import { MESH_FILTER_SIGMA_MAX, MESH_OUTPUT_EDGE_MAX } from "../mesh-gradient";
import { dotSites } from "../polka-dots";
import { sparklePath } from "../starry-sky";

/** Most rows per plane; the schema's `distance` stays below it. */
export const PERSPECTIVE_ROWS_MAX = 160;
/** Most columns per plane (lateral lines towards the vanishing point). */
export const PERSPECTIVE_COLUMNS_MAX = 801;
/** Most stars, whatever the canvas size and density. */
export const PERSPECTIVE_STARS_MAX = 1200;
/** Points of the mountain silhouette across the picture. */
export const PERSPECTIVE_MOUNTAIN_POINTS = 192;
/** Thinnest drawn line in px; thinner far rows are dropped (they vanish in the fade anyway). */
export const PERSPECTIVE_MIN_LINE = 0.05;
/** Smallest screen gap between two rows at the far end, as a share of the shorter edge. */
export const PERSPECTIVE_MIN_ROW_GAP = 0.003;
/** Colour stops of the depth fade per side of the horizon. */
const FADE_STOPS = 10;

export interface PerspectiveGridOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  /** Sky gradient from the top down to the horizon, at least one colour. */
  readonly sky: readonly string[];
  /** Ground colour below the horizon, or `"transparent"`. */
  readonly ground: string;
  /** Horizon position as a share of the height from the top, clamped to [0.05, 0.95]. */
  readonly horizon: number;
  /** Camera roll in degrees (slanted horizon), clamped to [-45, 45]. */
  readonly tilt: number;
  /** Field of view across the shorter edge in degrees, clamped to [10, 170]. */
  readonly fov: number;
  /** Camera height above the floor in cells (column spacing = 1). */
  readonly cameraHeight: number;
  /** Row spacing relative to the column spacing (cell depth). */
  readonly cellDepth: number;
  /** Visible rows from the near edge of the picture to the far end. */
  readonly distance: number;
  /** Line width in px at the near edge of the picture. */
  readonly lineWidth: number;
  /** 0 = constant width, 1 = width shrinks with depth like a strip on the floor. */
  readonly taper: number;
  readonly lineColor: string;
  /** Length of the fade towards the far end, [0, 1]; a short fade always remains. */
  readonly fade: number;
  /** Glow strength of lines and sun, [0, 1]. */
  readonly glow: number;
  /** Haze over the horizon in the last sky colour, [0, 1]. */
  readonly haze: number;
  /** Mirrored grid above the horizon. */
  readonly ceiling: boolean;
  readonly sun: boolean;
  /** Sun radius as a share of the shorter edge. */
  readonly sunSize: number;
  /** Sun centre above the horizon in sun radii (negative = setting). */
  readonly sunRise: number;
  /** Stripes cut out of the lower half of the sun, 0 = none. */
  readonly sunStripes: number;
  /** Sun gradient from top to bottom. */
  readonly sunColors: readonly [string, string];
  /** Star density in [0, 1]; 0 = no stars. */
  readonly stars: number;
  readonly starColor: string;
  /** Mountain height as a share of the shorter edge; 0 = no mountains. */
  readonly mountains: number;
  readonly mountainColor: string;
  /** Animation time in [0, 1): the floor moves one row towards the camera per loop. */
  readonly t?: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : lo;

const smoothstep = (a: number, b: number, x: number): number => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

/** The camera and the scene frame (the rotated canvas' bounding box, see `tilt`). */
export interface PerspectiveCamera {
  /** Scene frame size: the canvas rotated by `tilt` fits inside. */
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Offset of the scene frame from the canvas origin (before the roll). */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Horizon row in scene frame units. */
  readonly horizonY: number;
  /** Focal length in px. */
  readonly focal: number;
  /** `focal · cameraHeight`: a row at depth d lies `k / d` px from the horizon. */
  readonly k: number;
  /** Depth of the nearest visible floor row (lower frame edge) and ceiling row (upper edge). */
  readonly nearFloor: number;
  readonly nearCeiling: number;
  /** Depth of the far end (rows and columns end here). */
  readonly far: number;
  readonly rowSpacing: number;
  readonly tilt: number;
}

export function perspectiveCamera(
  o: Pick<
    PerspectiveGridOptions,
    "width" | "height" | "horizon" | "tilt" | "fov" | "cameraHeight" | "cellDepth" | "distance"
  > &
    Partial<Pick<PerspectiveGridOptions, "lineWidth" | "taper">>,
): PerspectiveCamera {
  const w = Math.max(1, o.width);
  const h = Math.max(1, o.height);
  const tilt = clamp(o.tilt, -45, 45);
  const a = (Math.abs(tilt) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const frameWidth = w * cos + h * sin;
  const frameHeight = w * sin + h * cos;
  const horizonY = frameHeight / 2 + (clamp(o.horizon, 0.05, 0.95) - 0.5) * h;
  const fov = (clamp(o.fov, 10, 170) * Math.PI) / 180;
  const focal = Math.min(w, h) / 2 / Math.tan(fov / 2);
  const k = focal * clamp(o.cameraHeight, 0.01, 100);
  const nearFloor = k / (frameHeight - horizonY);
  const nearCeiling = k / horizonY;
  const rowSpacing = clamp(o.cellDepth, 0.05, 20);
  const rows = clamp(Math.round(o.distance), 1, PERSPECTIVE_ROWS_MAX);
  // Rows closer together on screen than `minGap` only produce moiré: the far
  // end moves forward to where the row gap k · spacing / d² reaches it.
  const constantWidth = clamp(o.lineWidth ?? 0, 0, 1000) * (1 - clamp(o.taper ?? 1, 0, 1));
  const minGap = PERSPECTIVE_MIN_ROW_GAP * Math.min(w, h) + 1.5 * constantWidth;
  const gapFar = Math.sqrt((k * rowSpacing) / minGap);
  const far = Math.max(nearFloor + rowSpacing, Math.min(nearFloor + rows * rowSpacing, gapFar));
  return {
    frameWidth,
    frameHeight,
    offsetX: (w - frameWidth) / 2,
    offsetY: (h - frameHeight) / 2,
    horizonY,
    focal,
    k,
    nearFloor,
    nearCeiling,
    far,
    rowSpacing,
    tilt,
  };
}

/** Opacity of a line at depth `d`: 1 near, smoothly 0 at the far end. */
export function perspectiveFade(cam: PerspectiveCamera, fade: number, d: number): number {
  const length = (cam.far - cam.nearFloor) * (0.1 + 0.9 * clamp(fade, 0, 1));
  return 1 - smoothstep(cam.far - length, cam.far, d);
}

/**
 * Stops of the depth fade as `[offset, opacity]` over the scene frame height
 * (top to bottom): the ceiling side mirrors the floor side, the horizon itself
 * is fully transparent.
 */
export function perspectiveFadeStops(
  cam: PerspectiveCamera,
  fade: number,
): Array<readonly [number, number]> {
  const length = (cam.far - cam.nearFloor) * (0.1 + 0.9 * clamp(fade, 0, 1));
  const start = Math.max(cam.far - length, 1e-9);
  const floor: Array<readonly [number, number]> = [];
  for (let i = 0; i <= FADE_STOPS; i++) {
    const d = start + ((cam.far - start) * i) / FADE_STOPS;
    floor.push([cam.k / d, perspectiveFade(cam, fade, d)]);
  }
  // `floor` runs from the near end (largest offset) to the far end (smallest).
  const toOffset = (y: number): number => clamp(y / cam.frameHeight, 0, 1);
  const stops: Array<readonly [number, number]> = [];
  for (const [dy, op] of floor) stops.push([toOffset(cam.horizonY - dy), op]);
  stops.push([toOffset(cam.horizonY), 0]);
  for (let i = floor.length - 1; i >= 0; i--) {
    const [dy, op] = floor[i] as readonly [number, number];
    stops.push([toOffset(cam.horizonY + dy), op]);
  }
  return stops;
}

export interface PerspectiveLines {
  /** Path data of all lines of the plane (filled shapes). */
  readonly d: string;
  readonly rows: number;
  readonly columns: number;
}

/**
 * Rows and columns of one plane (`side` 1 = floor, −1 = ceiling) as filled
 * path data in scene frame units. Rows at depth `(j − t) · rowSpacing`, so
 * `t` from 0 to 1 moves the floor one row towards the camera and the loop is
 * seamless (the fade hides rows entering at the far end).
 */
export function perspectiveLines(
  cam: PerspectiveCamera,
  o: Pick<PerspectiveGridOptions, "lineWidth" | "taper"> & { readonly t?: number },
  side: 1 | -1,
): PerspectiveLines {
  const f = numberFormatter(2);
  const near = side === 1 ? cam.nearFloor : cam.nearCeiling;
  const lineWidth = clamp(o.lineWidth, 0, 1000);
  const taper = clamp(o.taper, 0, 1);
  const width = (d: number): number => lineWidth * (1 - taper + (taper * near) / d);
  const y = (d: number): number => cam.horizonY + (side * cam.k) / d;
  const parts: string[] = [];
  let rows = 0;
  let columns = 0;
  if (near >= cam.far || !(lineWidth > 0)) return { d: "", rows, columns };

  const pad = lineWidth + 1;
  const x0 = f(-pad);
  const x1 = f(cam.frameWidth + pad);
  const t = clamp(o.t ?? 0, 0, 1);
  const first = Math.ceil(near / cam.rowSpacing + t);
  const last = Math.min(Math.floor(cam.far / cam.rowSpacing + t), first + PERSPECTIVE_ROWS_MAX);
  for (let j = first; j <= last; j++) {
    const d = (j - t) * cam.rowSpacing;
    if (!(d > 0) || d < near || d >= cam.far) continue;
    const half = width(d) / 2;
    if (half * 2 < PERSPECTIVE_MIN_LINE) continue;
    const yc = y(d);
    parts.push(`M${x0} ${f(yc - half)}H${x1}V${f(yc + half)}H${x0}Z`);
    rows++;
  }

  // Columns at X = ±k (column spacing 1), symmetric around the vanishing point.
  const cx = cam.frameWidth / 2;
  const reach = cx + pad;
  const half = Math.floor((PERSPECTIVE_COLUMNS_MAX - 1) / 2);
  const needed = Math.ceil((reach * cam.far) / cam.focal) + 1;
  const kMax = Math.min(half, needed);
  for (let i = -kMax; i <= kMax; i++) {
    // A column enters the frame from the side once |f·X/d| <= reach.
    const enter = (cam.focal * Math.abs(i)) / reach;
    const dn = Math.max(near, enter);
    if (dn >= cam.far) continue;
    const ax = cx + (cam.focal * i) / dn;
    const ay = y(dn);
    const bx = cx + (cam.focal * i) / cam.far;
    const by = y(cam.far);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 0)) continue;
    const wa = width(dn) / 2;
    const wb = width(cam.far) / 2;
    if (wa * 2 < PERSPECTIVE_MIN_LINE) continue;
    const nx = -dy / len;
    const ny = dx / len;
    parts.push(
      `M${f(ax + nx * wa)} ${f(ay + ny * wa)}L${f(bx + nx * wb)} ${f(by + ny * wb)}` +
        `L${f(bx - nx * wb)} ${f(by - ny * wb)}L${f(ax - nx * wa)} ${f(ay - ny * wa)}Z`,
    );
    columns++;
  }
  return { d: parts.join(""), rows, columns };
}

/**
 * Largest blur standard deviation (user units) for a design of this size:
 * like `meshBlurPlan`, the filter must stay within `MESH_FILTER_SIGMA_MAX`
 * output pixels even when the SVG is exported with a longer edge of
 * `MESH_OUTPUT_EDGE_MAX` px (browsers clamp larger blurs differently).
 */
export function perspectiveGlowSigma(width: number, height: number, sigma: number): number {
  const cap = (MESH_FILTER_SIGMA_MAX * Math.max(1, width, height)) / MESH_OUTPUT_EDGE_MAX;
  return clamp(sigma, 0, cap);
}

/**
 * Solid parts of a striped sun (centre `cx, cy`, radius `r`) as rectangles
 * `[x, y, width, height]`: the upper part whole, the lower part cut by
 * `stripes` gaps that grow towards the bottom. Nothing below `limitY` (the
 * horizon), so a setting sun disappears behind it even on a transparent floor.
 */
export function sunBands(
  cx: number,
  cy: number,
  r: number,
  stripes: number,
  limitY: number,
): Array<readonly [number, number, number, number]> {
  const x = cx - r;
  const w = 2 * r;
  const top = cy - r;
  const bottom = Math.min(cy + r, limitY);
  const out: Array<readonly [number, number, number, number]> = [];
  const push = (y0: number, y1: number): void => {
    const a = Math.max(y0, top);
    const b = Math.min(y1, bottom);
    if (b > a) out.push([x, a, w, b - a]);
  };
  const n = clamp(Math.round(stripes), 0, 24);
  if (n === 0 || bottom - top < 0.3 * r) {
    push(top, bottom);
    return out;
  }
  // The stripes start a little above the centre and fill the visible lower part.
  const start = Math.min(cy - 0.1 * r, bottom - 0.25 * r);
  const cell = (bottom - start) / n;
  push(top, start);
  for (let i = 0; i < n; i++) {
    const gap = cell * (0.12 + (0.5 * i) / Math.max(1, n - 1));
    const y0 = start + i * cell;
    push(y0, y0 + cell - gap);
  }
  return out;
}

/**
 * Mountain heights at `PERSPECTIVE_MOUNTAIN_POINTS` evenly spaced points
 * across the frame, in px above the horizon: ridged fBm, lower towards the
 * centre so a sun between the ranges stays visible. The x positions are
 * spread over the frame width by the caller, so the range keeps its shape on
 * every canvas size.
 */
export function mountainRidge(rng: Rng, height: number): Float64Array {
  const noise = createNoise2D(rng);
  const n = PERSPECTIVE_MOUNTAIN_POINTS;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const ridge = 1 - Math.abs(fbm2D(noise, u * 7, 0.37, { octaves: 5, gain: 0.5 }));
    const envelope = 0.35 + 0.65 * smoothstep(0.04, 0.42, Math.abs(u - 0.5));
    out[i] = Math.max(0, height * envelope * (0.15 + 0.85 * ridge * ridge));
  }
  return out;
}

const STAR_SPACING_MAX = 0.16;
const STAR_SPACING_MIN = 0.012;

/** Stars in the sky above `limitY` (scene frame units) as SVG markup. */
function starsMarkup(
  rng: Rng,
  o: PerspectiveGridOptions,
  frameWidth: number,
  limitY: number,
): string {
  if (!(o.stars > 0) || limitY <= 1) return "";
  const minEdge = Math.min(o.width, o.height);
  const wanted =
    minEdge * (STAR_SPACING_MAX + (STAR_SPACING_MIN - STAR_SPACING_MAX) * clamp(o.stars, 0, 1));
  // Hex packing holds about area / (0.866 · s²) points; keep that under the cap.
  const capped = Math.sqrt((frameWidth * limitY) / (0.866 * PERSPECTIVE_STARS_MAX));
  const spacing = Math.max(wanted, capped, 2);
  const sites = dotSites({
    width: frameWidth,
    height: limitY,
    layout: "scatter",
    spacing,
    rng,
  });
  const f = numberFormatter(1);
  const byOpacity = new Map<number, string[]>();
  const sparkles: string[] = [];
  const maxR = Math.max(0.6, spacing * 0.07);
  for (const p of sites) {
    // Always two draws per star, so the sky does not shift with other options.
    const u = rng.next();
    const dim = rng.next();
    if (p.x < 0 || p.y < 0 || p.x > frameWidth || p.y > limitY) continue;
    // Stars thin out towards the horizon (haze, light pollution).
    const fadeOut = smoothstep(0, 0.35, (limitY - p.y) / limitY);
    const opacity = Math.round((1 - 0.7 * dim) * fadeOut * 10) / 10;
    if (opacity <= 0) continue;
    if (u > 0.985) {
      sparkles.push(sparklePath(p, maxR * 3.2));
      continue;
    }
    const r = Math.max(0.35, maxR * u * u);
    const list = byOpacity.get(opacity);
    const el = `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}"/>`;
    if (list) list.push(el);
    else byOpacity.set(opacity, [el]);
  }
  const groups = [...byOpacity.entries()]
    .sort(([a], [b]) => a - b)
    .map(([op, els]) =>
      op >= 1
        ? `<g fill="${o.starColor}">${els.join("")}</g>`
        : `<g fill="${o.starColor}" opacity="${formatNumber(op, 1)}">${els.join("")}</g>`,
    )
    .join("");
  return sparkles.length > 0
    ? `${groups}<path d="${sparkles.join("")}" fill="${o.starColor}"/>`
    : groups;
}

/** Vertical gradient definition in user space, plus its id. */
function verticalGradient(
  prefix: string,
  y1: number,
  y2: number,
  stops: ReadonlyArray<readonly [number, string, number]>,
): { id: string; def: string } {
  const body =
    `x1="0" y1="${formatNumber(y1, 2)}" x2="0" y2="${formatNumber(y2, 2)}" gradientUnits="userSpaceOnUse">` +
    stops
      .map(
        ([offset, color, opacity]) =>
          `<stop offset="${formatNumber(offset, 5)}" stop-color="${color}"${
            opacity < 1 ? ` stop-opacity="${formatNumber(opacity, 3)}"` : ""
          }/>`,
      )
      .join("");
  const id = stableId(prefix, body);
  return { id, def: `<linearGradient id="${id}" ${body}</linearGradient>` };
}

/** The whole scene as an SVG document. */
export function perspectiveGridSvg(o: PerspectiveGridOptions): string {
  // Fixed draw order of the sub-streams: toggling stars or mountains never moves the other.
  const starRng = createRng(o.rng.int(0, 0xffffffff));
  const mountainRng = createRng(o.rng.int(0, 0xffffffff));
  const cam = perspectiveCamera(o);
  const W = cam.frameWidth;
  const H = cam.frameHeight;
  const hy = cam.horizonY;
  const f2 = (v: number): string => formatNumber(v, 2);
  const minEdge = Math.min(o.width, o.height);
  const defs: string[] = [];
  const body: string[] = [];
  const glow = clamp(o.glow, 0, 1);

  // Sky down to the horizon.
  const sky = o.sky.length > 0 ? o.sky : ["#000000"];
  const skyGrad = verticalGradient(
    "pgsky",
    0,
    hy,
    sky.map((c, i) => [sky.length > 1 ? i / (sky.length - 1) : 0, c, 1] as const),
  );
  defs.push(skyGrad.def);
  body.push(`<rect width="${f2(W)}" height="${f2(hy)}" fill="url(#${skyGrad.id})"/>`);

  body.push(starsMarkup(starRng, o, W, hy));

  // Sun: gradient disc clipped to its stripes, with a soft radial halo.
  if (o.sun && o.sunSize > 0) {
    const r = clamp(o.sunSize, 0, 2) * minEdge;
    const cx = W / 2;
    const cy = hy - clamp(o.sunRise, -1, 1.5) * r;
    if (glow > 0) {
      const inner = `><stop offset="0" stop-color="${o.sunColors[1]}" stop-opacity="${formatNumber(0.55 * glow, 3)}"/><stop offset="1" stop-color="${o.sunColors[1]}" stop-opacity="0"/>`;
      const id = stableId("pghalo", inner);
      defs.push(`<radialGradient id="${id}"${inner}</radialGradient>`);
      body.push(
        `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r * (1.25 + 0.6 * glow))}" fill="url(#${id})"/>`,
      );
    }
    const bands = sunBands(cx, cy, r, o.sunStripes, hy);
    if (bands.length > 0) {
      const clip = bands
        .map(
          ([x, y, w, h]) => `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}"/>`,
        )
        .join("");
      const clipId = stableId("pgsun", clip);
      defs.push(`<clipPath id="${clipId}">${clip}</clipPath>`);
      const grad = verticalGradient("pgsunfill", cy - r, cy + r, [
        [0, o.sunColors[0], 1],
        [1, o.sunColors[1], 1],
      ]);
      defs.push(grad.def);
      body.push(
        `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="url(#${grad.id})" clip-path="url(#${clipId})"/>`,
      );
    }
  }

  // Mountains standing on the horizon.
  let rim = "";
  const mountainHeight = Math.min(clamp(o.mountains, 0, 1) * minEdge, hy * 0.95);
  if (mountainHeight > 0.5) {
    const heights = mountainRidge(mountainRng, mountainHeight);
    const f1 = numberFormatter(1);
    const n = heights.length;
    let line = "";
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * W;
      line += `${i === 0 ? "M" : "L"}${f1(x)} ${f1(hy - (heights[i] ?? 0))}`;
    }
    body.push(
      `<path d="M0 ${f1(hy)}${line.replace(/^M/, "L")}L${f1(W)} ${f1(hy)}Z" fill="${o.mountainColor}"/>`,
    );
    rim = `<path d="${line}" fill="none" stroke="${o.lineColor}" stroke-width="${f2(Math.max(0.5, o.lineWidth * 0.75))}" stroke-linejoin="round"/>`;
  }

  // Floor below the horizon.
  if (o.ground !== "transparent") {
    body.push(`<rect y="${f2(hy)}" width="${f2(W)}" height="${f2(H - hy)}" fill="${o.ground}"/>`);
  }

  // Grid lines with the depth fade, plus a blurred copy for the glow.
  const t = o.t;
  const lineOptions = { lineWidth: o.lineWidth, taper: o.taper, ...(t !== undefined ? { t } : {}) };
  const floor = perspectiveLines(cam, lineOptions, 1);
  const ceiling = o.ceiling ? perspectiveLines(cam, lineOptions, -1) : undefined;
  const gridD = floor.d + (ceiling?.d ?? "");
  let lines = "";
  if (gridD.length > 0) {
    const fade = verticalGradient(
      "pgfade",
      0,
      H,
      perspectiveFadeStops(cam, o.fade).map(([offset, op]) => [offset, o.lineColor, op] as const),
    );
    defs.push(fade.def);
    const gridId = stableId("pggrid", gridD);
    lines = `<path id="${gridId}" d="${gridD}" fill="url(#${fade.id})"/>`;
    if (glow > 0) {
      const sigma = perspectiveGlowSigma(
        o.width,
        o.height,
        glow * Math.max(1.5 * o.lineWidth, 0.004 * minEdge),
      );
      if (sigma >= 0.3) {
        const filter =
          `x="0" y="0" width="${f2(W)}" height="${f2(H)}" filterUnits="userSpaceOnUse" ` +
          `color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${f2(sigma)}"/>`;
        const filterId = stableId("pgglow", filter);
        defs.push(`<filter id="${filterId}" ${filter}</filter>`);
        lines =
          `<g filter="url(#${filterId})" opacity="${formatNumber(0.35 + 0.65 * glow, 2)}">` +
          `<use href="#${gridId}"/>${rim}</g>${lines}`;
      }
    }
  }
  body.push(lines, rim);

  // Haze over the horizon in the last sky colour.
  const haze = clamp(o.haze, 0, 1);
  if (haze > 0) {
    const color = sky[sky.length - 1] ?? "#000000";
    // Above: a fixed band. Below: past the far end of the floor, so the
    // empty strip between the last row and the horizon reads as distance.
    const above = 0.12 * o.height;
    const below = Math.max(0.06 * o.height, (1.8 * cam.k) / cam.far);
    const grad = verticalGradient("pghaze", hy - above, hy + below, [
      [0, color, 0],
      [above / (above + below), color, haze],
      [1, color, 0],
    ]);
    defs.push(grad.def);
    body.push(
      `<rect y="${f2(hy - above)}" width="${f2(W)}" height="${f2(above + below)}" fill="url(#${grad.id})"/>`,
    );
  }

  const scene = `<defs>${defs.join("")}</defs>${body.join("")}`;
  if (cam.tilt === 0) return svgDocument(o.width, o.height, scene);
  const transform =
    `rotate(${formatNumber(cam.tilt, 2)} ${f2(o.width / 2)} ${f2(o.height / 2)}) ` +
    `translate(${f2(cam.offsetX)} ${f2(cam.offsetY)})`;
  return svgDocument(o.width, o.height, `<g transform="${transform}">${scene}</g>`);
}
