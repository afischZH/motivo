/**
 * Placeholder charts for mockups: line, area and grouped bar charts with
 * seeded random data. No text: axes are drawn as lines and ticks only, so
 * the output renders identically everywhere and needs no fonts.
 *
 * Data come from a seeded random walk. The walk always draws
 * `CHART_SERIES_MAX * CHART_POINTS_MAX` values, so changing the number of
 * series or points, the trend or the volatility reshapes the data without
 * replacing it.
 */
import { catmullRomToBezier, cubicPathToSvg, formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { svgBackground, svgDocument } from "../../svg";
import type { Vec2 } from "../../vec";

export const CHART_TYPES = ["line", "area", "bar"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_SERIES_MAX = 4;
export const CHART_POINTS_MIN = 2;
export const CHART_POINTS_MAX = 24;

/** Data values lie in [CHART_VALUE_MIN, CHART_VALUE_MAX] of the plot height. */
export const CHART_VALUE_MIN = 0.06;
export const CHART_VALUE_MAX = 0.92;

export interface ChartDataOptions {
  readonly rng: Rng;
  readonly series: number;
  readonly points: number;
  /** -1 = falling, 0 = flat, 1 = rising. */
  readonly trend: number;
  /** 0 = smooth, 1 = jumpy. */
  readonly volatility: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Seeded data, `series` rows of `points` values in [CHART_VALUE_MIN, CHART_VALUE_MAX]. */
export function chartData(o: ChartDataOptions): number[][] {
  const series = clamp(Math.floor(o.series), 1, CHART_SERIES_MAX);
  const points = clamp(Math.floor(o.points), CHART_POINTS_MIN, CHART_POINTS_MAX);
  const trend = clamp(o.trend, -1, 1);
  const vol = clamp(o.volatility, 0, 1);
  const rows: number[][] = [];
  for (let s = 0; s < CHART_SERIES_MAX; s++) {
    const start = o.rng.next();
    const steps = Array.from({ length: CHART_POINTS_MAX }, () => o.rng.gaussian());
    if (s >= series) continue;
    // Rising series start low, falling ones high; the trend spans about half the height.
    const span = CHART_VALUE_MAX - CHART_VALUE_MIN;
    let v = CHART_VALUE_MIN + span * (0.5 - trend * 0.25 + (start - 0.5) * 0.35);
    const drift = (trend * span * 0.5) / Math.max(points - 1, 1);
    const row: number[] = [];
    for (let i = 0; i < points; i++) {
      if (i > 0) v += drift + (steps[i] ?? 0) * vol * span * 0.12;
      v = clamp(v, CHART_VALUE_MIN, CHART_VALUE_MAX);
      row.push(v);
    }
    rows.push(row);
  }
  return rows;
}

export interface ChartSvgOptions {
  readonly width: number;
  readonly height: number;
  readonly rng: Rng;
  readonly background: string;
  /** One colour per series, cycling. */
  readonly colors: readonly string[];
  readonly type: ChartType;
  readonly series: number;
  readonly points: number;
  readonly trend: number;
  readonly volatility: number;
  /** Line smoothing, 0 = straight segments, 1 = round curves. */
  readonly smoothing: number;
  /** Line width in px (line and area). */
  readonly lineWidth: number;
  /** Dots on the data points (line and area). */
  readonly markers: boolean;
  /** Gap between bar groups relative to the group slot, [0, 0.9]. */
  readonly barGap: number;
  /** Bar corner radius relative to half the bar width, [0, 1]. */
  readonly barRadius: number;
  readonly axes: boolean;
  readonly grid: boolean;
  readonly axisColor: string;
  /** Margin around the plot in percent of the shorter canvas edge. */
  readonly margin: number;
}

/** Plot rectangle inside the margins, in px. */
export function plotArea(
  width: number,
  height: number,
  margin: number,
): { x: number; y: number; w: number; h: number } {
  const m = (Math.min(width, height) * clamp(margin, 0, 40)) / 100;
  const w = Math.max(width - 2 * m, 1);
  const h = Math.max(height - 2 * m, 1);
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

const f = (v: number): string => formatNumber(v, 2);
const pt = (p: Vec2): string => `${f(p.x)} ${f(p.y)}`;

/** Bar outline with rounded top corners (radius in px, clamped to the bar). */
export function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = clamp(r, 0, Math.min(w / 2, h));
  if (rr < 0.01) return `M${f(x)} ${f(y + h)}V${f(y)}H${f(x + w)}V${f(y + h)}Z`;
  return (
    `M${f(x)} ${f(y + h)}V${f(y + rr)}` +
    `A${f(rr)} ${f(rr)} 0 0 1 ${f(x + rr)} ${f(y)}H${f(x + w - rr)}` +
    `A${f(rr)} ${f(rr)} 0 0 1 ${f(x + w)} ${f(y + rr)}V${f(y + h)}Z`
  );
}

/** Line path through the points; Catmull-Rom with tension = smoothing / 2. */
export function chartLinePath(points: readonly Vec2[], smoothing: number): string {
  const tension = clamp(smoothing, 0, 1) * 0.5;
  if (tension === 0) return `M${points.map(pt).join("L")}`;
  return cubicPathToSvg(catmullRomToBezier(points, { tension }), 2);
}

export function chartSvg(o: ChartSvgOptions): string {
  const { width: w, height: h } = o;
  const plot = plotArea(w, h, o.margin);
  const data = chartData(o);
  const base = plot.y + plot.h;
  const unit = Math.min(w, h);
  const color = (i: number): string => o.colors[i % Math.max(o.colors.length, 1)] ?? "#000000";
  const parts: string[] = [];

  // Grid and axes.
  const guide = Math.max(unit / 540, 0.5);
  if (o.grid) {
    let d = "";
    for (let k = 1; k <= 4; k++) {
      const y = base - (plot.h * k) / 4;
      d += `M${f(plot.x)} ${f(y)}H${f(plot.x + plot.w)}`;
    }
    parts.push(
      `<path d="${d}" fill="none" stroke="${o.axisColor}" stroke-width="${f(guide)}" stroke-opacity="0.35"/>`,
    );
  }

  const n = data[0]?.length ?? 0;
  if (o.type === "bar") {
    const slot = plot.w / Math.max(n, 1);
    const groupW = slot * (1 - clamp(o.barGap, 0, 0.9));
    const barW = groupW / Math.max(data.length, 1);
    data.forEach((row, s) => {
      const bars = row
        .map((v, i) => {
          const x = plot.x + i * slot + (slot - groupW) / 2 + s * barW;
          const bh = v * plot.h;
          // A hairline gap between bars of a group keeps them apart.
          const inner = data.length > 1 ? Math.min(barW * 0.08, 2) : 0;
          return barPath(x + inner / 2, base - bh, barW - inner, bh, (o.barRadius * barW) / 2);
        })
        .join("");
      parts.push(`<path d="${bars}" fill="${color(s)}"/>`);
    });
  } else {
    const xs = (i: number): number => plot.x + (n > 1 ? (plot.w * i) / (n - 1) : plot.w / 2);
    const lw = f(o.lineWidth);
    // Areas first, so every line stays visible on top.
    const lines: string[] = [];
    data.forEach((row, s) => {
      const pts = row.map((v, i) => ({ x: xs(i), y: base - v * plot.h }));
      const line = chartLinePath(pts, o.smoothing);
      if (o.type === "area") {
        const first = pts[0] as Vec2;
        const last = pts[pts.length - 1] as Vec2;
        parts.push(
          `<path d="${line}L${f(last.x)} ${f(base)}L${f(first.x)} ${f(base)}Z" fill="${color(s)}" fill-opacity="0.22"/>`,
        );
      }
      lines.push(
        `<path d="${line}" fill="none" stroke="${color(s)}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
      if (o.markers) {
        const r = f(Math.max(o.lineWidth * 1.4, 2));
        const dots = pts.map((p) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${r}"/>`).join("");
        const bg = o.background === "transparent" ? "#ffffff" : o.background;
        lines.push(
          `<g fill="${bg}" stroke="${color(s)}" stroke-width="${f(Math.max(o.lineWidth * 0.8, 1))}">${dots}</g>`,
        );
      }
    });
    parts.push(...lines);
  }

  if (o.axes) {
    const aw = Math.max(unit / 360, 1);
    const tick = Math.max(unit / 90, 3);
    let d = `M${f(plot.x)} ${f(plot.y)}V${f(base)}H${f(plot.x + plot.w)}`;
    for (let k = 1; k <= 4; k++) {
      d += `M${f(plot.x - tick)} ${f(base - (plot.h * k) / 4)}h${f(tick)}`;
    }
    const ticks = Math.min(n, CHART_POINTS_MAX);
    for (let i = 0; i < ticks; i++) {
      const x =
        o.type === "bar"
          ? plot.x + (plot.w / ticks) * (i + 0.5)
          : plot.x + (ticks > 1 ? (plot.w * i) / (ticks - 1) : plot.w / 2);
      d += `M${f(x)} ${f(base)}v${f(tick)}`;
    }
    parts.push(
      `<path d="${d}" fill="none" stroke="${o.axisColor}" stroke-width="${f(aw)}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }

  return svgDocument(w, h, `${svgBackground(o.background, w, h)}${parts.join("")}`);
}
