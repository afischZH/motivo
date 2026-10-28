/**
 * Flow fields (docs/TOOLS.md K2). A seeded angle field (fBm noise turned into
 * directions, or the curl of an fBm potential, which is divergence free and
 * never lets lines converge) is sampled once on a grid. Lines start at seed
 * points (Poisson disk, jittered grid or uniform) and are traced in both
 * directions with second-order Runge-Kutta steps. With a separation above 0
 * a line stops when it comes closer to another line (or an older part of
 * itself) than `separation × spacing`, after Jobard and Lefer's evenly spaced
 * streamlines, so lines never clump.
 *
 * Work is independent of the canvas size: the field grid, the number of
 * lines, the integration steps and the output points are all capped
 * (`FLOW_*_MAX`), so render time and SVG size stay bounded.
 */
import { samplePalette } from "../../color";
import { formatNumber } from "../../curves";
import { createNoise2D, fbm2D } from "../../noise2d";
import { poissonDisk } from "../../poisson";
import {
  pointCount,
  polylineLength,
  polylinePathData,
  simplifyPolyline,
  slicePolyline,
  subdividePolyline,
} from "../../polyline";
import { createRng, type Rng } from "../../rng";
import { svgBackground, svgDocument } from "../../svg";

export const FLOW_FIELD_MODES = ["noise", "curl"] as const;
/** `noise`: fBm angles around a main direction; `curl`: curl of an fBm potential (swirls, no clumps). */
export type FlowFieldMode = (typeof FLOW_FIELD_MODES)[number];

export const FLOW_SEEDINGS = ["poisson", "grid", "random"] as const;
export type FlowSeeding = (typeof FLOW_SEEDINGS)[number];

export const FLOW_TAPERS = ["none", "tail", "both"] as const;
/** Stroke width along a line: constant, thinning towards the end, or thin at both ends. */
export type FlowTaper = (typeof FLOW_TAPERS)[number];

export const FLOW_COLOR_MODES = ["palette", "angle", "position"] as const;
export type FlowColorMode = (typeof FLOW_COLOR_MODES)[number];

/** Field grid cells along the shorter edge. */
export const FLOW_GRID_RESOLUTION = 160;
export const FLOW_GRID_CELLS_MAX = 64_000;
export const FLOW_LINES_MAX = 4000;
/** Integration steps per line and direction. */
export const FLOW_LINE_STEPS_MAX = 600;
/** Integration steps of all lines together (bounds the render time). */
export const FLOW_STEPS_MAX = 150_000;
/** Output path points (about 10 to 12 bytes each, so well under 1.5 MB of SVG). */
export const FLOW_POINTS_MAX = 90_000;
/** Colour steps of the angle and position modes (one path element per step). */
const COLOR_BINS = 24;
/** Length of the gap that travels along each line during the animation, as a share of the line. */
const FLOW_GAP_SHARE = 0.35;

export interface FlowFieldOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly mode: FlowFieldMode;
  /** Feature size relative to the shorter edge. */
  readonly scale: number;
  readonly octaves: number;
  /** Angle spread of the noise mode: 0 = all lines parallel, 1 = half a turn each way. */
  readonly turbulence: number;
  /** Main direction of the noise mode in degrees (0 = to the right, clockwise). */
  readonly direction: number;
}

export interface FlowField {
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  /** Canvas position of sample (0, 0) in px. */
  readonly originX: number;
  readonly originY: number;
}

