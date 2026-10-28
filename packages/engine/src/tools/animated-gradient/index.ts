/**
 * Animated CSS gradient (docs/TOOLS.md L3): a moving linear gradient, a
 * rotating conic or linear gradient, shifting colours through `@property`
 * and floating soft blobs moved by transforms.
 *
 * Three outputs share one model (geometry, keyframes, timing):
 *  - the preview: real CSS on an element, with constant global rules
 *    (`ANIMATED_GRADIENT_RULES`) whose values come from custom properties on
 *    the element, because preview rules must not depend on params;
 *  - the code exports: the same values written straight into short,
 *    readable keyframes, plus a `prefers-reduced-motion` rule;
 *  - the SVG twin of the state at time `t` (image exports, GIF frames),
 *    following the Web Animations model (direction, keyframe segments,
 *    timing function per segment). `t = 0` is the calm state that the
 *    preview shows when motion is reduced.
 */
import { mixHex } from "../../color";
import { formatNumber } from "../../curves";
import { type CssTiming, cssTiming } from "../../easing";
import { createRng, deriveSeed } from "../../rng";
import { stableId, svgDocument } from "../../svg";
import { type CssGradientOptions, cssGradientSvgBody, tailwindArbitrary } from "../css-gradient";
import type { Declaration } from "../glass-effects";

export const ANIMATED_GRADIENT_MODES = ["pan", "rotate", "shift", "blobs"] as const;
export type AnimatedGradientMode = (typeof ANIMATED_GRADIENT_MODES)[number];

export const ANIMATION_DIRECTIONS = ["normal", "reverse"] as const;
export type AnimationDirection = (typeof ANIMATION_DIRECTIONS)[number];

export const ROTATE_SHAPES = ["conic", "linear"] as const;
export type RotateShape = (typeof ROTATE_SHAPES)[number];

/** Fewest and most colours (and blobs); the preview rules cover every count. */
export const ANIMATED_GRADIENT_COLORS_MIN = 2;
export const ANIMATED_GRADIENT_COLORS_MAX = 6;

export interface AnimatedGradientOptions {
  readonly mode: AnimatedGradientMode;
  /** 2 to 6 hex colours. */
  readonly colors: readonly string[];
  /** Base colour behind the blobs. */
  readonly background: string;
  /** Gradient angle in degrees (CSS: 0 = to top, clockwise); axis of the pan. */
  readonly angle: number;
  readonly rotateShape: RotateShape;
  /** Seconds per iteration. */
  readonly duration: number;
  readonly timing: CssTiming;
  readonly direction: AnimationDirection;
  /** Amount of motion in percent (10 to 100): pan size, blob travel. */
  readonly motion: number;
  /** Softness of the blobs in percent (0 = solid core, 100 = pure fade). */
  readonly blur: number;
  /** Opacity of the blobs in percent. */
  readonly intensity: number;
  readonly width: number;
  readonly height: number;
}

/** One blob: a square box with a soft radial gradient, in percent units. */
export interface GradientBlob {
  /** Left edge in percent of the width, top edge in percent of the height. */
  readonly left: number;
  readonly top: number;
  /** Edge of the square in percent of the width (`aspect-ratio: 1`). */
  readonly size: number;
  readonly color: string;
  /** Waypoints of the closed path in percent of the blob size: x1, y1, x2, y2. */
  readonly path: readonly [number, number, number, number];
}

const f1 = (v: number): string => formatNumber(v, 1);
const pct = (v: number): string => `${f1(v)}%`;
const deg = (v: number): string => `${formatNumber(v, 1)}deg`;
const round1 = (v: number): number => Math.round(v * 10) / 10;
const sec = (v: number): string => `${formatNumber(v, 2)}s`;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * Blob layout from the seed: one blob per colour, each with its own random
 * stream (adding a colour keeps the others in place). Sizes are 45 to 80 %
 * of the longer edge, centres anywhere in the inner 80 %, and the path is a
 * triangle through the origin whose radius scales with `motion`.
 */
