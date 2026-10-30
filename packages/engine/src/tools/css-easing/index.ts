/**
 * CSS easing (docs/TOOLS.md M9): timing functions for transitions and
 * animations. Two kinds:
 *  - `cubic-bezier(x1, y1, x2, y2)`, evaluated with the shared solver;
 *  - a damped spring, sampled into the CSS `linear()` function (a list of
 *    output values at evenly spaced inputs).
 *
 * The specimen shows the curve with its control handles on a grid, and a
 * track with a dot at the eased position for time `t` plus faint dots for
 * the previous positions, so a still image already reads as motion.
 */
import { formatNumber } from "../../curves";
import { cubicBezierAt } from "../../easing";
import { escapeXml, svgBackground, svgDocument } from "../../svg";
import { AVATAR_FONT_STACKS } from "../avatar";

export const EASING_KINDS = ["bezier", "spring"] as const;
export type EasingKind = (typeof EASING_KINDS)[number];

/** Points of a spring `linear()`; enough for a smooth curve, small enough to paste. */
export const SPRING_POINTS = 40;

export interface SpringOptions {
  /** Stiffness and damping of the spring (mass 1). */
  readonly stiffness: number;
  readonly damping: number;
}

/**
 * Position of a damped spring from 0 to 1 at progress `x` in [0, 1]. The
 * animation lasts until the spring has nearly settled, so the end stays
 * close to 1 and is pinned to 1 exactly.
 */
export function springAt(o: SpringOptions, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const k = Math.max(1, o.stiffness);
  const c = Math.max(0.1, o.damping);
  const w0 = Math.sqrt(k);
  const zeta = c / (2 * w0);
  // Time until the envelope falls below 0.1 % of the start.
  const decay = zeta < 1 ? zeta * w0 : w0 * (zeta - Math.sqrt(zeta * zeta - 1));
  const duration = Math.log(1000) / Math.max(decay, 1e-3);
  const t = x * duration;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return (
      1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    );
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
  const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
  const a = r2 / (r2 - r1);
  return 1 - (a * Math.exp(r1 * t) + (1 - a) * Math.exp(r2 * t));
}

