/**
 * Fluid type scales (docs/TOOLS.md M1). A modular scale whose base size and
 * ratio grow with the viewport: every step is linearly interpolated between
 * a minimum and a maximum viewport and written as CSS `clamp()`. Pure
 * arithmetic plus an SVG specimen of the scale at one viewport width.
 *
 * The preferred value is `<rem> + <vw>`, never `vw` alone: the rem part
 * keeps the text zoomable (WCAG 1.4.4), the vw part makes it fluid.
 */
import { formatNumber } from "../../curves";
import { escapeXml, svgBackground, svgDocument } from "../../svg";
import { AVATAR_FONT_STACKS, estimateTextWidth, type AvatarFont } from "../avatar";

/** Named ratios of the classic modular scale (musical intervals and the golden ratio). */
export const TYPE_SCALE_RATIOS = {
  "minor-second": 1.067,
  "major-second": 1.125,
  "minor-third": 1.2,
  "major-third": 1.25,
  "perfect-fourth": 1.333,
  "augmented-fourth": 1.414,
  "perfect-fifth": 1.5,
  "golden-ratio": 1.618,
} as const;

export type TypeScaleRatio = keyof typeof TYPE_SCALE_RATIOS;

export const TYPE_SCALE_RATIO_IDS = [
  "minor-second",
  "major-second",
  "minor-third",
  "major-third",
  "perfect-fourth",
  "augmented-fourth",
  "perfect-fifth",
  "golden-ratio",
] as const satisfies readonly TypeScaleRatio[];

/** Font size of browsers by default, the reference of `rem`. */
export const ROOT_FONT_SIZE = 16;

/**
 * Rule of thumb for WCAG 1.4.4 (resize text to 200 %): when the largest size
 * of a step is at most 2.5 times its smallest, zooming always reaches 200 %
 * even though the vw part does not grow with the zoom.
 */
export const FLUID_ZOOM_SAFE_FACTOR = 2.5;

export interface FluidTypeOptions {
  /** Viewport widths in px where the scale stops shrinking and growing. */
  readonly minViewport: number;
  readonly maxViewport: number;
  /** Size of step 0 in px at the minimum and the maximum viewport. */
  readonly minBase: number;
  readonly maxBase: number;
  /** Scale ratios at the minimum and the maximum viewport. */
  readonly minRatio: number;
  readonly maxRatio: number;
  /** Steps below and above step 0. */
  readonly stepsDown: number;
  readonly stepsUp: number;
}

export interface FluidStep {
  /** Step number, negative below the base. */
  readonly step: number;
  /** Size in px at the minimum and the maximum viewport. */
  readonly min: number;
  readonly max: number;
  /** Growth in px per px of viewport width. */
  readonly slope: number;
  /** Size in px at a viewport width of 0 (the rem part of `clamp()`). */
  readonly intercept: number;
}

/** The steps from `-stepsDown` to `stepsUp`, smallest first. */
export function fluidTypeSteps(o: FluidTypeOptions): FluidStep[] {
  const lo = Math.min(o.minViewport, o.maxViewport);
  const hi = Math.max(o.minViewport, o.maxViewport);
  const span = hi - lo;
  const steps: FluidStep[] = [];
  for (let step = -Math.round(o.stepsDown); step <= Math.round(o.stepsUp); step++) {
    const min = o.minBase * o.minRatio ** step;
    const max = o.maxBase * o.maxRatio ** step;
    const slope = span > 0 ? (max - min) / span : 0;
    steps.push({ step, min, max, slope, intercept: min - slope * lo });
  }
  return steps;
}

/** Size of a step at a viewport width, in px (what `clamp()` resolves to without zoom). */
export function fluidSizeAt(s: FluidStep, viewport: number): number {
  const preferred = s.intercept + s.slope * viewport;
  return Math.min(Math.max(preferred, Math.min(s.min, s.max)), Math.max(s.min, s.max));
}

export type FluidUnit = "rem" | "px";

const length = (px: number, unit: FluidUnit): string =>
  unit === "rem" ? `${formatNumber(px / ROOT_FONT_SIZE, 4)}rem` : `${formatNumber(px, 2)}px`;

/**
 * CSS value of a step: `clamp(<min>, <rem> + <vw>, <max>)`, or a plain
 * length when the step does not change. Shrinking steps (larger at small
 * viewports) keep the bounds in order, as `clamp()` requires.
 */
export function fluidClamp(s: FluidStep, unit: FluidUnit): string {
  const lo = Math.min(s.min, s.max);
  const hi = Math.max(s.min, s.max);
  const vw = s.slope * 100;
  if (Math.abs(vw) < 0.00005 || hi - lo < 0.005) return length(s.min, unit);
  const vwText = `${formatNumber(Math.abs(vw), 4)}vw`;
  const preferred =
    Math.abs(s.intercept) < 0.00005
      ? vw < 0
        ? `-${vwText}`
        : vwText
      : `${length(s.intercept, unit)} ${vw < 0 ? "-" : "+"} ${vwText}`;
  return `clamp(${length(lo, unit)}, ${preferred}, ${length(hi, unit)})`;
}

/** Largest max-to-min factor of the steps (see `FLUID_ZOOM_SAFE_FACTOR`). */
export function fluidZoomFactor(steps: readonly FluidStep[]): number {
  let factor = 1;
  for (const s of steps) {
    const lo = Math.min(s.min, s.max);
    if (lo > 0) factor = Math.max(factor, Math.max(s.min, s.max) / lo);
  }
  return factor;
}

export const FLUID_NAMINGS = ["steps", "tshirt"] as const;
export type FluidNaming = (typeof FLUID_NAMINGS)[number];

