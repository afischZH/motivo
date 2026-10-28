/**
 * Guilloche (docs/TOOLS.md K4): fine interlaced line work like on banknotes
 * and certificates, from well-known periodic curves.
 *
 * Every line is a closed periodic curve in band coordinates: `u` runs
 * along the band (one period per unit), `v` across it (0 inner edge,
 * 1 outer edge). Three curve families:
 *  - `weave`: each line swings between an inner and an outer envelope; the
 *    envelopes pinch `petals` times per period, the lines swing `frequency`
 *    times, and the lines are phase shifted against each other, which
 *    gives the woven net;
 *  - `spiro`: sum of three rotating vectors (an epitrochoid with a second
 *    harmonic, the curve of a spirograph), read in polar form;
 *  - `harmonic`: the radius is the sum of two sinusoids running against
 *    each other (rose curves when one of them is switched off).
 * A layout then maps (u, v) to the canvas: a rosette (polar), a band (a
 * horizontal strip that tiles left to right) or a frame (a band around a
 * rounded rectangle).
 *
 * Pure and deterministic: no randomness at all, the same params always give
 * the same SVG. Curves are sampled adaptively (`sampleCurve`) and written as
 * relative polylines on a 0.1 px grid (`polylinePath`).
 */
import { samplePalette } from "../../color";
import { formatNumber } from "../../curves";
import { polylinePath, sampleCurve } from "../../sampling";
import { stableId, svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";

export const GUILLOCHE_LAYOUTS = ["rosette", "band", "frame"] as const;
export type GuillocheLayout = (typeof GUILLOCHE_LAYOUTS)[number];

export const GUILLOCHE_CURVES = ["weave", "spiro", "harmonic"] as const;
export type GuillocheCurve = (typeof GUILLOCHE_CURVES)[number];

export const GUILLOCHE_COLOR_MODES = ["single", "alternate", "blend", "iris", "along"] as const;
/**
 * `single`: first palette colour; `alternate`: palette colours line by line;
 * `blend`: lines blend through the palette; `iris`: one linear gradient
 * across the whole image (like iris printing); `along`: the colour changes
 * along every line and loops back to the start.
 */
export type GuillocheColorMode = (typeof GUILLOCHE_COLOR_MODES)[number];

/**
 * Most line points per image (7 to 9 bytes each in the SVG, so at most about
 * 0.35 MB). Sampling, mapping and writing cost about 1 µs per point on the
 * main thread, so this bounds the render time (M4b-AP05: was 120 000, and
 * extreme params ran up to four passes over it, 0.2 to 0.7 s). Above every
 * preset (Spirograph has about 29 500).
 */
export const GUILLOCHE_POINT_BUDGET = 36_000;
/**
 * Even steps of all lines together at most twice this (the grid before
 * refinement). Kept apart from the point budget so the presets keep their
 * sampling; a grid over the point budget is never drawn (see `guillocheSvg`).
 */
export const GUILLOCHE_STEP_BUDGET = 120_000;
/** Default flatness tolerance in px: midpoints never stray further from their chord. */
export const GUILLOCHE_TOLERANCE = 0.2;
/** Even steps per oscillation of the fastest wave, before adaptive refinement. */
const STEPS_PER_WAVE = 6;
const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface GuillocheWave {
  readonly curve: GuillocheCurve;
  /** Envelope lobes (weave), first harmonic (harmonic) or loops (spiro) per period, at least 1. */
  readonly petals: number;
  /** Swings (weave), second harmonic (harmonic) or second loops (spiro) per period, at least 1. */
  readonly frequency: number;
  /** [0, 1]: envelope depth (weave) or mix of the two waves (harmonic, spiro). */
  readonly amplitude: number;
  /** Spiro only: half the radial range relative to the mean radius, (0, 1). */
  readonly spiroRatio: number;
}

/** Band coordinates of a point. */
export interface BandPoint {
  /** Along the band, one unit per period. */
  readonly u: number;
  /** Across the band, [0, 1]. */
  readonly v: number;
}

/**
 * Point of one line at parameter `t` (one period per unit) with phase
 * `phase` (radians). Periodic in t with period 1: `u(t + 1) = u(t) + 1`.
 */
export function guillochePoint(w: GuillocheWave, t: number, phase: number): BandPoint {
  const p = Math.max(1, Math.round(w.petals));
  const f = Math.max(1, Math.round(w.frequency));
  const a = clamp(w.amplitude, 0, 1);
  const x = TAU * t;
  switch (w.curve) {
    case "weave": {
      const e = 0.5 - 0.5 * Math.cos(p * x);
      const lo = 0.5 * a * e;
      const hi = 1 - 0.5 * a * e;
      return { u: t, v: lo + (hi - lo) * (0.5 + 0.5 * Math.sin(f * x + phase)) };
    }
    case "harmonic": {
      const s = (1 - a) * Math.sin(p * x + phase) + a * Math.sin(f * x - phase);
      return { u: t, v: 0.5 + 0.5 * s };
    }
    case "spiro": {
      // z = e^{ix} * rel, rel = 1 + B e^{i(phase - p x)} + C e^{i(f x - phase)}.
      // Re(rel) >= 1 - h > 0, so its angle stays in (-pi/2, pi/2) and u is continuous.
      const h = clamp(w.spiroRatio, 0.02, 0.98);
      const b = h * (1 - a);
      const c = h * a;
      const re = 1 + b * Math.cos(phase - p * x) + c * Math.cos(f * x - phase);
      const im = b * Math.sin(phase - p * x) + c * Math.sin(f * x - phase);
      return { u: t + Math.atan2(im, re) / TAU, v: (Math.hypot(re, im) - (1 - h)) / (2 * h) };
    }
  }
}

export interface GuillocheFrameOptions {
  readonly width: number;
  readonly height: number;
  readonly layout: GuillocheLayout;
  /** Inner and outer edge of the band, [0, 1] (see `guillocheMapper`). Swapped if reversed. */
  readonly inner: number;
  readonly outer: number;
  /** Rosette only: turn in degrees. */
  readonly rotation: number;
}

export interface GuillocheMapper {
  /** Canvas point of band coordinates; `u` in periods of the whole layout. */
  map(u: number, v: number): Vec2;
  /** Whether lines close into loops (rosette, frame) or run off the edges (band). */
  readonly closed: boolean;
}

/** Inner and outer edge in order and at least 0.005 apart. */
export function bandEdges(inner: number, outer: number): { lo: number; hi: number } {
  let lo = clamp(Math.min(inner, outer), 0, 1);
  let hi = clamp(Math.max(inner, outer), 0, 1);
  if (hi - lo < 0.005) {
    if (hi + 0.005 <= 1) hi = lo + 0.005;
    else lo = hi - 0.005;
  }
  return { lo, hi };
}

/**
 * Maps band coordinates to the canvas, with `u` in [0, 1) covering the
 * whole layout once:
 *  - rosette: polar around the centre, radius `lerp(inner, outer, v)` times
 *    half the shorter edge, angle `u` turns plus `rotation`;
 *  - band: x = u times the width, y from the bottom at `lerp(inner, outer, v)`
 *    times the height;
 *  - frame: like the rosette radius, but around a rounded rectangle: the
 *    band sits `(1 - lerp(inner, outer, v))` times half the shorter edge in
 *    from the canvas edge, corners are quarter circles around a fixed core
 *    rectangle, so neighbouring lines stay parallel through the corners.
 */
export function guillocheMapper(o: GuillocheFrameOptions): GuillocheMapper {
  const { width: w, height: h } = o;
  const { lo, hi } = bandEdges(o.inner, o.outer);
  const half = Math.min(w, h) / 2;
  const cx = w / 2;
  const cy = h / 2;
  if (o.layout === "rosette") {
    const rot = (o.rotation * Math.PI) / 180;
    return {
      closed: true,
      map(u, v) {
        const r = half * lerp(lo, hi, v);
        const a = TAU * u + rot;
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
      },
    };
  }
  if (o.layout === "band") {
    return {
      closed: false,
      map(u, v) {
        return { x: w * u, y: h * (1 - lerp(lo, hi, v)) };
      },
    };
  }
  // Frame: offset curves of a core rectangle. `corner` keeps the innermost line rounded.
  const corner = Math.max(half * (hi - lo) * 0.5, 1);
  const coreInset = half * (1 - lo) + corner;
  const kx = Math.max(cx - coreInset, 0);
  const ky = Math.max(cy - coreInset, 0);
  const dMid = corner + half * (hi - lo) * 0.5;
  const arc = (Math.PI / 2) * dMid;
  // Clockwise from the top-left end of the top edge (y points down).
  const lengths = [2 * kx, arc, 2 * ky, arc, 2 * kx, arc, 2 * ky, arc];
  const total = lengths.reduce((s, l) => s + l, 0);
  const ends: number[] = [];
  let acc = 0;
  for (const l of lengths) {
    acc += l / total;
    ends.push(acc);
  }
  const point = (piece: number, f: number, d: number): Vec2 => {
    switch (piece) {
      case 0:
        return { x: cx - kx + 2 * kx * f, y: cy - ky - d };
      case 2:
        return { x: cx + kx + d, y: cy - ky + 2 * ky * f };
      case 4:
        return { x: cx + kx - 2 * kx * f, y: cy + ky + d };
      case 6:
        return { x: cx - kx - d, y: cy + ky - 2 * ky * f };
      default: {
        const centre = [
          { x: cx + kx, y: cy - ky },
          { x: cx + kx, y: cy + ky },
          { x: cx - kx, y: cy + ky },
          { x: cx - kx, y: cy - ky },
        ][(piece - 1) / 2] as Vec2;
        const a = (Math.PI / 2) * ((piece - 1) / 2 + f) - Math.PI / 2;
        return { x: centre.x + d * Math.cos(a), y: centre.y + d * Math.sin(a) };
      }
    }
  };
  return {
    closed: true,
    map(u, v) {
      const s = u - Math.floor(u);
      let piece = 0;
      while (piece < 7 && s >= (ends[piece] as number)) piece++;
      const start = piece === 0 ? 0 : (ends[piece - 1] as number);
      const span = (ends[piece] as number) - start;
      const f = span > 0 ? (s - start) / span : 0;
      return point(piece, f, corner + half * (lerp(lo, hi, v) - lo));
    },
  };
}

export interface GuillocheLayerOptions extends GuillocheWave {
  /** Number of lines, at least 1. */
  readonly lines: number;
  /** [0, 1]: share of a full phase turn spread across the lines (1 = evenly). */
  readonly spread: number;
  /** Extra phase of every line in radians (animation, overlay offset). */
  readonly phase: number;
}

/** Phase of line `j` of `n` in radians. */
export function linePhase(j: number, n: number, spread: number, phase: number): number {
  return TAU * clamp(spread, 0, 1) * (j / Math.max(1, n)) + phase;
}

export interface GuillocheSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly layout: GuillocheLayout;
  readonly inner: number;
  readonly outer: number;
  readonly rotation: number;
  /** Periods along a band or frame, at least 1 (the rosette always has one). */
  readonly repeats: number;
  readonly layers: readonly GuillocheLayerOptions[];
  /** Stroke width in px. */
  readonly lineWidth: number;
  readonly colorMode: GuillocheColorMode;
  /** Colours of the first layer. */
  readonly colors: readonly string[];
  /** Solid colours of further layers (index 0 is layer 2). */
  readonly layerColors: readonly string[];
  /** Iris direction in degrees, CSS style (0 = to top, 90 = to right). */
  readonly gradientAngle: number;
  readonly background: string;
  /** Normalised animation time in [0, 1): every line advances one phase turn. */
  readonly t?: number;
  /** Point budget, default `GUILLOCHE_POINT_BUDGET`. */
  readonly pointBudget?: number;
  /** Flatness tolerance in px, default `GUILLOCHE_TOLERANCE`. */
  readonly tolerance?: number;
}

