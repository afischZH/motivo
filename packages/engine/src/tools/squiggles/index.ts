/**
 * Squiggle lines (docs/TOOLS.md D8): hand-drawn looking decorative lines as
 * single round strokes. Waves, zigzags, loops, bumps and a seeded scribble;
 * one line (a divider or underline), a stack of parallel lines, or short
 * squiggles scattered like confetti.
 *
 * Sizes are shares of the shorter canvas side, so a design keeps its look at
 * any export size. Stacked lines share one path through `<use>`, which keeps
 * the SVG small; `t` shifts every line by one wavelength for a seamless loop.
 */
import { catmullRomToBezier, cubicPathToSvg, formatNumber } from "../../curves";
import { createRng, type Rng } from "../../rng";
import { stableId, svgBackground, svgDocument } from "../../svg";

export const SQUIGGLE_STYLES = ["wave", "zigzag", "loops", "bumps", "scribble"] as const;
export type SquiggleStyle = (typeof SQUIGGLE_STYLES)[number];

export const SQUIGGLE_LAYOUTS = ["single", "stack", "scatter"] as const;
export type SquiggleLayout = (typeof SQUIGGLE_LAYOUTS)[number];

export const SQUIGGLE_COUNT_MAX = 80;
/** Waves along one line are capped, so tiny wavelengths cannot blow up the SVG. */
const MAX_PERIODS = 400;

