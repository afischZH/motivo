/**
 * Blurry gradient (docs/TOOLS.md C2): 2 to 5 strongly blurred, translucent
 * circles anchored at the corners and the centre of the canvas.
 *
 * No SVG filter: the blur of a disk is radially symmetric, so each blurred
 * circle is drawn exactly as a radial gradient whose stop opacities follow
 * the profile of a disk convolved with a 2D Gaussian (`blurredDiskProfile`).
 * Radial gradients render identically in every browser and editor
 * (Illustrator, Figma), cost nothing at 8K, and need no filter region.
 * Overlapping circles composite with normal alpha blending.
 */
import { formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { stableId, svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";
import { type GrainLayer, grainOverlay } from "../noise-grain";

export const BLURRY_CIRCLES_MIN = 2;
export const BLURRY_CIRCLES_MAX = 5;

/** Where the circles sit: corners first, centre first, or clustered around the centre. */
export const BLURRY_LAYOUTS = ["corners", "mixed", "center"] as const;
export type BlurryLayout = (typeof BLURRY_LAYOUTS)[number];

/** Gaussian blur standard deviation at `blur = 1`, as a share of the shorter edge. */
export const BLURRY_BLUR_MAX = 0.25;
/** Largest anchor offset at `spread = 1`, as a share of the shorter edge. */
const SPREAD_MAX = 0.3;
/** Radial samples of the blur profile per circle (gradient stops). */
const PROFILE_STOPS = 20;
/** Integration steps over the disk radius. */
const PROFILE_STEPS = 64;

/**
 * `exp(-x) * I0(x)`: the exponentially scaled modified Bessel function of
 * the first kind, order 0, for x >= 0. Polynomial approximations from
 * Abramowitz and Stegun 9.8.1 and 9.8.2 (relative error below 2e-7).
 */
export function besselI0Scaled(x: number): number {
  const ax = Math.abs(x);
  if (ax <= 3.75) {
    const t = (ax / 3.75) ** 2;
    const i0 =
      1 +
      t *
        (3.5156229 +
          t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813)))));
    return i0 * Math.exp(-ax);
  }
  const t = 3.75 / ax;
  return (
    (0.39894228 +
      t *
        (0.01328592 +
          t *
            (0.00225319 +
              t *
                (-0.00157565 +
                  t *
                    (0.00916281 +
                      t *
                        (-0.02057706 + t * (0.02635537 + t * (-0.01647633 + t * 0.00392377)))))))) /
    Math.sqrt(ax)
  );
}

/**
 * Coverage in [0, 1] at distance `r` from the centre of a disk of radius
 * `radius` blurred with a Gaussian of standard deviation `sigma`:
 *
 *   P(r) = ∫₀ᴿ ρ/σ² · exp(-(r - ρ)² / 2σ²) · I0e(rρ/σ²) dρ
 *
 * (polar form of the convolution; the scaled Bessel term keeps it finite for
 * large arguments). Simpson's rule over the part of the radius within 6σ of r. `sigma <= 0` is the
 * sharp disk.
 */
export function blurredDiskProfile(radius: number, sigma: number, r: number): number {
  if (radius <= 0) return 0;
  if (sigma <= 0) return r <= radius ? 1 : 0;
  const s2 = sigma * sigma;
  const f = (rho: number): number =>
    (rho / s2) * Math.exp(-((r - rho) ** 2) / (2 * s2)) * besselI0Scaled((r * rho) / s2);
  // Beyond 6σ from r the Gaussian factor is below 1e-7 (and I0e <= 1): integrate
  // only the window around r, so a thin blur on a large disk is still resolved.
  const lo = Math.max(0, r - 6 * sigma);
  const hi = Math.min(radius, r + 6 * sigma);
  if (!(hi > lo)) return 0;
  const h = (hi - lo) / PROFILE_STEPS;
  let sum = f(lo) + f(hi);
  for (let k = 1; k < PROFILE_STEPS; k++) sum += (k % 2 === 1 ? 4 : 2) * f(lo + k * h);
  return Math.min(1, Math.max(0, (sum * h) / 3));
}

export interface BlurryCircle {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly color: string;
}