/** Samples the direction field. Consumes one noise permutation and two offsets. */
export function flowField(o: FlowFieldOptions): FlowField {
  const noise = createNoise2D(o.rng);
  const offX = o.rng.float(0, 200);
  const offY = o.rng.float(0, 200);
  const short = Math.max(1, Math.min(o.width, o.height));
  let cell = short / FLOW_GRID_RESOLUTION;
  const count = (c: number): number => (Math.ceil(o.width / c) + 5) * (Math.ceil(o.height / c) + 5);
  if (count(cell) > FLOW_GRID_CELLS_MAX) {
    cell *= Math.sqrt(count(cell) / FLOW_GRID_CELLS_MAX);
    while (count(cell) > FLOW_GRID_CELLS_MAX) cell *= 1.02;
  }
  const cols = Math.ceil(o.width / cell) + 5;
  const rows = Math.ceil(o.height / cell) + 5;
  const originX = -2 * cell;
  const originY = -2 * cell;
  const freq = 1 / (short * Math.max(o.scale, 0.01));
  const octaves = Math.max(1, Math.floor(o.octaves));
  const sample = (i: number, j: number): number =>
    fbm2D(noise, (originX + i * cell) * freq + offX, (originY + j * cell) * freq + offY, {
      octaves,
    });

  const vx = new Float32Array(cols * rows);
  const vy = new Float32Array(cols * rows);
  if (o.mode === "curl") {
    // Potential with one extra ring for central differences.
    const pc = cols + 2;
    const pot = new Float64Array(pc * (rows + 2));
    for (let j = 0; j < rows + 2; j++) {
      for (let i = 0; i < pc; i++) pot[j * pc + i] = sample(i - 1, j - 1);
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = (j + 1) * pc + i + 1;
        const dx = (pot[k + 1] ?? 0) - (pot[k - 1] ?? 0);
        const dy = (pot[k + pc] ?? 0) - (pot[k - pc] ?? 0);
        vx[j * cols + i] = dy;
        vy[j * cols + i] = -dx;
      }
    }
  } else {
    const base = (o.direction * Math.PI) / 180;
    const spread = Math.max(o.turbulence, 0) * Math.PI * 2;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + spread * sample(i, j);
        vx[j * cols + i] = Math.cos(a);
        vy[j * cols + i] = Math.sin(a);
      }
    }
  }
  return { vx, vy, cols, rows, cell, originX, originY };
}

/**
 * Unit direction of the field at a canvas point (bilinear), written to `out`.
 * Returns false where the field vanishes (curl critical points, opposing
 * directions) or outside the sampled area.
 */
export function flowDirection(f: FlowField, x: number, y: number, out: [number, number]): boolean {
  const gx = (x - f.originX) / f.cell;
  const gy = (y - f.originY) / f.cell;
  if (!(gx >= 0 && gy >= 0 && gx < f.cols - 1 && gy < f.rows - 1)) return false;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const u = gx - i;
  const v = gy - j;
  const k = j * f.cols + i;
  const c = f.cols;
  const w00 = (1 - u) * (1 - v);
  const w10 = u * (1 - v);
  const w01 = (1 - u) * v;
  const w11 = u * v;
  const dx =
    (f.vx[k] ?? 0) * w00 +
    (f.vx[k + 1] ?? 0) * w10 +
    (f.vx[k + c] ?? 0) * w01 +
    (f.vx[k + c + 1] ?? 0) * w11;
  const dy =
    (f.vy[k] ?? 0) * w00 +
    (f.vy[k + 1] ?? 0) * w10 +
    (f.vy[k + c] ?? 0) * w01 +
    (f.vy[k + c + 1] ?? 0) * w11;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 1e-9)) return false;
  out[0] = dx / len;
  out[1] = dy / len;
  return true;
}

export interface FlowLinesOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly seeding: FlowSeeding;
  /** Distance between seed points and lines in px. */
  readonly spacing: number;
  /** Share of `spacing` that lines keep from each other, 0 = lines may touch and cross. */
  readonly separation: number;
  /** Integration step in px. */
  readonly step: number;
  /** Longest line in px. */
  readonly length: number;
  /** Upper bound of lines. */
  readonly maxLines: number;
  /** Extra room around the canvas where lines may continue, in px. */
  readonly margin: number;
}

export interface FlowLine {
  /** Points in px, flat `[x0, y0, ...]`, in flow direction. */
  readonly points: number[];
  /** Field direction at the seed point in radians. */
  readonly angle: number;
}

/** Seed candidates in random order. */
function seedPoints(o: FlowLinesOptions, rng: Rng): { x: number; y: number }[] {
  const { width: w, height: h, spacing } = o;
  if (o.seeding === "random") {
    return Array.from({ length: Math.min(o.maxLines, FLOW_LINES_MAX) }, () => ({
      x: rng.float(0, w),
      y: rng.float(0, h),
    }));
  }
  if (o.seeding === "grid") {
    const pts: { x: number; y: number }[] = [];
    const cols = Math.max(1, Math.round(w / spacing));
    const rows = Math.max(1, Math.round(h / spacing));
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        pts.push({
          x: ((i + 0.5) * w) / cols + rng.float(-0.2, 0.2) * spacing,
          y: ((j + 0.5) * h) / rows + rng.float(-0.2, 0.2) * spacing,
        });
      }
    }
    return rng.shuffle(pts);
  }
  return rng.shuffle(
    poissonDisk({ width: w, height: h, minDistance: spacing, rng, maxAttempts: 12 }),
  );
}