/** Number of colour steps per period in `along` mode. */
export function alongSteps(colors: number): number {
  return clamp(colors * 6, 6, 36);
}

/** `count` colours evenly around a closed loop through `colors` (last blends back to first). */
export function loopPalette(colors: readonly string[], count: number): string[] {
  const first = colors[0];
  if (first === undefined) throw new RangeError("loopPalette: at least one colour is required");
  return samplePalette([...colors, first], count + 1).slice(0, count);
}

interface LinePlan {
  readonly layer: number;
  readonly phase: number;
  readonly wave: GuillocheWave;
  /** Colour key for a solid line, or undefined for `along`. */
  readonly color?: string;
}

/** Lines of all layers with their phase and colour. */
function planLines(o: GuillocheSvgOptions, gradientRef: string): LinePlan[] {
  const plans: LinePlan[] = [];
  const t = o.t ?? 0;
  o.layers.forEach((layer, li) => {
    const n = Math.max(1, Math.floor(layer.lines));
    const blend = li === 0 && o.colorMode === "blend" ? samplePalette(o.colors, n) : [];
    for (let j = 0; j < n; j++) {
      let color: string | undefined;
      if (li > 0) color = o.layerColors[li - 1] ?? o.colors[0] ?? "#000000";
      else if (o.colorMode === "single") color = o.colors[0];
      else if (o.colorMode === "alternate") color = o.colors[j % o.colors.length];
      else if (o.colorMode === "blend") color = blend[j];
      else if (o.colorMode === "iris") color = gradientRef;
      plans.push({
        layer: li,
        phase: linePhase(j, n, layer.spread, layer.phase + TAU * t),
        wave: layer,
        ...(color !== undefined ? { color } : {}),
      });
    }
  });
  return plans;
}