export interface BlurryGradientOptions {
  readonly width: number;
  readonly height: number;
  /** Colour or `"transparent"`. */
  readonly background: string;
  /** Circle colours; circle i takes `colors[i % colors.length]`. */
  readonly colors: readonly string[];
  /** Number of circles, clamped to [BLURRY_CIRCLES_MIN, BLURRY_CIRCLES_MAX]. */
  readonly circles: number;
  readonly layout: BlurryLayout;
  /** Circle radius as a share of the shorter edge. */
  readonly size: number;
  /** Random offset from the anchors in [0, 1]. */
  readonly spread: number;
  /** Opacity of each circle in [0, 1]. */
  readonly opacity: number;
  /** Blur in [0, 1]; 1 = `BLURRY_BLUR_MAX` of the shorter edge. */
  readonly blur: number;
  readonly rng: Rng;
  readonly grain?: GrainLayer | null;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * Anchors in unit coordinates for a layout. Corners come in seeded order
 * (always 4 rng draws for the shuffle), so a new seed moves the colours
 * around the canvas.
 */
function anchors(rng: Rng, layout: BlurryLayout): Vec2[] {
  const corners = rng.shuffle<Vec2>([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ]);
  const centre = { x: 0.5, y: 0.5 };
  switch (layout) {
    case "corners":
      return [...corners, centre];
    case "mixed":
      return [centre, ...corners];
    case "center":
      // Pulled halfway to the centre: a cluster instead of a frame.
      return [centre, ...corners.map((c) => ({ x: 0.25 + c.x * 0.5, y: 0.25 + c.y * 0.5 }))];
  }
}

/** Circle geometry. Two rng draws per circle after the anchor shuffle, whatever the params. */
export function blurryCircles(o: BlurryGradientOptions): BlurryCircle[] {
  const n = Math.round(Math.min(BLURRY_CIRCLES_MAX, Math.max(BLURRY_CIRCLES_MIN, o.circles)));
  const short = Math.min(o.width, o.height);
  const spread = clamp01(o.spread) * SPREAD_MAX * short;
  const colors = o.colors.length > 0 ? o.colors : ["#000000"];
  const radius = Math.max(0, o.size) * short;
  const all = anchors(o.rng, o.layout);
  const out: BlurryCircle[] = [];
  for (let i = 0; i < BLURRY_CIRCLES_MAX; i++) {
    const a = all[i] as Vec2;
    // Offset towards the inside of the canvas, so corner circles stay visible;
    // the centre moves either way.
    const inward = (u: number, at: number): number =>
      at < 0.5 ? u * spread : at > 0.5 ? -u * spread : (u - 0.5) * spread;
    const dx = inward(o.rng.next(), a.x);
    const dy = inward(o.rng.next(), a.y);
    if (i < n) {
      out.push({
        cx: a.x * o.width + dx,
        cy: a.y * o.height + dy,
        radius,
        color: colors[i % colors.length] as string,
      });
    }
  }
  return out;
}

/** Stops of the blurred disk: denser around the rim, where the profile changes. */
function profileStops(radius: number, sigma: number, opacity: number): string {
  const outer = radius + 3 * sigma;
  const stops: string[] = [];
  for (let k = 0; k <= PROFILE_STOPS; k++) {
    // Smoothstep spacing concentrates samples in the middle of [0, outer].
    const u = k / PROFILE_STOPS;
    const r = outer * (u * u * (3 - 2 * u));
    // The last stop is exactly transparent, so the circle has no visible rim.
    const a = k === PROFILE_STOPS ? 0 : opacity * blurredDiskProfile(radius, sigma, r);
    stops.push(
      `<stop offset="${formatNumber(r / outer, 4)}" stop-opacity="${formatNumber(a, 3)}"/>`,
    );
  }
  return stops.join("");
}

/** SVG document: background, one radial gradient per circle, optional grain. */
export function blurryGradientSvg(o: BlurryGradientOptions): string {
  const circles = blurryCircles(o);
  const sigma = clamp01(o.blur) * BLURRY_BLUR_MAX * Math.min(o.width, o.height);
  const opacity = clamp01(o.opacity);
  const f = (v: number): string => formatNumber(v, 1);
  let defs = "";
  let body = "";
  // The profile depends only on radius, blur and opacity: share it between circles.
  const stops = sigma >= 0.5 ? profileStops(circles[0]?.radius ?? 0, sigma, opacity) : "";
  for (const c of circles) {
    if (c.radius <= 0 || opacity <= 0) continue;
    if (sigma < 0.5) {
      body +=
        `<circle cx="${f(c.cx)}" cy="${f(c.cy)}" r="${f(c.radius)}" fill="${c.color}" ` +
        `fill-opacity="${formatNumber(opacity, 3)}"/>`;
      continue;
    }
    const outer = c.radius + 3 * sigma;
    const gradient =
      `<radialGradient cx="${f(c.cx)}" cy="${f(c.cy)}" r="${f(outer)}" ` +
      `gradientUnits="userSpaceOnUse">${stops.replaceAll("<stop ", `<stop stop-color="${c.color}" `)}</radialGradient>`;
    const id = stableId("b", gradient);
    defs += gradient.replace("<radialGradient ", `<radialGradient id="${id}" `);
    body += `<circle cx="${f(c.cx)}" cy="${f(c.cy)}" r="${f(outer)}" fill="url(#${id})"/>`;
  }
  const grain = o.grain ? grainOverlay(o.width, o.height, o.grain) : { def: "", rect: "" };
  defs += grain.def;
  return svgDocument(
    o.width,
    o.height,
    `${defs ? `<defs>${defs}</defs>` : ""}${svgBackground(o.background, o.width, o.height)}${body}${grain.rect}`,
  );
}
