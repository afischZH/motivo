/**
 * A small reader for the absolute SVG path data the shape library writes
 * (M, L, H, V, C, S, Q, T, A, Z). Used to move shapes into the 0..100 box,
 * to measure them and, in tests, to check and rasterise every shape.
 * Relative commands are rejected on purpose: library paths are absolute.
 */
import { formatNumber } from "../curves";

export interface PathCommand {
  readonly cmd: "M" | "L" | "H" | "V" | "C" | "S" | "Q" | "T" | "A" | "Z";
  readonly args: readonly number[];
}

const ARITY: Record<PathCommand["cmd"], number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

const TOKEN = /([MLHVCSQTAZ])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)|([\s,]+)|(.)/gi;

/**
 * Parses absolute path data. Throws a `SyntaxError` on unknown or relative
 * commands, wrong argument counts or a path that does not start with M.
 * Implicit repeats ("L1 2 3 4") are split into single commands.
 */
export function parsePathData(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  let cmd: PathCommand["cmd"] | null = null;
  let args: number[] = [];
  const flush = () => {
    if (cmd === null) return;
    const n = ARITY[cmd];
    if (n === 0) {
      if (args.length > 0) throw new SyntaxError("Z takes no arguments");
      out.push({ cmd, args: [] });
      return;
    }
    if (args.length === 0 || args.length % n !== 0) {
      throw new SyntaxError(`${cmd} needs a multiple of ${n} numbers, got ${args.length}`);
    }
    for (let i = 0; i < args.length; i += n) {
      // Repeats after M are line-tos, as in SVG.
      out.push({ cmd: cmd === "M" && i > 0 ? "L" : cmd, args: args.slice(i, i + n) });
    }
  };
  for (const m of d.matchAll(TOKEN)) {
    if (m[1] !== undefined) {
      flush();
      const c = m[1];
      if (c !== c.toUpperCase()) throw new SyntaxError(`relative command ${c} not allowed`);
      cmd = c as PathCommand["cmd"];
      args = [];
    } else if (m[2] !== undefined) {
      if (cmd === null) throw new SyntaxError("number before the first command");
      const v = Number(m[2]);
      if (!Number.isFinite(v)) throw new SyntaxError(`bad number ${m[2]}`);
      args.push(v);
    } else if (m[4] !== undefined) {
      throw new SyntaxError(`unexpected character ${m[4]}`);
    }
  }
  flush();
  if (out.length === 0 || out[0]?.cmd !== "M") throw new SyntaxError("path must start with M");
  return out;
}

type P = [number, number];

/** Centre parameterisation of an SVG arc (SVG 1.1 F.6.5), as points along it. */
function arcPoints(
  from: P,
  rx0: number,
  ry0: number,
  phiDeg: number,
  large: number,
  sweep: number,
  to: P,
  steps: number,
): P[] {
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  if (rx === 0 || ry === 0 || (from[0] === to[0] && from[1] === to[1])) return [to];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from[0] - to[0]) / 2;
  const dy = (from[1] - to[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (sweep === 0 && dt > 0) dt -= 2 * Math.PI;
  if (sweep === 1 && dt < 0) dt += 2 * Math.PI;
  const pts: P[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = t1 + (dt * i) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    pts.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  pts[pts.length - 1] = to;
  return pts;
}

/**
 * Flattens path data into closed polygons (one per subpath), curves and arcs
 * sampled with `steps` points each.
 */
export function flattenPath(d: string, steps = 16): P[][] {
  const polys: P[][] = [];
  let cur: P[] = [];
  let pos: P = [0, 0];
  let start: P = [0, 0];
  let lastCtrl: P | null = null;
  let lastKind: "C" | "Q" | null = null;
  const close = () => {
    if (cur.length > 1) polys.push(cur);
    cur = [];
  };
  const cubic = (c1: P, c2: P, to: P) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      cur.push([
        u * u * u * pos[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * to[0],
        u * u * u * pos[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * to[1],
      ]);
    }
  };
  const quad = (c: P, to: P) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      cur.push([
        u * u * pos[0] + 2 * u * t * c[0] + t * t * to[0],
        u * u * pos[1] + 2 * u * t * c[1] + t * t * to[1],
      ]);
    }
  };
  for (const { cmd, args: a } of parsePathData(d)) {
    const n = (i: number) => a[i] as number;
    let kind: "C" | "Q" | null = null;
    switch (cmd) {
      case "M":
        close();
        pos = [n(0), n(1)];
        start = pos;
        cur.push(pos);
        break;
      case "L":
        pos = [n(0), n(1)];
        cur.push(pos);
        break;
      case "H":
        pos = [n(0), pos[1]];
        cur.push(pos);
        break;
      case "V":
        pos = [pos[0], n(0)];
        cur.push(pos);
        break;
      case "C": {
        const c2: P = [n(2), n(3)];
        cubic([n(0), n(1)], c2, [n(4), n(5)]);
        pos = [n(4), n(5)];
        lastCtrl = c2;
        kind = "C";
        break;
      }
      case "S": {
        const c1: P =
          lastKind === "C" && lastCtrl ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
        const c2: P = [n(0), n(1)];
        cubic(c1, c2, [n(2), n(3)]);
        pos = [n(2), n(3)];
        lastCtrl = c2;
        kind = "C";
        break;
      }
      case "Q": {
        const c: P = [n(0), n(1)];
        quad(c, [n(2), n(3)]);
        pos = [n(2), n(3)];
        lastCtrl = c;
        kind = "Q";
        break;
      }
      case "T": {
        const c: P =
          lastKind === "Q" && lastCtrl ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
        quad(c, [n(0), n(1)]);
        pos = [n(0), n(1)];
        lastCtrl = c;
        kind = "Q";
        break;
      }
      case "A": {
        const to: P = [n(5), n(6)];
        cur.push(...arcPoints(pos, n(0), n(1), n(2), n(3), n(4), to, steps));
        pos = to;
        break;
      }
      case "Z":
        close();
        pos = start;
        break;
    }
    lastKind = kind;
  }
  close();
  return polys;
}

export interface PathBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Bounding box of the drawn outline (curves and arcs sampled finely). */
export function pathBounds(d: string): PathBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of flattenPath(d, 64)) {
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Moves absolute path data by (dx, dy); arc radii, angles and flags stay. */
export function translatePath(d: string, dx: number, dy: number, precision = 2): string {
  const f = (v: number) => formatNumber(v, precision);
  let out = "";
  for (const { cmd, args } of parsePathData(d)) {
    let moved: number[];
    switch (cmd) {
      case "H":
        moved = [(args[0] as number) + dx];
        break;
      case "V":
        moved = [(args[0] as number) + dy];
        break;
      case "A":
        moved = [...args.slice(0, 5), (args[5] as number) + dx, (args[6] as number) + dy];
        break;
      default:
        moved = args.map((v, i) => v + (i % 2 === 0 ? dx : dy));
    }
    out += cmd + moved.map(f).join(" ");
  }
  return out;
}

/**
 * Winding number of point (x, y) for flattened polygons; nonzero = inside
 * under the nonzero fill rule.
 */
export function windingNumber(polys: readonly (readonly P[])[], x: number, y: number): number {
  let w = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i] as P;
      const [x2, y2] = poly[(i + 1) % poly.length] as P;
      if (y1 <= y) {
        if (y2 > y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0) w++;
      } else if (y2 <= y && (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0) {
        w--;
      }
    }
  }
  return w;
}
