/**
 * Halftone screens (docs/TOOLS.md E2 and E3): the picture is split into a
 * rotated grid of cells, each cell's mean darkness sets the size of one
 * dot (circle, square, diamond) or the thickness of one line segment.
 * Shared by the one-colour halftone and the CMYK halftone (one screen per
 * ink). Pure and deterministic; raster output is anti-aliased analytically,
 * the SVG output draws the same cells as vector shapes.
 */
import type { PixelBuffer } from "./buffer";

export const HALFTONE_SHAPES = ["circle", "line", "square", "diamond"] as const;
export type HalftoneShape = (typeof HALFTONE_SHAPES)[number];

/**
 * Below this cell size (output pixels) dots cannot be resolved: the raster
 * fades from the dots to the flat cell tone (what a downscaled print shows)
 * until `HALFTONE_FLAT_BELOW`, so small previews keep the right brightness.
 */
export const HALFTONE_DOTS_FROM = 4;
export const HALFTONE_FLAT_BELOW = 2;

const SQRT1_2 = Math.SQRT1_2;

/**
 * Share of a cell covered by a shape of `size` (cell units) repeated in
 * every cell. Circles (size = radius) overlap their neighbours above 0.5
 * and close the gaps at √½; squares (side) and lines (thickness) fill the
 * cell at 1; diamonds (diagonal) touch at 1 and fill at 2 (checkerboard).
 */
export function shapeCoverage(shape: HalftoneShape, size: number): number {
  const s = Math.max(0, size);
  switch (shape) {
    case "circle": {
      if (s <= 0.5) return Math.PI * s * s;
      if (s >= SQRT1_2) return 1;
      // Circle minus the four caps beyond the cell edges (they lie in the neighbours, which overlap back).
      const cap = s * s * Math.acos(0.5 / s) - 0.5 * Math.sqrt(s * s - 0.25);
      return Math.PI * s * s - 4 * cap;
    }
    case "square":
      return Math.min(1, s * s);
    case "line":
      return Math.min(1, s);
    case "diamond":
      if (s <= 1) return (s * s) / 2;
      if (s >= 2) return 1;
      return 1 - ((2 - s) * (2 - s)) / 2;
  }
}

/** Largest useful size of a shape (full coverage). */
export function shapeMaxSize(shape: HalftoneShape): number {
  return shape === "circle" ? SQRT1_2 : shape === "diamond" ? 2 : 1;
}