/** Iris gradient across the whole canvas (userSpaceOnUse), CSS angle convention. */
function irisGradient(
  id: string,
  colors: readonly string[],
  angleDeg: number,
  w: number,
  h: number,
): string {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  // Half the projection of the canvas on the direction, like CSS gradient lines.
  const len = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const f = (v: number): string => formatNumber(v, 1);
  const stops = colors
    .map((c, i) => {
      const off = colors.length > 1 ? i / (colors.length - 1) : 0;
      return `<stop offset="${formatNumber(off, 3)}" stop-color="${c}"/>`;
    })
    .join("");
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(w / 2 - dx * len)}" y1="${f(h / 2 - dy * len)}" x2="${f(w / 2 + dx * len)}" y2="${f(h / 2 + dy * len)}">${stops}</linearGradient>`;
}

/** Highest wave count per period of a layer (sets the even sampling grid). */
function waveCount(w: GuillocheWave): number {
  return Math.max(1, Math.round(w.petals), Math.round(w.frequency));
}

interface Rendered {
  /** Subpaths per colour, in first-use order. */
  readonly groups: Map<string, string[]>;
  readonly points: number;
  /** The pass stopped early because it went over the budget. */
  readonly over: boolean;
  /** Share of the lines drawn, (0, 1]. */
  readonly done: number;
}