export function animatedGradientBlobs(
  seed: number,
  o: Pick<AnimatedGradientOptions, "colors" | "motion" | "width" | "height">,
): GradientBlob[] {
  const w = Math.max(1, o.width);
  const h = Math.max(1, o.height);
  const reach = Math.min(Math.max(o.motion, 0), 100) / 100;
  return o.colors.slice(0, ANIMATED_GRADIENT_COLORS_MAX).map((color, i) => {
    const rng = createRng(deriveSeed(seed, `blob${i}`));
    const edge = rng.float(0.45, 0.8) * Math.max(w, h);
    const cx = rng.float(0.1, 0.9) * w;
    const cy = rng.float(0.1, 0.9) * h;
    const a1 = rng.float(0, Math.PI * 2);
    const r1 = rng.float(0.35, 0.6) * reach * 100;
    const a2 = a1 + (Math.PI * 2) / 3 + rng.float(-0.5, 0.5);
    const r2 = rng.float(0.35, 0.6) * reach * 100;
    return {
      left: round1(((cx - edge / 2) / w) * 100),
      top: round1(((cy - edge / 2) / h) * 100),
      size: round1((edge / w) * 100),
      color: color.toLowerCase(),
      path: [
        round1(r1 * Math.cos(a1)),
        round1(r1 * Math.sin(a1)),
        round1(r2 * Math.cos(a2)),
        round1(r2 * Math.sin(a2)),
      ],
    };
  });
}

/** Background size (percent) and start and end position (percent pairs) of the pan. */
export interface PanGeometry {
  readonly size: number;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}

/**
 * The pan travels along the gradient axis: the direction vector, scaled so
 * its longer component spans 0 to 100 %, around the centre. `reverse`
 * swaps start and end (the calm state stays the start).
 */