export interface EasingOptions extends SpringOptions {
  readonly kind: EasingKind;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** Output progress of the easing at input progress `x` in [0, 1]. */
export function easingAt(o: EasingOptions, x: number): number {
  return o.kind === "bezier" ? cubicBezierAt(o.x1, o.y1, o.x2, o.y2, x) : springAt(o, x);
}

/** CSS value: `cubic-bezier(...)` or `linear(...)`. */
export function easingCss(o: EasingOptions): string {
  if (o.kind === "bezier") {
    const n = (v: number) => formatNumber(v, 3);
    return `cubic-bezier(${n(o.x1)}, ${n(o.y1)}, ${n(o.x2)}, ${n(o.y2)})`;
  }
  const values: string[] = [];
  for (let i = 0; i <= SPRING_POINTS; i++)
    values.push(formatNumber(springAt(o, i / SPRING_POINTS), 3));
  return `linear(${values.join(", ")})`;
}

/** Lowest and highest output of the curve (overshoot below 0 or above 1). */
export function easingRange(o: EasingOptions): { min: number; max: number } {
  let min = 0;
  let max = 1;
  for (let i = 0; i <= 200; i++) {
    const v = easingAt(o, i / 200);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  if (o.kind === "bezier") {
    min = Math.min(min, o.y1, o.y2);
    max = Math.max(max, o.y1, o.y2);
  }
  return { min, max };
}

export interface EasingSpecimenOptions {
  readonly easing: EasingOptions;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  /** Duration shown in the label, in ms. */
  readonly duration: number;
  /** Animation time in [0, 1] for the moving dot (0 = start). */
  readonly t: number;
}

const f = (v: number): string => formatNumber(v, 2);

/** Curve on a grid with handles, the CSS value, and a track with the moving dot. */
export function easingSpecimenSvg(o: EasingSpecimenOptions): string {
  const { width: w, height: h } = o;
  const pad = Math.max(16, Math.round(Math.min(w, h) * 0.07));
  const label = Math.max(11, Math.min(20, w / 60));
  const mono = AVATAR_FONT_STACKS.mono;
  const parts: string[] = [svgBackground(o.background, w, h)];
  const range = easingRange(o.easing);
  // Plot area: a square left (or top on tall canvases), track beside it.
  const wide = w >= h;
  const trackSpace = wide ? Math.min(w * 0.3, h) : Math.min(h * 0.3, w);
  const plotW = wide ? w - pad * 3 - trackSpace : w - pad * 2;
  const plotH = wide ? h - pad * 2 - label * 2.5 : h - pad * 3 - trackSpace - label * 2.5;
  const side = Math.max(10, Math.min(plotW, plotH));
  const px = pad;
  const py = pad + label * 2.5;
  // Vertical room for overshoot: map [min, max] into the square.
  const span = range.max - range.min;
  const X = (x: number) => px + x * side;
  const Y = (y: number) => py + side - ((y - range.min) / span) * side;
  // Grid: the unit square and quarter lines.
  for (let i = 0; i <= 4; i++) {
    const g = i / 4;
    parts.push(
      `<path d="M${f(X(g))} ${f(Y(0))}V${f(Y(1))}M${f(X(0))} ${f(Y(g))}H${f(X(1))}" stroke="${o.muted}" stroke-opacity="${i % 4 === 0 ? 0.5 : 0.18}" stroke-width="1"/>`,
    );
  }
  parts.push(
    `<path d="M${f(X(0))} ${f(Y(0))}L${f(X(1))} ${f(Y(1))}" stroke="${o.muted}" stroke-opacity="0.35" stroke-dasharray="4 4" stroke-width="1"/>`,
  );
  if (o.easing.kind === "bezier") {
    const e = o.easing;
    parts.push(
      `<path d="M${f(X(0))} ${f(Y(0))}L${f(X(e.x1))} ${f(Y(e.y1))}M${f(X(1))} ${f(Y(1))}L${f(X(e.x2))} ${f(Y(e.y2))}" stroke="${o.ink}" stroke-opacity="0.55" stroke-width="${f(Math.max(1, label * 0.1))}"/>`,
      `<circle cx="${f(X(e.x1))}" cy="${f(Y(e.y1))}" r="${f(label * 0.45)}" fill="${o.background}" stroke="${o.ink}" stroke-width="${f(Math.max(1.5, label * 0.14))}"/>`,
      `<circle cx="${f(X(e.x2))}" cy="${f(Y(e.y2))}" r="${f(label * 0.45)}" fill="${o.background}" stroke="${o.ink}" stroke-width="${f(Math.max(1.5, label * 0.14))}"/>`,
    );
  }
  let d = "";
  for (let i = 0; i <= 120; i++) {
    const x = i / 120;
    d += `${i === 0 ? "M" : "L"}${f(X(x))} ${f(Y(easingAt(o.easing, x)))}`;
  }
  parts.push(
    `<path d="${d}" fill="none" stroke="${o.accent}" stroke-width="${f(Math.max(2, label * 0.22))}" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
  const t = Math.min(1, Math.max(0, o.t));
  parts.push(
    `<circle cx="${f(X(t))}" cy="${f(Y(easingAt(o.easing, t)))}" r="${f(label * 0.4)}" fill="${o.accent}"/>`,
  );
  const css = easingCss(o.easing);
  const shown = css.length > 64 ? `${css.slice(0, 61)}…` : css;
  parts.push(
    `<text x="${f(px)}" y="${f(pad + label)}" font-family="${mono}" font-size="${f(label)}" fill="${o.ink}">${escapeXml(shown)}</text>`,
    `<text x="${f(w - pad)}" y="${f(pad + label)}" text-anchor="end" font-family="${mono}" font-size="${f(label)}" fill="${o.muted}">${Math.round(o.duration)}ms</text>`,
  );
  // Track: a line along which a dot moves by the eased progress; ghosts every tenth of the time.
  const tx0 = wide ? px + side + pad + trackSpace / 2 : px;
  const ty0 = wide ? py + side : py + side + pad + trackSpace / 2;
  const tx1 = wide ? tx0 : px + side;
  const ty1 = wide ? py : ty0;
  const at = (v: number) => {
    // Overshoot stays visible: the track covers [min, max].
    const k = (v - range.min) / span;
    return { x: tx0 + (tx1 - tx0) * k, y: ty0 + (ty1 - ty0) * k };
  };
  const a = at(0);
  const b = at(1);
  parts.push(
    `<path d="M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}" stroke="${o.muted}" stroke-opacity="0.4" stroke-width="${f(Math.max(2, label * 0.2))}" stroke-linecap="round"/>`,
  );
  const r = Math.max(6, Math.min(trackSpace * 0.12, label * 1.2));
  for (let i = 1; i <= 10; i++) {
    const ghost = t - i * 0.06;
    if (ghost < 0) break;
    const p = at(easingAt(o.easing, ghost));
    parts.push(
      `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="${o.accent}" fill-opacity="${formatNumber(0.3 * (1 - i / 11), 3)}"/>`,
    );
  }
  const p = at(easingAt(o.easing, t));
  parts.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="${o.accent}"/>`);
  return svgDocument(w, h, parts.join(""));
}