interface Pass {
  readonly tolerance: number;
  readonly maxDepth: number;
}

/** The canvas curve of a line, one period of the layout per unit of t. */
function lineCurve(plan: LinePlan, mapper: GuillocheMapper, periods: number): (t: number) => Vec2 {
  return (t: number): Vec2 => {
    const b = guillochePoint(plan.wave, t, plan.phase);
    return mapper.map(b.u / periods, b.v);
  };
}

/** Even steps of a line before refinement. */
function lineStepCount(plan: LinePlan, periods: number, stepCap: number): number {
  return Math.min(stepCap, Math.ceil(waveCount(plan.wave) * periods * STEPS_PER_WAVE) + 16);
}

/** Even steps probed per layer to estimate how much a pass refines. */
const PROBE_STEPS = 48;

/**
 * Points a pass would draw, estimated from the first `PROBE_STEPS` steps of
 * the first line of every layer (the lines of a layer differ only in phase,
 * and every line repeats its waves, so the share of refined steps carries
 * over). Costs a few hundred curve points instead of a whole pass.
 */
function estimatePoints(
  o: GuillocheSvgOptions,
  plans: readonly LinePlan[],
  pass: Pass,
  stepCap: number,
): number {
  const mapper = guillocheMapper(o);
  const periods = o.layout === "rosette" ? 1 : Math.max(1, Math.round(o.repeats));
  const perLayer = new Map<number, { plan: LinePlan; lines: number }>();
  for (const plan of plans) {
    const entry = perLayer.get(plan.layer);
    if (entry) entry.lines++;
    else perLayer.set(plan.layer, { plan, lines: 1 });
  }
  // `along` splits every line into chunks, each with its own start point.
  const chunkStarts = o.colorMode === "along" ? alongSteps(o.colors.length) * periods : 1;
  let total = 0;
  for (const { plan, lines } of perLayer.values()) {
    const steps = lineStepCount(plan, periods, stepCap);
    const n = Math.min(steps, PROBE_STEPS);
    const pts = sampleCurve(lineCurve(plan, mapper, periods), 0, (periods * n) / steps, {
      steps: n,
      tolerance: pass.tolerance,
      maxDepth: pass.maxDepth,
    });
    const perStep = (pts.length - 1) / n;
    total += lines * (perStep * steps + (plan.color === undefined ? chunkStarts : 1));
  }
  return total;
}

