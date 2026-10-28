/**
 * Delaunay triangulation with the Bowyer-Watson algorithm (Bowyer 1981,
 * Watson 1981): insert points one by one, remove every triangle whose
 * circumcircle contains the new point and fill the cavity with a fan around
 * it.
 *
 * Instead of a large enclosing triangle the hull is closed by "ghost"
 * triangles that share one vertex at infinity (as in Shewchuk's Triangle and
 * CGAL): the circumcircle of a ghost triangle is the open half-plane outside
 * its hull edge. So the result is the Delaunay triangulation of the points,
 * convex hull included, without slivers missing near the hull.
 *
 * Triangles keep their neighbours, so a point is located by walking from
 * the last new triangle and the cavity is grown by a flood fill; points are
 * inserted in a snake order over horizontal bands to keep the walks short.
 */
import type { Vec2 } from "../vec";

/** Walk steps before falling back to a scan of all triangles. */
const MAX_WALK = 1 << 16;

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/**
 * Triangulates `points`. Returns vertex indices, three per triangle, each
 * triangle counter-clockwise in a y-up system (positive `orient`).
 * Exact duplicates are skipped (they appear in no triangle). Fewer than three
 * distinct points or all points collinear give an empty result.
 */
export function delaunay(points: readonly Vec2[]): Uint32Array {
  const n = points.length;
  if (n < 3) return new Uint32Array(0);
  const G = n; // the vertex at infinity

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = points[i] as Vec2;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new RangeError("delaunay: points must be finite");
    }
    xs[i] = p.x;
    ys[i] = p.y;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const X = (i: number): number => xs[i] as number;
  const Y = (i: number): number => ys[i] as number;

  // Snake order over horizontal bands keeps consecutive points close.
  const bands = Math.max(1, Math.round(Math.sqrt(n) / 2));
  const bandH = (maxY - minY) / bands || 1;
  const bandOf = (i: number): number => Math.min(bands - 1, Math.floor((Y(i) - minY) / bandH));
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((i, j) => {
    const bi = bandOf(i);
    const bj = bandOf(j);
    if (bi !== bj) return bi - bj;
    const dx = X(i) - X(j);
    return (bi % 2 === 0 ? dx : -dx) || i - j;
  });

  // First triangle: the first point, the next distinct one, the next one off their line.
  const i0 = order[0] as number;
  let k1 = 1;
  while (k1 < n && X(order[k1] as number) === X(i0) && Y(order[k1] as number) === Y(i0)) k1++;
  if (k1 >= n) return new Uint32Array(0);
  const i1 = order[k1] as number;
  let k2 = k1 + 1;
  while (
    k2 < n &&
    orient(X(i0), Y(i0), X(i1), Y(i1), X(order[k2] as number), Y(order[k2] as number)) === 0
  ) {
    k2++;
  }
  if (k2 >= n) return new Uint32Array(0);
  const i2 = order[k2] as number;
  const ccw = orient(X(i0), Y(i0), X(i1), Y(i1), X(i2), Y(i2)) > 0;
  const a0 = i0;
  const b0 = ccw ? i1 : i2;
  const c0 = ccw ? i2 : i1;

  // Triangle store: vertices V[3t..3t+2] (counter-clockwise), neighbour
  // N[3t+j] across the edge V[3t+j] -> V[3t+(j+1)%3]. Triangle 0 is real,
  // 1 to 3 are the ghosts on its edges.
  const V: number[] = [a0, b0, c0, b0, a0, G, c0, b0, G, a0, c0, G];
  const N: number[] = [1, 2, 3, 0, 3, 2, 0, 1, 3, 0, 2, 1];
  const alive: boolean[] = [true, true, true, true];
  const free: number[] = [];
  const stampBad: number[] = [0, 0, 0, 0];
  const stampSeen: number[] = [0, 0, 0, 0];

  const ghostSlot = (t: number): number =>
    V[3 * t] === G ? 0 : V[3 * t + 1] === G ? 1 : V[3 * t + 2] === G ? 2 : -1;

  /** Whether p lies strictly inside the circumcircle (ghosts: beyond their hull edge). */
  const inCircle = (t: number, px: number, py: number): boolean => {
    const k = ghostSlot(t);
    if (k >= 0) {
      const u = V[3 * t + ((k + 1) % 3)] as number;
      const v = V[3 * t + ((k + 2) % 3)] as number;
      const o = orient(X(u), Y(u), X(v), Y(v), px, py);
      if (o !== 0) return o > 0;
      // On the hull line: inside only strictly between the edge's ends.
      return (px - X(u)) * (px - X(v)) + (py - Y(u)) * (py - Y(v)) < 0;
    }
    const a = V[3 * t] as number;
    const b = V[3 * t + 1] as number;
    const c = V[3 * t + 2] as number;
    const adx = X(a) - px;
    const ady = Y(a) - py;
    const bdx = X(b) - px;
    const bdy = Y(b) - py;
    const cdx = X(c) - px;
    const cdy = Y(c) - py;
    const det =
      (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) -
      (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady) +
      (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady);
    return det > 0;
  };

  const insideReal = (t: number, px: number, py: number): boolean => {
    for (let j = 0; j < 3; j++) {
      const a = V[3 * t + j] as number;
      const b = V[3 * t + ((j + 1) % 3)] as number;
      if (orient(X(a), Y(a), X(b), Y(b), px, py) < 0) return false;
    }
    return true;
  };

  /** A triangle whose circumcircle holds p: the real one containing it, or a ghost. */
  const locate = (start: number, px: number, py: number): number => {
    let t = start;
    for (let step = 0; step < MAX_WALK; step++) {
      const k = ghostSlot(t);
      if (k >= 0) {
        if (inCircle(t, px, py)) return t;
        t = N[3 * t + ((k + 1) % 3)] as number;
        continue;
      }
      let next = -1;
      for (let j = 0; j < 3; j++) {
        const a = V[3 * t + j] as number;
        const b = V[3 * t + ((j + 1) % 3)] as number;
        if (orient(X(a), Y(a), X(b), Y(b), px, py) < 0) {
          next = N[3 * t + j] as number;
          break;
        }
      }
      if (next < 0) return t;
      t = next;
    }
    for (let u = 0; u < alive.length; u++) {
      if (!alive[u]) continue;
      if (ghostSlot(u) >= 0 ? inCircle(u, px, py) : insideReal(u, px, py)) return u;
    }
    return -1;
  };

  let last = 0;
  let stamp = 0;
  const bad: number[] = [];
  const stack: number[] = [];
  // Boundary edges of the cavity: a, b, outer neighbour.
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeOuter: number[] = [];
  // New triangle whose cavity edge starts at vertex v (scratch, by vertex).
  const startOf = new Int32Array(n + 1).fill(-1);

  for (const p of order) {
    if (p === i0 || p === i1 || p === i2) continue;
    const px = X(p);
    const py = Y(p);
    const t0 = locate(alive[last] ? last : 0, px, py);
    if (t0 < 0) continue;
    // Skip exact duplicates of a vertex of the found triangle.
    let duplicate = false;
    for (let j = 0; j < 3; j++) {
      const v = V[3 * t0 + j] as number;
      if (v !== G && X(v) === px && Y(v) === py) duplicate = true;
    }
    if (duplicate) continue;

    stamp++;
    bad.length = 0;
    stack.length = 0;
    stack.push(t0);
    stampBad[t0] = stamp;
    stampSeen[t0] = stamp;
    while (stack.length > 0) {
      const t = stack.pop() as number;
      bad.push(t);
      for (let j = 0; j < 3; j++) {
        const nb = N[3 * t + j] as number;
        if (stampSeen[nb] === stamp) continue;
        stampSeen[nb] = stamp;
        if (inCircle(nb, px, py)) {
          stampBad[nb] = stamp;
          stack.push(nb);
        }
      }
    }

    edgeA.length = 0;
    edgeB.length = 0;
    edgeOuter.length = 0;
    for (const t of bad) {
      for (let j = 0; j < 3; j++) {
        const nb = N[3 * t + j] as number;
        if (stampBad[nb] === stamp) continue;
        edgeA.push(V[3 * t + j] as number);
        edgeB.push(V[3 * t + ((j + 1) % 3)] as number);
        edgeOuter.push(nb);
      }
    }
    for (const t of bad) {
      alive[t] = false;
      free.push(t);
    }

    const created: number[] = [];
    for (let e = 0; e < edgeA.length; e++) {
      const a = edgeA[e] as number;
      const b = edgeB[e] as number;
      const outer = edgeOuter[e] as number;
      let t: number;
      if (free.length > 0) {
        t = free.pop() as number;
      } else {
        t = alive.length;
        alive.push(false);
        stampBad.push(0);
        stampSeen.push(0);
        V.push(0, 0, 0);
        N.push(-1, -1, -1);
      }
      alive[t] = true;
      V[3 * t] = a;
      V[3 * t + 1] = b;
      V[3 * t + 2] = p;
      N[3 * t] = outer;
      N[3 * t + 1] = -1;
      N[3 * t + 2] = -1;
      for (let k = 0; k < 3; k++) {
        if (V[3 * outer + k] === b && V[3 * outer + ((k + 1) % 3)] === a) {
          N[3 * outer + k] = t;
          break;
        }
      }
      startOf[a] = t;
      created.push(t);
    }
    // Edge (b, p) of the triangle on (a, b) meets edge (p, b) of the one starting at b.
    for (const t of created) {
      const u = startOf[V[3 * t + 1] as number] as number;
      N[3 * t + 1] = u;
      if (u >= 0) N[3 * u + 2] = t;
    }
    for (const t of created) startOf[V[3 * t] as number] = -1;
    last = created[created.length - 1] ?? last;
  }

  const out: number[] = [];
  for (let t = 0; t < alive.length; t++) {
    if (!alive[t] || ghostSlot(t) >= 0) continue;
    out.push(V[3 * t] as number, V[3 * t + 1] as number, V[3 * t + 2] as number);
  }
  return Uint32Array.from(out);
}

/**
 * Neighbours of every point in a triangulation (sorted, without duplicates).
 * `count` is the number of points.
 */
export function triangulationNeighbours(triangles: Uint32Array, count: number): number[][] {
  const sets: Set<number>[] = Array.from({ length: count }, () => new Set<number>());
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const a = triangles[t] as number;
    const b = triangles[t + 1] as number;
    const c = triangles[t + 2] as number;
    sets[a]?.add(b).add(c);
    sets[b]?.add(a).add(c);
    sets[c]?.add(a).add(b);
  }
  return sets.map((s) => [...s].sort((x, y) => x - y));
}