/** T-shirt names below and above "base", as in Tailwind (`text-sm`, `text-lg`, `text-2xl`). */
const TSHIRT_DOWN = ["sm", "xs", "2xs", "3xs"] as const;
const TSHIRT_UP = ["lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"] as const;

/** Name of a step: "0", "1", "-1" or "base", "lg", "sm" ... */
export function fluidStepName(step: number, naming: FluidNaming): string {
  if (naming === "steps") return String(step);
  if (step === 0) return "base";
  if (step < 0) return TSHIRT_DOWN[-step - 1] ?? `${-step}xs`;
  return TSHIRT_UP[step - 1] ?? `${step}xl`;
}

// ---------------------------------------------------------------------------
// Specimen
// ---------------------------------------------------------------------------

export interface FluidSpecimenOptions {
  readonly steps: readonly FluidStep[];
  /** Variable names of the steps, same order as `steps` (e.g. "--step-1"). */
  readonly names: readonly string[];
  readonly minViewport: number;
  readonly maxViewport: number;
  /** Viewport width the sample lines are set at. */
  readonly viewport: number;
  readonly sample: string;
  readonly font: AvatarFont;
  readonly fontWeight: number;
  readonly background: string;
  readonly ink: string;
  /** Labels, ruler and size figures. */
  readonly muted: string;
  readonly accent: string;
  readonly width: number;
  readonly height: number;
}

const f = (v: number): string => formatNumber(v, 2);

/** The longest prefix of `text` (in code points) that fits `maxWidth`, with "…" when cut. */
export function truncateToWidth(
  text: string,
  font: AvatarFont,
  size: number,
  maxWidth: number,
): string {
  if (estimateTextWidth(text, font) * size <= maxWidth) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${chars.slice(0, mid).join("").trimEnd()}…`;
    if (estimateTextWidth(candidate, font) * size <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? "" : `${chars.slice(0, lo).join("").trimEnd()}…`;
}

/**
 * Type specimen: a ruler with the viewport range and the preview width on
 * top, then one row per step (largest first) with its name, its size range
 * and the sample text at its size for `viewport`. Sizes are true pixels;
 * rows below the bottom edge are cut off.
 */
export function fluidSpecimenSvg(o: FluidSpecimenOptions): string {
  const { width: w, height: h } = o;
  const pad = Math.max(16, Math.round(Math.min(w, h) * 0.06));
  const label = Math.max(11, Math.min(18, w / 64));
  const mono = AVATAR_FONT_STACKS.mono;
  const parts: string[] = [svgBackground(o.background, w, h)];

  // Ruler: the viewport range, the preview width as a dot.
  const lo = Math.min(o.minViewport, o.maxViewport);
  const hi = Math.max(o.minViewport, o.maxViewport);
  const rulerY = pad + label;
  const x0 = pad;
  const x1 = w - pad;
  const t = hi > lo ? Math.min(1, Math.max(0, (o.viewport - lo) / (hi - lo))) : 0;
  const dotX = x0 + (x1 - x0) * t;
  const text = (x: number, y: number, s: string, anchor: string, fill: string, size = label) =>
    `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" font-family="${mono}" font-size="${f(size)}" fill="${fill}">${escapeXml(s)}</text>`;
  parts.push(
    `<path d="M${f(x0)} ${f(rulerY)}H${f(x1)}" stroke="${o.muted}" stroke-opacity="0.5" stroke-width="1"/>`,
    `<path d="M${f(x0)} ${f(rulerY - 4)}V${f(rulerY + 4)}M${f(x1)} ${f(rulerY - 4)}V${f(rulerY + 4)}" stroke="${o.muted}" stroke-width="1"/>`,
    `<circle cx="${f(dotX)}" cy="${f(rulerY)}" r="${f(label * 0.4)}" fill="${o.accent}"/>`,
    text(x0, rulerY + label * 1.6, `${Math.round(lo)}px`, "start", o.muted),
    text(x1, rulerY + label * 1.6, `${Math.round(hi)}px`, "end", o.muted),
    text(dotX, rulerY - label * 0.8, `${Math.round(o.viewport)}px`, "middle", o.accent),
  );

  // Rows, largest step first.
  const labelColumn = Math.min(w * 0.3, label * 13);
  const textX = pad + labelColumn;
  const textWidth = Math.max(0, w - pad - textX);
  let y = rulerY + label * 3.4;
  const stack = AVATAR_FONT_STACKS[o.font];
  for (let i = o.steps.length - 1; i >= 0; i--) {
    const s = o.steps[i] as FluidStep;
    const size = fluidSizeAt(s, o.viewport);
    const lineHeight = Math.max(size * 1.25, label * 2.6);
    if (y > h) break;
    const baseline = y + lineHeight * 0.5 + size * 0.35;
    const name = o.names[i] ?? String(s.step);
    const range = `${formatNumber(s.min, 1)} → ${formatNumber(s.max, 1)}`;
    parts.push(
      text(pad, baseline - label * 0.55, name, "start", s.step === 0 ? o.accent : o.muted),
      text(pad, baseline + label * 0.75, range, "start", o.muted, label * 0.85),
    );
    const line = truncateToWidth(o.sample, o.font, size, textWidth);
    if (line !== "") {
      parts.push(
        `<text x="${f(textX)}" y="${f(baseline)}" font-family="${stack}" font-size="${f(size)}" font-weight="${Math.round(o.fontWeight)}" fill="${o.ink}">${escapeXml(line)}</text>`,
      );
    }
    parts.push(
      `<path d="M${f(pad)} ${f(y + lineHeight)}H${f(w - pad)}" stroke="${o.muted}" stroke-opacity="0.18" stroke-width="1"/>`,
    );
    y += lineHeight;
  }
  return svgDocument(w, h, parts.join(""));
}