function renderLines(
  o: GuillocheSvgOptions,
  plans: readonly LinePlan[],
  pass: Pass,
  stepCap: number,
  budget: number,
): Rendered {
  const mapper = guillocheMapper(o);
  const periods = o.layout === "rosette" ? 1 : Math.max(1, Math.round(o.repeats));
  // Band lines run a little past both edges so the strip tiles without visible line ends.
  const overshoot = mapper.closed ? 0 : ((o.lineWidth * 2 + 2) / Math.max(o.width, 1)) * periods;
  // `along`: colour steps per period, fewer when a line could not hold them all.
  const steps = Math.max(
    2,
    Math.min(alongSteps(o.colors.length), Math.floor(stepCap / (2 * periods))),
  );
  const along = o.colorMode === "along" ? loopPalette(o.colors, steps) : [];
  const groups = new Map<string, string[]>();
  let points = 0;
  const push = (color: string, d: string): void => {
    if (d === "") return;
    const list = groups.get(color);
    if (list) list.push(d);
    else groups.set(color, [d]);
  };
  // A single line can hold more points than the whole budget: stop it there as well.
  const options = (n: number) => ({
    steps: n,
    tolerance: pass.tolerance,
    maxDepth: pass.maxDepth,
    maxPoints: budget - points + 2,
  });

  for (const [i, plan] of plans.entries()) {
    if (points > budget) return { groups, points, over: true, done: i / plans.length };
    const curve = lineCurve(plan, mapper, periods);
    const lineSteps = lineStepCount(plan, periods, stepCap);
    const t0 = -overshoot;
    const t1 = periods + overshoot;
    if (plan.color !== undefined) {
      const pts = sampleCurve(curve, t0, t1, options(lineSteps));
      points += pts.length;
      push(plan.color, polylinePath(pts, mapper.closed));
      continue;
    }
    // One chunk per colour step; the colour loops once per period.
    const k = along.length;
    const chunks = k * periods;
    const chunkSteps = Math.max(1, Math.ceil(lineSteps / chunks));
    for (let c = 0; c < chunks; c++) {
      const a = c === 0 ? t0 : c / k;
      const b = c === chunks - 1 ? t1 : (c + 1) / k;
      const pts = sampleCurve(curve, a, b, options(chunkSteps));
      points += pts.length;
      push(along[c % k] as string, polylinePath(pts, false));
    }
  }
  return { groups, points, over: points > budget, done: 1 };
}

/**
 * The whole guilloche as an SVG document. Lines share one group with the
 * stroke settings; paths are grouped by colour (one `<path>` per colour).
 * Keeps to `pointBudget`: a cheap estimate picks the finest tolerance whose
 * points fit, that pass is drawn once (stopped if it overshoots after all)
 * and the even grid with fewer steps is the last resort. Extreme params stay
 * within the main-thread budget and the SVG small (M4b-AP05).
 */
export function guillocheSvg(o: GuillocheSvgOptions): string {
  const { width: w, height: h } = o;
  const budget = Math.max(1000, o.pointBudget ?? GUILLOCHE_POINT_BUDGET);
  const gridBudget = Math.max(1000, o.pointBudget ?? GUILLOCHE_STEP_BUDGET);
  const gradientId =
    o.colorMode === "iris"
      ? stableId("gi", `${o.colors.join(",")}|${o.gradientAngle}|${w}|${h}`)
      : "";
  const gradientRef = `url(#${gradientId})`;
  const plans = planLines(o, gradientRef);
  // Even grid per line: all lines together at most half the step budget.
  const lineCount = Math.max(1, plans.length);
  const stepCap = Math.max(8, Math.floor(gridBudget / lineCount / 2) - 1);
  // A grid that always fits the point budget: the last resort.
  const smallCap = Math.max(8, Math.floor(budget / lineCount / 2) - 1);

  const tolerance = Math.max(o.tolerance ?? GUILLOCHE_TOLERANCE, 0.01);
  const passes: Pass[] = [
    { tolerance, maxDepth: 5 },
    { tolerance: tolerance * 4, maxDepth: 5 },
    { tolerance: tolerance * 16, maxDepth: 3 },
    { tolerance, maxDepth: 0 },
  ];
  // The finest pass whose estimate fits is drawn once; drawing stops at the
  // budget plus a margin, and then (estimate off) the small grid follows.
  // At most one full pass plus the small grid, instead of up to four passes.
  const chosen = passes.find((pass) => estimatePoints(o, plans, pass, stepCap) <= budget);
  let out = chosen ? renderLines(o, plans, chosen, stepCap, Math.ceil(budget * 1.15)) : undefined;
  if (!out || out.over) {
    out = renderLines(o, plans, passes[passes.length - 1] as Pass, smallCap, budget);
  }

  const defs = gradientId
    ? `<defs>${irisGradient(gradientId, o.colors, o.gradientAngle, w, h)}</defs>`
    : "";
  const paths: string[] = [];
  for (const [color, ds] of out.groups) {
    paths.push(`<path stroke="${color}" d="${ds.join("")}"/>`);
  }
  const width = formatNumber(Math.max(o.lineWidth, 0.05), 2);
  const body = `<g fill="none" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths.join("")}</g>`;
  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${defs}${body}`);
}
