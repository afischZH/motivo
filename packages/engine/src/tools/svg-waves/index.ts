/**
 * Layered SVG waves. Every layer is an open Catmull-Rom spline through evenly
 * spaced points with seeded vertical offsets, closed along the bottom (or top)
 * edge. Layers are stacked from back to front with colours sampled along the
 * palette in OKLCH.
 */
import { samplePalette } from "../../color";
import { catmullRomToBezier, cubicPathToSvg, formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";

export const WAVE_DIRECTIONS = ["up", "down"] as const;
/** `up`: waves rise from the bottom edge; `down`: they hang from the top edge. */
export type WaveDirection = (typeof WAVE_DIRECTIONS)[number];

export interface WaveLineOptions {
  readonly width: number;
  /** Baseline y of the wave. */
  readonly baseline: number;
  /** Largest vertical offset from the baseline in px. */
  readonly amplitude: number;
  /** Points across the width, at least 2. */
  readonly points: number;
  readonly rng: Rng;
}

/** Evenly spaced points from x = 0 to x = width. Consumes `points` rng draws. */
export function wavePoints(o: WaveLineOptions): Vec2[] {
  const n = Math.max(2, Math.floor(o.points));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: (o.width * i) / (n - 1), y: o.baseline + o.amplitude * o.rng.float(-1, 1) });
  }
  return out;
}

export interface WavesSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly background: string;
  readonly colors: readonly string[];
  /** Number of layers, at least 1. */
  readonly layers: number;
  readonly points: number;
  /** Wave height relative to the spacing between layers, [0, 1]. */
  readonly amplitude: number;
  /** 0 = straight segments, 1 = round curves (Catmull-Rom tension 0 to 0.5). */
  readonly smoothness: number;
  /** Share of the canvas the wave stack covers, (0, 1]. */
  readonly coverage: number;
  readonly direction: WaveDirection;
}

export function wavesSvg(o: WavesSvgOptions): string {
  const { width: w, height: h } = o;
  const n = Math.max(1, Math.floor(o.layers));
  const top = h * (1 - Math.min(Math.max(o.coverage, 0), 1));
  const spacing = (h - top) / (n + 1);
  const amplitude = Math.min(Math.max(o.amplitude, 0), 1) * spacing;
  const tension = Math.min(Math.max(o.smoothness, 0), 1) * 0.5;
  const colors = samplePalette(o.colors, n);
  const flip = o.direction === "down";
  const fy = (y: number): number => (flip ? h - y : y);
  const f = (v: number): string => formatNumber(v);
  const edge = flip ? 0 : h;

  const paths: string[] = [];
  for (let i = 0; i < n; i++) {
    const baseline = top + spacing * (i + 1);
    const points = wavePoints({ width: w, baseline, amplitude, points: o.points, rng: o.rng }).map(
      (p) => ({ x: p.x, y: fy(p.y) }),
    );
    const curve = cubicPathToSvg(catmullRomToBezier(points, { tension }));
    paths.push(
      `<path d="${curve} L${f(w)} ${f(edge)} L0 ${f(edge)}Z" fill="${colors[i] ?? "#000000"}"/>`,
    );
  }
  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${paths.join("")}`);
}