/**
 * Traces the lines through the field. Deterministic for the rng state; the
 * field itself is not consumed from the rng here.
 */
export function flowLines(field: FlowField, o: FlowLinesOptions): FlowLine[] {
  const rng = o.rng;
  const seeds = seedPoints(o, rng);
  const h = Math.max(o.step, 0.05);
  const maxSteps = Math.min(Math.ceil(o.length / 2 / h), FLOW_LINE_STEPS_MAX);
  const dTest = Math.max(o.separation, 0) * o.spacing;
  const check = dTest > 0;
  const minX = -o.margin;
  const minY = -o.margin;
  const maxX = o.width + o.margin;
  const maxY = o.height + o.margin;

  // Spatial hash of all accepted points (and the line being traced) as linked
  // lists in typed arrays: `head` per bucket, `next` per point.
  const short = Math.max(1, Math.min(o.width, o.height));
  const hashCell = Math.max(dTest, short / 300, 0.5);
  const hc = Math.ceil((maxX - minX) / hashCell) + 1;
  const hr = Math.ceil((maxY - minY) / hashCell) + 1;
  const capacity = check ? FLOW_STEPS_MAX + FLOW_LINES_MAX : 0;
  const head = new Int32Array(check ? hc * hr : 0).fill(-1);
  const next = new Int32Array(capacity);
  const px = new Float64Array(capacity);
  const py = new Float64Array(capacity);
  const owner = new Int32Array(capacity);
  const order = new Int32Array(capacity);
  const alive: boolean[] = [];
  let stored = 0;
  /** Own points closer than this many steps along the line are ignored. */
  const selfSkip = Math.ceil((dTest * 1.5) / h) + 2;
  const insert = (x: number, y: number, line: number, index: number): void => {
    if (!check || stored >= capacity) return;
    const cx = Math.min(Math.max(Math.floor((x - minX) / hashCell), 0), hc - 1);
    const cy = Math.min(Math.max(Math.floor((y - minY) / hashCell), 0), hr - 1);
    const b = cy * hc + cx;
    px[stored] = x;
    py[stored] = y;
    owner[stored] = line;
    order[stored] = index;
    next[stored] = head[b] ?? -1;
    head[b] = stored;
    stored++;
  };
  const crowded = (x: number, y: number, line: number, index: number, d: number): boolean => {
    if (!check) return false;
    const dSq = d * d;
    const reach = Math.ceil(d / hashCell);
    const cx = Math.floor((x - minX) / hashCell);
    const cy = Math.floor((y - minY) / hashCell);
    const j0 = Math.max(cy - reach, 0);
    const j1 = Math.min(cy + reach, hr - 1);
    const i0 = Math.max(cx - reach, 0);
    const i1 = Math.min(cx + reach, hc - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (let id = head[j * hc + i] ?? -1; id !== -1; id = next[id] ?? -1) {
          const who = owner[id] ?? -1;
          if (who === line) {
            if (Math.abs((order[id] ?? 0) - index) <= selfSkip) continue;
          } else if (!alive[who]) continue;
          const dx = (px[id] ?? 0) - x;
          const dy = (py[id] ?? 0) - y;
          if (dx * dx + dy * dy < dSq) return true;
        }
      }
    }
    return false;
  };

  const lines: FlowLine[] = [];
  const dir: [number, number] = [0, 0];
  const mid: [number, number] = [0, 0];
  let stepsLeft = FLOW_STEPS_MAX;
  const limit = Math.min(Math.max(Math.floor(o.maxLines), 1), FLOW_LINES_MAX);
  // A seed needs the full spacing around it (Jobard-Lefer's d_sep), the line then keeps d_test.
  const seedDistance = check ? o.spacing * Math.min(1, o.separation + 0.25) : 0;

  for (const seed of seeds) {
    if (lines.length >= limit || stepsLeft <= 0) break;
    if (check && crowded(seed.x, seed.y, -1, 0, seedDistance)) continue;
    if (!flowDirection(field, seed.x, seed.y, dir)) continue;
    const angle = Math.atan2(dir[1], dir[0]);
    const line = alive.length;
    alive.push(true);
    insert(seed.x, seed.y, line, 0);
    const halves: number[][] = [];
    for (const sign of [-1, 1]) {
      const pts: number[] = [];
      let x = seed.x;
      let y = seed.y;
      for (let s = 1; s <= maxSteps && stepsLeft > 0; s++) {
        stepsLeft--;
        if (!flowDirection(field, x, y, dir)) break;
        const mx = x + sign * dir[0] * h * 0.5;
        const my = y + sign * dir[1] * h * 0.5;
        if (!flowDirection(field, mx, my, mid)) break;
        const nx = x + sign * mid[0] * h;
        const ny = y + sign * mid[1] * h;
        if (nx < minX || ny < minY || nx > maxX || ny > maxY) break;
        if (check && crowded(nx, ny, line, sign * s, dTest)) break;
        x = nx;
        y = ny;
        pts.push(x, y);
        insert(x, y, line, sign * s);
      }
      halves.push(pts);
    }
    const back = halves[0] ?? [];
    const fwd = halves[1] ?? [];
    if (pointCount(back) + pointCount(fwd) < 3) {
      alive[line] = false;
      continue;
    }
    const points: number[] = [];
    for (let i = back.length - 2; i >= 0; i -= 2) points.push(back[i] ?? 0, back[i + 1] ?? 0);
    points.push(seed.x, seed.y, ...fwd);
    lines.push({ points, angle });
  }
  return lines;
}