/** Inverse of `shapeCoverage`: the size that covers `coverage` (0 to 1) of a cell. */
export function shapeSizeForCoverage(shape: HalftoneShape, coverage: number): number {
  const c = Math.min(1, Math.max(0, coverage));
  switch (shape) {
    case "square":
      return Math.sqrt(c);
    case "line":
      return c;
    case "diamond":
      return c <= 0.5 ? Math.sqrt(2 * c) : 2 - Math.sqrt(2 * (1 - c));
    case "circle": {
      if (c <= Math.PI / 4) return Math.sqrt(c / Math.PI);
      let lo = 0.5;
      let hi = SQRT1_2;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (shapeCoverage("circle", mid) < c) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
  }
}

/** Coverage levels: a cell's darkness is rounded to 1/255 before it becomes a size. */
export const HALFTONE_LEVELS = 256;

const sizeLuts = new Map<HalftoneShape, Float32Array>();

/** Size per coverage level (`HALFTONE_LEVELS` entries, cell units), cached. */
export function halftoneSizeLut(shape: HalftoneShape): Float32Array {
  let lut = sizeLuts.get(shape);
  if (!lut) {
    lut = new Float32Array(HALFTONE_LEVELS);
    for (let i = 1; i < HALFTONE_LEVELS; i++) {
      lut[i] = shapeSizeForCoverage(shape, i / (HALFTONE_LEVELS - 1));
    }
    sizeLuts.set(shape, lut);
  }
  return lut;
}

/** Coverage level (0 to 255) of a coverage value. */
export const coverageLevel = (coverage: number): number =>
  Math.round(Math.min(1, Math.max(0, coverage)) * (HALFTONE_LEVELS - 1));

/**
 * A rotated cell grid over a `width` × `height` picture: cell `(i, j)` has
 * its centre at `(i + 0.5, j + 0.5)` cells from the rotation centre, along
 * the screen's axes (the grid is the picture's frame rotated by `angle`).
 * `i0`/`j0` are the first indices, `cols`/`rows` the count; the grid covers
 * the whole picture plus `margin` cells.
 */
export interface HalftoneScreen {
  /** Cell edge in pixels of the picture it was built for. */
  readonly cell: number;
  readonly angle: number;
  readonly cos: number;
  readonly sin: number;
  readonly cx: number;
  readonly cy: number;
  readonly i0: number;
  readonly j0: number;
  readonly cols: number;
  readonly rows: number;
}

/** Grid of `cell` px rotated by `angle` degrees around the picture's centre. */
export function halftoneScreen(
  width: number,
  height: number,
  cell: number,
  angle: number,
  margin = 1,
): HalftoneScreen {
  const c = Math.max(1e-3, cell);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const [x, y] of [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const) {
    const u = ((x - cx) * cos + (y - cy) * sin) / c;
    const v = (-(x - cx) * sin + (y - cy) * cos) / c;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }
  const m = Math.max(0, Math.ceil(margin));
  const i0 = Math.floor(uMin) - m;
  const j0 = Math.floor(vMin) - m;
  return {
    cell: c,
    angle,
    cos,
    sin,
    cx,
    cy,
    i0,
    j0,
    cols: Math.ceil(uMax) + m - i0,
    rows: Math.ceil(vMax) + m - j0,
  };
}

/** Cells of a screen (`cols × rows`). */
export const screenCells = (screen: HalftoneScreen): number => screen.cols * screen.rows;

/**
 * Per-pixel values for the screens: writes one value in [0, 1] per screen
 * into `out` (darkness, or ink coverage for CMYK) from 8-bit RGB.
 */
export type ScreenValues = (r: number, g: number, b: number, out: Float32Array) => void;

/**
 * Mean value per cell for each screen (screen `s` takes `out[s]` of
 * `values`), in one pass over the picture. Cells without a pixel centre
 * (outside the picture, or smaller than a pixel) take the value of the
 * pixel nearest to their centre.
 */
export function screenMeans(
  input: PixelBuffer,
  screens: readonly HalftoneScreen[],
  values: ScreenValues,
): Float32Array[] {
  const n = screens.length;
  const sums = screens.map((s) => new Float64Array(screenCells(s)));
  const counts = screens.map((s) => new Uint32Array(screenCells(s)));
  const tmp = new Float32Array(Math.max(1, n));
  const { width, height, data } = input;
  const du = screens.map((s) => s.cos / s.cell);
  const dv = screens.map((s) => -s.sin / s.cell);
  const u = new Float64Array(n);
  const v = new Float64Array(n);
  for (let y = 0, p = 0; y < height; y++) {
    for (let s = 0; s < n; s++) {
      const sc = screens[s] as HalftoneScreen;
      const ox = 0.5 - sc.cx;
      const oy = y + 0.5 - sc.cy;
      u[s] = (ox * sc.cos + oy * sc.sin) / sc.cell;
      v[s] = (-ox * sc.sin + oy * sc.cos) / sc.cell;
    }
    for (let x = 0; x < width; x++, p += 4) {
      values(data[p] ?? 0, data[p + 1] ?? 0, data[p + 2] ?? 0, tmp);
      for (let s = 0; s < n; s++) {
        const sc = screens[s] as HalftoneScreen;
        const i = Math.floor(u[s] ?? 0) - sc.i0;
        const j = Math.floor(v[s] ?? 0) - sc.j0;
        if (i >= 0 && j >= 0 && i < sc.cols && j < sc.rows) {
          const k = j * sc.cols + i;
          (sums[s] as Float64Array)[k] = ((sums[s] as Float64Array)[k] ?? 0) + (tmp[s] ?? 0);
          (counts[s] as Uint32Array)[k] = ((counts[s] as Uint32Array)[k] ?? 0) + 1;
        }
        u[s] = (u[s] ?? 0) + (du[s] ?? 0);
        v[s] = (v[s] ?? 0) + (dv[s] ?? 0);
      }
    }
  }
  return screens.map((sc, s) => {
    const sum = sums[s] as Float64Array;
    const count = counts[s] as Uint32Array;
    const means = new Float32Array(sum.length);
    for (let j = 0; j < sc.rows; j++) {
      for (let i = 0; i < sc.cols; i++) {
        const k = j * sc.cols + i;
        const c = count[k] ?? 0;
        if (c > 0) {
          means[k] = (sum[k] ?? 0) / c;
          continue;
        }
        const [px, py] = cellCentre(sc, i, j);
        const x = Math.min(width - 1, Math.max(0, Math.floor(px)));
        const y = Math.min(height - 1, Math.max(0, Math.floor(py)));
        const o = (y * width + x) * 4;
        values(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0, tmp);
        means[k] = tmp[s] ?? 0;
      }
    }
    return means;
  });
}

/** Picture position (px) of the centre of cell `(i, j)` (indices from 0). */
export function cellCentre(screen: HalftoneScreen, i: number, j: number): [number, number] {
  const a = (i + screen.i0 + 0.5) * screen.cell;
  const b = (j + screen.j0 + 0.5) * screen.cell;
  return [screen.cx + a * screen.cos - b * screen.sin, screen.cy + a * screen.sin + b * screen.cos];
}

/** Coverage levels (`coverageLevel`) of cell means. */
export function coverageLevels(means: Float32Array): Uint8Array {
  const out = new Uint8Array(means.length);
  for (let k = 0; k < means.length; k++) out[k] = coverageLevel(means[k] ?? 0);
  return out;
}

/** One halftone plate: a screen, its cells' coverage levels and its shape. */
export interface HalftonePlate {
  readonly screen: HalftoneScreen;
  /** Coverage level per cell (0 to 255). */
  readonly levels: Uint8Array;
  readonly shape: HalftoneShape;
  /** Registration offset in pixels of the picture (the plate is printed shifted). */
  readonly dx?: number;
  readonly dy?: number;
}

/**
 * Ink coverage (0 to 1) of row `y` of a plate, written to `out` (one value
 * per pixel). Dots are anti-aliased with their signed distance; cells
 * under `HALFTONE_DOTS_FROM` pixels fade to the flat tone.
 */
export function plateRow(plate: HalftonePlate, y: number, out: Float32Array): void {
  const { screen: sc, levels, shape } = plate;
  const sizes = halftoneSizeLut(shape);
  const px = sc.cell;
  const flat = Math.min(
    1,
    Math.max(0, (HALFTONE_DOTS_FROM - px) / (HALFTONE_DOTS_FROM - HALFTONE_FLAT_BELOW)),
  );
  const dots = 1 - flat;
  const ox = 0.5 - sc.cx - (plate.dx ?? 0);
  const oy = y + 0.5 - sc.cy - (plate.dy ?? 0);
  let u = (ox * sc.cos + oy * sc.sin) / px - sc.i0;
  let v = (-ox * sc.sin + oy * sc.cos) / px - sc.j0;
  const du = sc.cos / px;
  const dv = -sc.sin / px;
  const { cols, rows } = sc;
  const level = (i: number, j: number): number =>
    i >= 0 && j >= 0 && i < cols && j < rows ? (levels[j * cols + i] ?? 0) : 0;
  const width = out.length;
  for (let x = 0; x < width; x++, u += du, v += dv) {
    let alpha = 0;
    if (dots > 0) {
      let d = Infinity;
      if (shape === "line") {
        const i = Math.floor(u);
        const ja = Math.floor(v - 0.5);
        for (let dj = 0; dj < 2; dj++) {
          const l = level(i, ja + dj);
          if (l === 0) continue;
          const e = Math.abs(v - (ja + dj + 0.5)) - (sizes[l] ?? 0) / 2;
          if (e < d) d = e;
        }
      } else {
        const ia = Math.floor(u - 0.5);
        const ja = Math.floor(v - 0.5);
        for (let dj = 0; dj < 2; dj++) {
          for (let di = 0; di < 2; di++) {
            const l = level(ia + di, ja + dj);
            if (l === 0) continue;
            const s = sizes[l] ?? 0;
            const a = Math.abs(u - (ia + di + 0.5));
            const b = Math.abs(v - (ja + dj + 0.5));
            const e =
              shape === "circle"
                ? Math.sqrt(a * a + b * b) - s
                : shape === "square"
                  ? Math.max(a, b) - s / 2
                  : (a + b - s / 2) * SQRT1_2;
            if (e < d) d = e;
          }
        }
      }
      const aa = 0.5 - d * px;
      alpha = aa <= 0 ? 0 : aa >= 1 ? 1 : aa;
    }
    if (flat > 0) {
      const tone = level(Math.floor(u), Math.floor(v)) / (HALFTONE_LEVELS - 1);
      alpha = alpha * dots + tone * flat;
    }
    out[x] = alpha;
  }
}

/** Shapes a plate draws (cells with ink), as `halftoneSvgPlate` would emit them. */
export function plateShapeCount(plate: HalftonePlate): number {
  let n = 0;
  for (const l of plate.levels) if (l > 0) n++;
  return n;
}

/** Upper estimate of the cells per plate for a `width` × `height` design at `cell` px. */
export function halftoneCellEstimate(width: number, height: number, cell: number): number {
  const c = Math.max(1e-3, cell);
  return Math.ceil((width / c + 2) * (height / c + 2));
}

/** Number with at most `d` decimals, no trailing zeros, no negative zero. */
function fmt(value: number, d: number): string {
  const f = 10 ** d;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? "0" : String(r);
}

/**
 * One plate as SVG (`<g>` with the screen's rotation), in design units:
 * `scale` is picture pixels per design unit. Circles and squares are
 * zero-length strokes with round or square caps, one `<path>` per size;
 * diamonds are squares in a frame turned by 45°; lines are one filled
 * outline per row of cells. Cells whose shape cannot reach the design are
 * left out. `extra` is added to the `<g>` (e.g. a blend mode).
 */
export function halftoneSvgPlate(
  plate: HalftonePlate,
  color: string,
  scale: number,
  design: { width: number; height: number },
  extra = "",
): string {
  const { screen: sc, levels, shape } = plate;
  const k = 1 / Math.max(1e-6, scale);
  const cell = sc.cell * k;
  const cx = sc.cx * k + (plate.dx ?? 0) * k;
  const cy = sc.cy * k + (plate.dy ?? 0) * k;
  const sizes = halftoneSizeLut(shape);
  const reach = cell * 1.5;
  const visible = (a: number, b: number): boolean => {
    const x = cx + a * sc.cos - b * sc.sin;
    const y = cy + a * sc.sin + b * sc.cos;
    return x > -reach && y > -reach && x < design.width + reach && y < design.height + reach;
  };
  const transform = `translate(${fmt(cx, 2)} ${fmt(cy, 2)}) rotate(${fmt(sc.angle, 3)})`;
  const parts: string[] = [];
  if (shape === "line") {
    const d: string[] = [];
    for (let j = 0; j < sc.rows; j++) {
      const yc = (j + sc.j0 + 0.5) * cell;
      let i = 0;
      while (i < sc.cols) {
        // A run of consecutive visible cells with ink becomes one outline.
        const start = i;
        while (
          i < sc.cols &&
          (levels[j * sc.cols + i] ?? 0) > 0 &&
          visible((i + sc.i0 + 0.5) * cell, yc)
        ) {
          i++;
        }
        if (i === start) {
          i++;
          continue;
        }
        const half = (c: number) => ((sizes[levels[j * sc.cols + c] ?? 0] ?? 0) * cell) / 2;
        const x = (c: number) => (c + sc.i0) * cell;
        let path = `M${fmt(x(start), 1)} ${fmt(yc - half(start), 2)}`;
        for (let c = start; c < i; c++) {
          if (c > start) path += `V${fmt(yc - half(c), 2)}`;
          path += `H${fmt(x(c + 1), 1)}`;
        }
        path += `V${fmt(yc + half(i - 1), 2)}`;
        for (let c = i - 1; c >= start; c--) {
          if (c < i - 1) path += `V${fmt(yc + half(c), 2)}`;
          path += `H${fmt(x(c), 1)}`;
        }
        d.push(`${path}Z`);
      }
    }
    if (d.length > 0) parts.push(`<path d="${d.join("")}"/>`);
    return `<g transform="${transform}" fill="${color}"${extra}>${parts.join("")}</g>`;
  }
  const buckets = new Map<number, string[]>();
  const turn = shape === "diamond";
  for (let j = 0; j < sc.rows; j++) {
    const b = (j + sc.j0 + 0.5) * cell;
    for (let i = 0; i < sc.cols; i++) {
      const l = levels[j * sc.cols + i] ?? 0;
      if (l === 0) continue;
      const a = (i + sc.i0 + 0.5) * cell;
      if (!visible(a, b)) continue;
      // Diamonds: the frame turns by another 45°, so the point turns back.
      const x = turn ? (a + b) * SQRT1_2 : a;
      const y = turn ? (b - a) * SQRT1_2 : b;
      let bucket = buckets.get(l);
      if (!bucket) {
        bucket = [];
        buckets.set(l, bucket);
      }
      bucket.push(`M${fmt(x, 1)} ${fmt(y, 1)}h0`);
    }
  }
  const levelsUsed = [...buckets.keys()].sort((p, q) => p - q);
  for (const l of levelsUsed) {
    const s = sizes[l] ?? 0;
    // Stroke width: diameter (circle), side (square), side of the diamond.
    const w =
      shape === "circle" ? 2 * s * cell : shape === "square" ? s * cell : s * cell * SQRT1_2;
    parts.push(`<path stroke-width="${fmt(w, 2)}" d="${(buckets.get(l) ?? []).join("")}"/>`);
  }
  const cap = shape === "circle" ? "round" : "square";
  const rotate = turn ? `${transform} rotate(45)` : transform;
  return `<g transform="${rotate}" fill="none" stroke="${color}" stroke-linecap="${cap}"${extra}>${parts.join("")}</g>`;
}