export interface SquiggleOptions {
  readonly width: number;
  readonly height: number;
  /** Solid colour or "transparent". */
  readonly background: string;
  readonly colors: readonly string[];
  readonly style: SquiggleStyle;
  readonly layout: SquiggleLayout;
  /** Lines in a stack or squiggles in a scatter, clamped to [1, 80]. */
  readonly count: number;
  /** Wavelength, height (peak to peak) and stroke width as shares of the shorter side. */
  readonly wavelength: number;
  readonly amplitude: number;
  readonly stroke: number;
  /** Length of a scattered squiggle as a share of the shorter side. */
  readonly length: number;
  /** Direction of single and stacked lines in degrees. */
  readonly angle: number;
  readonly rng: Rng;
  /** Animation time in [0, 1): shifts by one wavelength. */
  readonly t?: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const f = (v: number): string => formatNumber(v, 2);

/**
 * Path of a squiggle along the x axis from `x0` over `periods` wavelengths
 * `lambda`, peak to peak `amp`, centred on y = 0. `rng` is only read by
 * the scribble.
 */
export function squigglePath(
  style: SquiggleStyle,
  x0: number,
  periods: number,
  lambda: number,
  amp: number,
  rng?: Rng,
): string {
  const n = Math.max(1, Math.min(MAX_PERIODS, Math.ceil(periods)));
  const a = amp / 2;
  switch (style) {
    case "wave": {
      // Quadratic halves: the control point at twice the height gives a parabola peak at `a`.
      let d = `M${f(x0)} 0Q${f(x0 + lambda / 4)} ${f(-2 * a)} ${f(x0 + lambda / 2)} 0`;
      for (let k = 1; k < n * 2; k++) d += `T${f(x0 + ((k + 1) * lambda) / 2)} 0`;
      return d;
    }
    case "zigzag": {
      let d = `M${f(x0)} ${f(a)}`;
      for (let k = 1; k <= n * 2; k++)
        d += `L${f(x0 + (k * lambda) / 2)} ${f(k % 2 === 1 ? -a : a)}`;
      return d;
    }
    case "bumps": {
      let d = `M${f(x0)} ${f(a)}`;
      for (let k = 0; k < n; k++) d += `a${f(lambda / 2)} ${f(amp)} 0 0 1 ${f(lambda)} 0`;
      return d;
    }
    case "loops": {
      // Prolate cycloid: the pen runs forward while circling, looping when the circle is wider than the step.
      const step = lambda / (Math.PI * 2);
      const pts: { x: number; y: number }[] = [];
      const per = 10;
      for (let k = 0; k <= n * per; k++) {
        const th = (k / per) * Math.PI * 2;
        pts.push({ x: x0 + step * th - a * Math.sin(th), y: a * Math.cos(th) });
      }
      return cubicPathToSvg(catmullRomToBezier(pts), 2);
    }
    case "scribble": {
      // Seeded wave: each half gets its own height and length, like a quick pen line.
      let d = `M${f(x0)} 0`;
      let x = x0;
      const end = x0 + n * lambda;
      let k = 0;
      while (x < end) {
        const h = rng ? rng.float(0.45, 1) : 1;
        const len = (lambda / 2) * (rng ? rng.float(0.7, 1.3) : 1);
        const sign = k % 2 === 0 ? -1 : 1;
        d += `Q${f(x + len / 2)} ${f(sign * 2 * a * h)} ${f(x + len)} 0`;
        x += len;
        k++;
      }
      return d;
    }
  }
}

/** Squiggle lines as SVG. */
export function squigglesSvg(o: SquiggleOptions): string {
  const { width: w, height: h } = o;
  const s = Math.min(w, h);
  const lambda = Math.max(2, s * clamp(o.wavelength, 0.005, 2));
  const amp = s * clamp(o.amplitude, 0, 1);
  const sw = Math.max(0.5, s * clamp(o.stroke, 0.001, 0.3));
  const colors = o.colors.length > 0 ? o.colors : ["#111827"];
  const count = Math.round(clamp(o.count, 1, SQUIGGLE_COUNT_MAX));
  const phase = (((o.t ?? 0) % 1) + 1) % 1;
  const shift = -phase * lambda;
  const parts: string[] = [svgBackground(o.background, w, h)];
  const stroke = `fill="none" stroke-width="${f(sw)}" stroke-linecap="round" stroke-linejoin="round"`;

  if (o.layout === "scatter") {
    const len = s * clamp(o.length, 0.02, 2);
    const periods = Math.max(0.5, len / lambda);
    const items: string[] = [];
    for (let i = 0; i < SQUIGGLE_COUNT_MAX; i++) {
      // Fixed draws per slot so the count never moves the other squiggles.
      const x = o.rng.float(0.05, 0.95) * w;
      const y = o.rng.float(0.05, 0.95) * h;
      const rot = o.rng.float(0, 360);
      const tint = o.rng.next();
      const seed = o.rng.next();
      if (i >= count) continue;
      const color = colors[Math.floor(tint * colors.length)] as string;
      // Its own stream, so a scribble's length never shifts the other slots.
      const local = createRng(Math.floor(seed * 0xffffffff));
      const d = squigglePath(o.style, -len / 2, periods, lambda, amp, local);
      items.push(
        `<path d="${d}" transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})" stroke="${color}"/>`,
      );
    }
    parts.push(`<g ${stroke}>${items.join("")}</g>`);
    return svgDocument(w, h, parts.join(""));
  }

  // Single and stack: lines long enough to cross the canvas at any angle, turned about the centre.
  const diag = Math.hypot(w, h);
  const half = diag / 2 + lambda * 2;
  const periods = (half * 2) / lambda + 1;
  const x0 = -half;
  const lines: string[] = [];
  const n = o.layout === "single" ? 1 : count;
  const spread =
    o.layout === "single"
      ? 0
      : Math.min(diag, h + Math.abs(Math.sin((o.angle * Math.PI) / 180)) * w);
  const gap = n > 1 ? spread / n : 0;
  if (o.style === "scribble") {
    for (let i = 0; i < n; i++) {
      const y = (i - (n - 1) / 2) * gap;
      const d = squigglePath("scribble", x0, periods, lambda, amp, o.rng);
      const color = colors[i % colors.length] as string;
      lines.push(`<path d="${d}" transform="translate(${f(shift)} ${f(y)})" stroke="${color}"/>`);
    }
  } else {
    const d = squigglePath(o.style, x0, periods, lambda, amp);
    const id = stableId("sq", d);
    parts.push(`<defs><path id="${id}" d="${d}"/></defs>`);
    for (let i = 0; i < n; i++) {
      const y = (i - (n - 1) / 2) * gap;
      const color = colors[i % colors.length] as string;
      lines.push(`<use href="#${id}" x="${f(shift)}" y="${f(y)}" stroke="${color}"/>`);
    }
  }
  parts.push(
    `<g transform="translate(${f(w / 2)} ${f(h / 2)}) rotate(${f(o.angle)})" ${stroke}>${lines.join("")}</g>`,
  );
  return svgDocument(w, h, parts.join(""));
}

/**
 * One wavelength of a periodic style as a tile for a CSS underline
 * (`background-repeat: repeat-x`). Scribbles fall back to a wave.
 */
export function squiggleTileSvg(o: {
  readonly style: SquiggleStyle;
  readonly lambda: number;
  readonly amp: number;
  readonly stroke: number;
  readonly color: string;
}): { svg: string; width: number; height: number } {
  const style = o.style === "scribble" ? "wave" : o.style;
  const tileH = Math.ceil(o.amp + o.stroke * 2);
  const width = Math.max(1, o.lambda);
  // Start one wavelength early and draw three, so the joins at the tile edges are part of the stroke.
  const d = squigglePath(style, -width, 3, width, o.amp);
  const cy = tileH / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}" height="${tileH}" viewBox="0 0 ${f(width)} ${tileH}">` +
    `<path d="${d}" transform="translate(0 ${f(cy)})" fill="none" stroke="${o.color}" stroke-width="${f(o.stroke)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return { svg, width, height: tileH };
}