/** Closed outline of a line whose half width follows `profile(s)` for s in [0, 1] along it. */
export function taperOutline(
  points: readonly number[],
  halfWidth: number,
  profile: (s: number) => number,
): number[] {
  const n = pointCount(points);
  if (n < 2) return [];
  const total = polylineLength(points);
  if (!(total > 0)) return [];
  const left: number[] = [];
  const right: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const dx = (points[2 * i] ?? 0) - (points[2 * i - 2] ?? 0);
      const dy = (points[2 * i + 1] ?? 0) - (points[2 * i - 1] ?? 0);
      s += Math.sqrt(dx * dx + dy * dy);
    }
    const a = Math.max(i - 1, 0);
    const b = Math.min(i + 1, n - 1);
    let tx = (points[2 * b] ?? 0) - (points[2 * a] ?? 0);
    let ty = (points[2 * b + 1] ?? 0) - (points[2 * a + 1] ?? 0);
    const len = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= len;
    ty /= len;
    const r = halfWidth * profile(s / total);
    const x = points[2 * i] ?? 0;
    const y = points[2 * i + 1] ?? 0;
    left.push(x - ty * r, y + tx * r);
    right.push(x + ty * r, y - tx * r);
  }
  const out = left;
  for (let i = right.length - 2; i >= 0; i -= 2) out.push(right[i] ?? 0, right[i + 1] ?? 0);
  return out;
}

const TAPER_FLOOR = 0.08;
const PROFILES: Record<Exclude<FlowTaper, "none">, (s: number) => number> = {
  tail: (s) => Math.max(Math.pow(Math.max(1 - s, 0), 0.8), TAPER_FLOOR),
  both: (s) => Math.max(Math.pow(Math.max(Math.sin(Math.PI * s), 0), 0.6), TAPER_FLOOR),
};

export interface FlowSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly background: string;
  readonly colors: readonly string[];
  readonly mode: FlowFieldMode;
  /** Feature size in percent of the shorter edge. */
  readonly scale: number;
  readonly octaves: number;
  readonly turbulence: number;
  readonly direction: number;
  readonly seeding: FlowSeeding;
  /** Line spacing in percent of the shorter edge. */
  readonly spacing: number;
  readonly separation: number;
  /** Integration step in per mille of the shorter edge. */
  readonly step: number;
  /** Longest line in percent of the shorter edge. */
  readonly length: number;
  readonly maxLines: number;
  /** Stroke width in px. */
  readonly lineWidth: number;
  readonly taper: FlowTaper;
  readonly colorMode: FlowColorMode;
  /** Opacity of the lines, (0, 1]. */
  readonly opacity: number;
  /** Animation time in [0, 1): a gap travels along every line; 0 is the still design. */
  readonly t?: number;
}