export function panGeometry(
  o: Pick<AnimatedGradientOptions, "angle" | "motion" | "direction">,
): PanGeometry {
  const a = (o.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = (dx / m) * 50;
  const sy = (dy / m) * 50;
  const start: [number, number] = [round1(50 - sx), round1(50 - sy)];
  const end: [number, number] = [round1(50 + sx), round1(50 + sy)];
  const size = Math.round(100 + 3 * Math.min(Math.max(o.motion, 0), 100));
  return o.direction === "reverse"
    ? { size, from: end, to: start }
    : { size, from: start, to: end };
}

/** Core of the blob gradient in percent (where the fade begins). */
export function blobCore(blur: number): number {
  return Math.round(70 * (1 - Math.min(Math.max(blur, 0), 100) / 100));
}

/** Number of keyframe segments of a mode. */
function segmentCount(o: Pick<AnimatedGradientOptions, "mode" | "colors">): number {
  switch (o.mode) {
    case "pan":
    case "rotate":
      return 1;
    case "shift":
      return o.colors.length;
    case "blobs":
      return 3;
  }
}

/** Keyframe offsets in percent, 0 to 100, as written in the keyframes. */
function keyframePercents(segments: number): string[] {
  return Array.from(
    { length: segments + 1 },
    (_, i) => `${formatNumber((i / segments) * 100, 3)}%`,
  );
}

/** Where an animation is at one moment: keyframe segment and eased progress in it. */
export interface AnimationState {
  readonly segment: number;
  /** Output of the timing function in the segment, 0 to 1. */
  readonly progress: number;
}

/**
 * State at loop time `t` in [0, 1). One loop is one iteration, or two for
 * the pan (`alternate`: there and back), so GIF frames loop seamlessly.
 * Web Animations model: the direction gives the directed progress, which
 * picks the keyframe segment, and the timing function applies inside the
 * segment (CSS `animation-timing-function` is per keyframe).
 */
export function animationStateAt(
  o: Pick<AnimatedGradientOptions, "mode" | "colors" | "timing" | "direction">,
  t: number,
): AnimationState {
  const iterations = o.mode === "pan" ? 2 : 1;
  const loop = Number.isFinite(t) ? ((t % 1) + 1) % 1 : 0;
  const u = loop * iterations;
  const k = Math.floor(u);
  const local = u - k;
  // The pan reverses by swapping its ends; the other modes use `reverse`.
  const forward = o.mode === "pan" ? k % 2 === 0 : o.direction !== "reverse";
  const directed = forward ? local : 1 - local;
  const segments = segmentCount(o);
  const segment = Math.min(Math.floor(directed * segments), segments - 1);
  return { segment, progress: cssTiming(o.timing, directed * segments - segment) };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Colours of the shift slots at keyframe `i` (slot j shows colour j + i). */
function shiftColors(colors: readonly string[], i: number): string[] {
  const n = colors.length;
  return colors.map((_, j) => (colors[(j + i) % n] as string).toLowerCase());
}

/** Blob waypoints (percent of the blob size), closed: origin, p1, p2, origin. */
function blobWaypoints(b: GradientBlob): [number, number][] {
  const [x1, y1, x2, y2] = b.path;
  return [
    [0, 0],
    [x1, y1],
    [x2, y2],
    [0, 0],
  ];
}

// ---------------------------------------------------------------------------
// SVG twin
// ---------------------------------------------------------------------------

function gradientBody(
  type: "linear" | "conic",
  colors: readonly string[],
  angle: number,
  loop: boolean,
  width: number,
  height: number,
): string {
  const o: CssGradientOptions = {
    type,
    colors,
    angle: ((angle % 360) + 360) % 360,
    centerX: 50,
    centerY: 50,
    shape: "circle",
    interpolation: "srgb",
    hue: "shorter",
    easing: "linear",
    steps: 0,
    loop,
    width,
    height,
  };
  return cssGradientSvgBody(o);
}

function blobsBody(o: AnimatedGradientOptions, blobs: readonly GradientBlob[], t: number): string {
  const { width: w, height: h } = o;
  const state = animationStateAt(o, t);
  const core = blobCore(o.blur) / 100;
  const opacity = o.intensity >= 100 ? "" : ` opacity="${formatNumber(o.intensity / 100, 2)}"`;
  const parts = [`<rect width="${f1(w)}" height="${f1(h)}" fill="${o.background}"/>`];
  const defs: string[] = [];
  for (const b of blobs) {
    const d = (b.size / 100) * w;
    const points = blobWaypoints(b);
    const a = points[state.segment] as [number, number];
    const z = points[state.segment + 1] as [number, number];
    const dx = (lerp(a[0], z[0], state.progress) / 100) * d;
    const dy = (lerp(a[1], z[1], state.progress) / 100) * d;
    const cx = (b.left / 100) * w + d / 2 + dx;
    const cy = (b.top / 100) * h + d / 2 + dy;
    const stops = `<stop offset="${formatNumber(core, 2)}" stop-color="${b.color}"/><stop offset="1" stop-color="${b.color}" stop-opacity="0"/>`;
    const id = stableId("ab", stops);
    if (!defs.some((x) => x.includes(`id="${id}"`))) {
      defs.push(`<radialGradient id="${id}">${stops}</radialGradient>`);
    }
    parts.push(
      `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(d / 2)}" fill="url(#${id})"${opacity}/>`,
    );
  }
  return `<defs>${defs.join("")}</defs>${parts.join("")}`;
}

/**
 * The SVG of the animation at loop time `t` (0 = the calm start state the
 * preview shows with reduced motion). Pure and deterministic.
 */
export function animatedGradientSvg(
  o: AnimatedGradientOptions,
  blobs: readonly GradientBlob[],
  t = 0,
): string {
  const { width: w, height: h } = o;
  const state = animationStateAt(o, t);
  let body: string;
  switch (o.mode) {
    case "pan": {
      const g = panGeometry(o);
      const bw = (w * g.size) / 100;
      const bh = (h * g.size) / 100;
      const px = lerp(g.from[0], g.to[0], state.progress) / 100;
      const py = lerp(g.from[1], g.to[1], state.progress) / 100;
      // CSS background-position: p % puts p % of the image at p % of the box.
      const ox = (w - bw) * px;
      const oy = (h - bh) * py;
      body = `<g transform="translate(${formatNumber(ox, 2)} ${formatNumber(oy, 2)})">${gradientBody("linear", o.colors, o.angle, false, bw, bh)}</g>`;
      break;
    }
    case "rotate": {
      const turn = 360 * state.progress;
      body = gradientBody(o.rotateShape, o.colors, o.angle + turn, o.rotateShape === "conic", w, h);
      break;
    }
    case "shift": {
      const a = shiftColors(o.colors, state.segment);
      const z = shiftColors(o.colors, state.segment + 1);
      const now = a.map((c, i) => mixHex(c, z[i] as string, state.progress, "srgb"));
      body = gradientBody("linear", now, o.angle, false, w, h);
      break;
    }
    case "blobs":
      body = blobsBody(o, blobs, t);
      break;
  }
  return svgDocument(w, h, body);
}

// ---------------------------------------------------------------------------
// Shared CSS pieces
// ---------------------------------------------------------------------------

/** Names used by one CSS flavour (namespaced preview or readable export). */
interface CssNames {
  readonly angle: string;
  readonly color: (i: number) => string;
  readonly keyframes: (mode: AnimatedGradientMode) => string;
}

const PREVIEW_PREFIX = "musterli-ag";

const PREVIEW_NAMES: CssNames = {
  angle: `--${PREVIEW_PREFIX}-angle`,
  color: (i) => `--${PREVIEW_PREFIX}-c${i + 1}`,
  keyframes: (mode) =>
    `${PREVIEW_PREFIX}-${mode === "rotate" ? "spin" : mode === "blobs" ? "float" : mode}`,
};

const EXPORT_NAMES: CssNames = {
  angle: "--gradient-angle",
  color: (i) => `--gradient-color-${i + 1}`,
  keyframes: (mode) =>
    mode === "blobs" ? "blob-float" : `gradient-${mode === "rotate" ? "spin" : mode}`,
};

/** Variables of a blob's path in the preview (`x1`, `y1`, `x2`, `y2`). */
const previewBlobVar = (key: string): string => `--${PREVIEW_PREFIX}-${key}`;
const exportBlobVar = (key: string): string => `--blob-${key}`;
const BLOB_VAR_KEYS = ["x1", "y1", "x2", "y2"] as const;

/** `from calc(30deg + var(--x))`, or just the variable for 0deg. */
function angleExpression(angle: number, variable: string): string {
  const a = ((angle % 360) + 360) % 360;
  return a === 0 ? `var(${variable})` : `calc(${deg(a)} + var(${variable}))`;
}

/** The gradient image of a non-blob mode with the given names. */
function gradientImage(o: AnimatedGradientOptions, names: CssNames): string {
  const colors = o.colors.map((c) => c.toLowerCase());
  switch (o.mode) {
    case "pan":
      return `linear-gradient(${deg(o.angle)}, ${colors.join(", ")})`;
    case "rotate":
      return o.rotateShape === "conic"
        ? `conic-gradient(from ${angleExpression(o.angle, names.angle)}, ${[...colors, colors[0]].join(", ")})`
        : `linear-gradient(${angleExpression(o.angle, names.angle)}, ${colors.join(", ")})`;
    case "shift":
      return `linear-gradient(${deg(o.angle)}, ${colors.map((_, i) => `var(${names.color(i)})`).join(", ")})`;
    case "blobs":
      return "none";
  }
}

/** The `animation` shorthand with the given keyframes name. */
function animationValue(o: AnimatedGradientOptions, name: string): string {
  const parts = [name, sec(o.duration), o.timing, "infinite"];
  if (o.mode === "pan") parts.push("alternate");
  else if (o.direction === "reverse") parts.push("reverse");
  return parts.join(" ");
}

const position = (p: readonly [number, number]): string => `${pct(p[0])} ${pct(p[1])}`;

/** Background of a blob box: solid core, then a fade to transparent at its edge. */
function blobImage(b: GradientBlob, blur: number): string {
  const core = blobCore(blur);
  return `radial-gradient(closest-side, ${b.color}${core > 0 ? ` ${core}%` : ""}, transparent)`;
}

/** Keyframes of a mode as `[selector, declarations]` with literal values. */
function exportKeyframes(o: AnimatedGradientOptions): [string, Declaration[]][] {
  switch (o.mode) {
    case "pan": {
      const g = panGeometry(o);
      return [
        ["from", [["background-position", position(g.from)]]],
        ["to", [["background-position", position(g.to)]]],
      ];
    }
    case "rotate":
      return [["to", [[EXPORT_NAMES.angle, "360deg"]]]];
    case "shift": {
      const n = o.colors.length;
      const at = keyframePercents(n);
      return Array.from({ length: n }, (_, i) => {
        const selector = i === 0 ? `${at[0]}, ${at[n]}` : (at[i] as string);
        const decls = shiftColors(o.colors, i).map(
          (c, j) => [EXPORT_NAMES.color(j), c] as Declaration,
        );
        return [selector, decls];
      });
    }
    case "blobs":
      return floatKeyframes(exportBlobVar);
  }
}

function floatKeyframes(variable: (key: string) => string): [string, Declaration[]][] {
  const at = keyframePercents(3);
  const v = (k: string) => `var(${variable(k)})`;
  return [
    [`${at[0]}, ${at[3]}`, [["transform", "translate(0, 0)"]]],
    [at[1] as string, [["transform", `translate(${v("x1")}, ${v("y1")})`]]],
    [at[2] as string, [["transform", `translate(${v("x2")}, ${v("y2")})`]]],
  ];
}

const block = (selector: string, decls: readonly Declaration[], indent = ""): string =>
  [`${indent}${selector} {`, ...decls.map(([p, v]) => `${indent}  ${p}: ${v};`), `${indent}}`].join(
    "\n",
  );

/** Keyframes as text; each step on one line when it is short. */
function keyframesText(
  name: string,
  steps: readonly [string, Declaration[]][],
  indent = "",
): string {
  const lines = steps.map(([selector, decls]) => {
    const body = decls.map(([p, v]) => `${p}: ${v};`).join(" ");
    return `${indent}  ${selector} { ${body} }`;
  });
  return [`${indent}@keyframes ${name} {`, ...lines, `${indent}}`].join("\n");
}

function propertyRule(name: string, syntax: string, initial: string): string {
  return block(`@property ${name}`, [
    ["syntax", `"${syntax}"`],
    ["inherits", "false"],
    ["initial-value", initial],
  ]);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

/**
 * Global rules of the preview: constant for the tool (several previews share
 * one stylesheet), every param-dependent value comes from custom properties
 * set on the element or box.
 */
export const ANIMATED_GRADIENT_RULES: string = (() => {
  const parts = [propertyRule(PREVIEW_NAMES.angle, "<angle>", "0deg")];
  for (let i = 0; i < ANIMATED_GRADIENT_COLORS_MAX; i++) {
    parts.push(propertyRule(PREVIEW_NAMES.color(i), "<color>", "transparent"));
  }
  parts.push(
    keyframesText(PREVIEW_NAMES.keyframes("pan"), [
      ["from", [["background-position", `var(--${PREVIEW_PREFIX}-from)`]]],
      ["to", [["background-position", `var(--${PREVIEW_PREFIX}-to)`]]],
    ]),
    keyframesText(PREVIEW_NAMES.keyframes("rotate"), [["to", [[PREVIEW_NAMES.angle, "360deg"]]]]),
  );
  for (let n = ANIMATED_GRADIENT_COLORS_MIN; n <= ANIMATED_GRADIENT_COLORS_MAX; n++) {
    const at = keyframePercents(n);
    const steps: [string, Declaration[]][] = Array.from({ length: n }, (_, i) => [
      i === 0 ? `${at[0]}, ${at[n]}` : (at[i] as string),
      Array.from(
        { length: n },
        (_, j) =>
          [PREVIEW_NAMES.color(j), `var(--${PREVIEW_PREFIX}-p${((j + i) % n) + 1})`] as Declaration,
      ),
    ]);
    parts.push(keyframesText(`${PREVIEW_NAMES.keyframes("shift")}-${n}`, steps));
  }
  parts.push(keyframesText(PREVIEW_NAMES.keyframes("blobs"), floatKeyframes(previewBlobVar)));
  return parts.join("\n");
})();

/** A blob box of the preview, in px relative to the element. */
export interface PreviewBlobBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly declarations: readonly Declaration[];
  readonly motion: readonly Declaration[];
}

export interface AnimatedGradientPreview {
  /** Declarations of the element covering the whole canvas. */
  readonly declarations: readonly Declaration[];
  /** Animation of the element (empty for blobs). */
  readonly motion: readonly Declaration[];
  readonly boxes: readonly PreviewBlobBox[];
}

/** The preview element and blob boxes; their animations use `ANIMATED_GRADIENT_RULES`. */
export function animatedGradientPreview(
  o: AnimatedGradientOptions,
  blobs: readonly GradientBlob[],
): AnimatedGradientPreview {
  const first = (o.colors[0] ?? "#000000").toLowerCase();
  if (o.mode === "blobs") {
    const w = o.width;
    const h = o.height;
    const motion: Declaration[] = [
      ["animation", animationValue(o, PREVIEW_NAMES.keyframes("blobs"))],
    ];
    const boxes = blobs.map((b): PreviewBlobBox => {
      const d = (b.size / 100) * w;
      const decls: Declaration[] = [["background-image", blobImage(b, o.blur)]];
      if (o.intensity < 100) decls.push(["opacity", formatNumber(o.intensity / 100, 2)]);
      BLOB_VAR_KEYS.forEach((k, i) => decls.push([previewBlobVar(k), pct(b.path[i] as number)]));
      const r2 = (v: number) => Math.round(v * 100) / 100;
      return {
        x: r2((b.left / 100) * w),
        y: r2((b.top / 100) * h),
        width: r2(d),
        height: r2(d),
        declarations: decls,
        motion,
      };
    });
    return { declarations: [["background-color", o.background]], motion: [], boxes };
  }
  const decls: Declaration[] = [["background-color", first]];
  let keyframes = PREVIEW_NAMES.keyframes(o.mode);
  if (o.mode === "shift") {
    keyframes = `${keyframes}-${o.colors.length}`;
    o.colors.forEach((c, i) => {
      decls.push([PREVIEW_NAMES.color(i), c.toLowerCase()]);
      decls.push([`--${PREVIEW_PREFIX}-p${i + 1}`, c.toLowerCase()]);
    });
  }
  decls.push(["background-image", gradientImage(o, PREVIEW_NAMES)]);
  if (o.mode === "pan") {
    const g = panGeometry(o);
    decls.push(
      ["background-size", `${g.size}% ${g.size}%`],
      ["background-position", position(g.from)],
      [`--${PREVIEW_PREFIX}-from`, position(g.from)],
      [`--${PREVIEW_PREFIX}-to`, position(g.to)],
    );
  }
  return {
    declarations: decls,
    motion: [["animation", animationValue(o, keyframes)]],
    boxes: [],
  };
}

// ---------------------------------------------------------------------------
// Code exports
// ---------------------------------------------------------------------------

/** Class of the animated element in the code exports. */
export const ANIMATED_GRADIENT_CLASS = "animated-gradient";

/** `@property` rules the export needs (rotation angle, shift colours), or none. */
function exportPropertyRules(o: AnimatedGradientOptions): string[] {
  if (o.mode === "rotate") return [propertyRule(EXPORT_NAMES.angle, "<angle>", "0deg")];
  if (o.mode === "shift") {
    return o.colors.map((c, i) => propertyRule(EXPORT_NAMES.color(i), "<color>", c.toLowerCase()));
  }
  return [];
}

/** Declarations of the gradient element (not blobs), including the animation. */
function exportElementDeclarations(o: AnimatedGradientOptions): Declaration[] {
  const decls: Declaration[] = [];
  if (o.mode === "shift") {
    o.colors.forEach((c, i) => decls.push([EXPORT_NAMES.color(i), c.toLowerCase()]));
  }
  decls.push(["background-image", gradientImage(o, EXPORT_NAMES)]);
  if (o.mode === "pan") {
    const g = panGeometry(o);
    decls.push(
      ["background-size", `${g.size}% ${g.size}%`],
      ["background-position", position(g.from)],
    );
  }
  decls.push(["animation", animationValue(o, EXPORT_NAMES.keyframes(o.mode))]);
  return decls;
}

const blobSelector = (i: number): string => `.${ANIMATED_GRADIENT_CLASS} .blob:nth-child(${i + 1})`;

function blobCommonDeclarations(o: AnimatedGradientOptions): Declaration[] {
  const decls: Declaration[] = [
    ["position", "absolute"],
    ["aspect-ratio", "1"],
  ];
  if (o.intensity < 100) decls.push(["opacity", formatNumber(o.intensity / 100, 2)]);
  decls.push(["animation", animationValue(o, EXPORT_NAMES.keyframes("blobs"))]);
  return decls;
}

function blobDeclarations(b: GradientBlob, blur: number): Declaration[] {
  const decls: Declaration[] = [
    ["left", pct(b.left)],
    ["top", pct(b.top)],
    ["width", pct(b.size)],
    ["background-image", blobImage(b, blur)],
  ];
  BLOB_VAR_KEYS.forEach((k, i) => decls.push([exportBlobVar(k), pct(b.path[i] as number)]));
  return decls;
}

const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";

/**
 * The stylesheet: `@property` rules where needed, the element (and blob)
 * rules, the keyframes and a reduced motion rule that stops the animation
 * on the calm start state. Browsers without `@property` show the static
 * gradient (the rotating angle only flips between 0deg and 360deg; the
 * shift colours jump instead of blending).
 */
export function animatedGradientCss(
  o: AnimatedGradientOptions,
  blobs: readonly GradientBlob[],
): string {
  const cls = `.${ANIMATED_GRADIENT_CLASS}`;
  const parts: string[] = [...exportPropertyRules(o)];
  let animated = cls;
  if (o.mode === "blobs") {
    animated = `${cls} .blob`;
    parts.push(
      block(cls, [
        ["position", "relative"],
        ["overflow", "hidden"],
        ["background-color", o.background],
      ]),
      block(animated, blobCommonDeclarations(o)),
      ...blobs.map((b, i) => block(blobSelector(i), blobDeclarations(b, o.blur))),
    );
  } else {
    parts.push(block(cls, exportElementDeclarations(o)));
  }
  parts.push(
    keyframesText(EXPORT_NAMES.keyframes(o.mode), exportKeyframes(o)),
    [REDUCED_MOTION + " {", block(animated, [["animation", "none"]], "  "), "}"].join("\n"),
  );
  return `${parts.join("\n\n")}\n`;
}

/** Markup of the animated element (with its blob spans). */
function elementMarkup(blobCount: number, classes = ANIMATED_GRADIENT_CLASS): string {
  if (blobCount === 0) return `<div class="${classes}"></div>`;
  const spans = Array.from(
    { length: blobCount },
    () => '  <span class="blob" aria-hidden="true"></span>',
  );
  return [`<div class="${classes}">`, ...spans, "</div>"].join("\n");
}

/** A standalone HTML page that shows the animation at the design's aspect ratio. */
export function animatedGradientHtml(
  o: AnimatedGradientOptions,
  blobs: readonly GradientBlob[],
): string {
  const size = block(`.${ANIMATED_GRADIENT_CLASS}`, [
    ["width", "100%"],
    ["aspect-ratio", `${formatNumber(o.width, 0)} / ${formatNumber(o.height, 0)}`],
  ]);
  return [
    "<style>",
    animatedGradientCss(o, blobs).trimEnd(),
    "",
    size,
    "",
    block("body", [["margin", "0"]]),
    "</style>",
    elementMarkup(o.mode === "blobs" ? blobs.length : 0),
    "",
  ].join("\n");
}

const tw = (value: string): string => tailwindArbitrary(value);

/** Tailwind classes of the gradient element (not blobs); `animate` is the animation class. */
function gradientTailwindClasses(o: AnimatedGradientOptions, animate: string): string[] {
  const classes: string[] = [];
  for (const [p, v] of exportElementDeclarations(o)) {
    if (p === "animation") continue;
    if (p.startsWith("--")) classes.push(`[${p}:${tw(v)}]`);
    else if (p === "background-image") classes.push(`bg-[${tw(v)}]`);
    else if (p === "background-size") classes.push(`bg-[length:${tw(v)}]`);
    else if (p === "background-position") classes.push(`bg-[position:${tw(v)}]`);
  }
  classes.push(animate, "motion-reduce:animate-none");
  return classes;
}

function blobTailwindClasses(
  o: AnimatedGradientOptions,
  b: GradientBlob,
  animate: string,
): string[] {
  const classes = ["absolute", "aspect-square"];
  if (o.intensity < 100) classes.push(`opacity-[${formatNumber(o.intensity / 100, 2)}]`);
  classes.push(animate, "motion-reduce:animate-none");
  for (const [p, v] of blobDeclarations(b, o.blur)) {
    if (p === "left" || p === "top") classes.push(`${p}-[${v}]`);
    else if (p === "width") classes.push(`w-[${v}]`);
    else if (p === "background-image") classes.push(`bg-[${tw(v)}]`);
    else classes.push(`[${p}:${v}]`);
  }
  return classes;
}

function tailwindMarkup(
  o: AnimatedGradientOptions,
  blobs: readonly GradientBlob[],
  animate: string,
): string {
  if (o.mode !== "blobs") {
    return `<div class="${gradientTailwindClasses(o, animate).join(" ")}"></div>`;
  }
  const spans = blobs.map(
    (b) =>
      `  <span class="${blobTailwindClasses(o, b, animate).join(" ")}" aria-hidden="true"></span>`,
  );
  return [`<div class="relative overflow-hidden bg-[${o.background}]">`, ...spans, "</div>"].join(
    "\n",
  );
}

/**
 * Tailwind classes (v3 and v4, arbitrary values). Keyframes cannot be
 * arbitrary values, so a comment points to the rules of the CSS export.
 */
export function animatedGradientTailwind(
  o: AnimatedGradientOptions,
  blobs: readonly GradientBlob[],
): string {
  const animate = `animate-[${tw(animationValue(o, EXPORT_NAMES.keyframes(o.mode)))}]`;
  const rules =
    o.mode === "rotate" || o.mode === "shift" ? "@property and @keyframes" : "@keyframes";
  return `<!-- Add the ${rules} rules from the CSS export to your stylesheet. -->\n${tailwindMarkup(o, blobs, animate)}\n`;
}

/**
 * Tailwind v4: the animation as a theme variable (`--animate-<name>` gives
 * the class `animate-<name>`) with its keyframes inside `@theme`;
 * `@property` rules stay outside. A comment shows the markup.
 */
export function animatedGradientTailwindTheme(
  o: AnimatedGradientOptions,
  blobs: readonly GradientBlob[],
): string {
  const name = EXPORT_NAMES.keyframes(o.mode);
  const theme = [
    "@theme {",
    `  --animate-${name}: ${animationValue(o, name)};`,
    "",
    keyframesText(name, exportKeyframes(o), "  "),
    "}",
  ].join("\n");
  const parts = [...exportPropertyRules(o), theme];
  const usage = tailwindMarkup(o, blobs, `animate-${name}`)
    .split("\n")
    .map((line) => `   ${line}`)
    .join("\n");
  parts.push(`/* Usage:\n${usage}\n*/`);
  return `${parts.join("\n\n")}\n`;
}