export function flowSvg(o: FlowSvgOptions): string {
  const { width: w, height: h } = o;
  const short = Math.max(1, Math.min(w, h));
  // Fixed order of rng use: field, then one seed for lines and one for colours,
  // so changing the colours never moves a line.
  const field = flowField({
    width: w,
    height: h,
    rng: o.rng,
    mode: o.mode,
    scale: o.scale / 100,
    octaves: o.octaves,
    turbulence: o.turbulence,
    direction: o.direction,
  });
  const lineRng = createRng(o.rng.int(0, 0xffffffff));
  const colorRng = createRng(o.rng.int(0, 0xffffffff));
  const sw = Math.max(o.lineWidth, 0);
  const lines = flowLines(field, {
    width: w,
    height: h,
    rng: lineRng,
    seeding: o.seeding,
    spacing: (o.spacing / 100) * short,
    separation: o.separation,
    step: (o.step / 1000) * short,
    length: (o.length / 100) * short,
    maxLines: o.maxLines,
    margin: sw * 2,
  });

  const cyclic = samplePalette([...o.colors, o.colors[0] ?? "#000000"], COLOR_BINS + 1).slice(
    0,
    COLOR_BINS,
  );
  const linear = samplePalette(o.colors, COLOR_BINS);
  const colorOf = (line: FlowLine): string => {
    if (o.colorMode === "palette") return colorRng.pick(o.colors);
    if (o.colorMode === "angle") {
      const u = (line.angle + Math.PI) / (2 * Math.PI);
      return cyclic[Math.round(u * COLOR_BINS) % COLOR_BINS] ?? "#000000";
    }
    const n = pointCount(line.points);
    const m = line.points.length > 0 ? Math.floor(n / 2) : 0;
    const u = ((line.points[2 * m] ?? 0) / w + (line.points[2 * m + 1] ?? 0) / h) / 2;
    return linear[Math.round(Math.min(Math.max(u, 0), 1) * (COLOR_BINS - 1))] ?? "#000000";
  };

  const tolerance = short * 0.0002;
  const taper = o.taper === "none" ? undefined : PROFILES[o.taper];
  // Animation: a gap travels along every line, from before its start to after its end, so
  // t = 0 is the still design and the loop is seamless.
  const t = o.t !== undefined && Number.isFinite(o.t) ? o.t - Math.floor(o.t) : 0;
  const groups = new Map<string, string[]>();
  let points = 0;
  for (const line of lines) {
    const color = colorOf(line);
    if (points >= FLOW_POINTS_MAX) continue;
    const simple = simplifyPolyline(line.points, tolerance);
    let pieces = [simple];
    if (t > 0) {
      const total = polylineLength(simple);
      const gap = total * FLOW_GAP_SHARE;
      const start = -gap + t * (total + gap);
      pieces = [slicePolyline(simple, 0, start), slicePolyline(simple, start + gap, total)]
        .filter((p) => p.length > 0)
        .map((p) => (taper ? subdividePolyline(p, total / 16) : p));
    }
    const list = groups.get(color) ?? [];
    for (const piece of pieces) {
      if (taper) {
        const outline = taperOutline(piece, sw / 2, taper);
        if (outline.length === 0) continue;
        points += pointCount(outline);
        list.push(polylinePathData(outline, true));
      } else {
        points += pointCount(piece);
        list.push(polylinePathData(piece));
      }
    }
    if (list.length > 0) groups.set(color, list);
  }

  const alpha = Math.min(Math.max(o.opacity, 0), 1);
  const paint = taper ? "fill" : "stroke";
  const opacity = alpha < 1 ? ` ${paint}-opacity="${formatNumber(alpha, 2)}"` : "";
  let paths = "";
  for (const [color, ds] of groups)
    paths += `<path d="${ds.join("")}" ${paint}="${color}"${opacity}/>`;
  let body = svgBackground(o.background, w, h);
  if (paths && (taper || sw > 0)) {
    body += taper
      ? `<g stroke="none">${paths}</g>`
      : `<g fill="none" stroke-width="${formatNumber(sw, 2)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`;
  }
  return svgDocument(w, h, body);
}
