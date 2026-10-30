/**
 * Glitch background (docs/TOOLS.md C6): a gradient through the palette,
 * torn into horizontal slices that are shifted sideways like a broken video
 * signal, with red and cyan fringes (RGB split), stray colour blocks,
 * scanlines and grain.
 *
 * Rects, linear gradients and one line pattern, no filter: renders the same
 * at every size and costs nothing at 8K. Each slice reuses the base gradient,
 * moved by its own `gradientTransform`.
 */
import { formatNumber } from "../../curves";
import type { Rng } from "../../rng";
import { stableId, svgDocument } from "../../svg";
import { type GrainLayer, grainOverlay } from "../noise-grain";

export const GLITCH_SLICES_MAX = 40;
export const GLITCH_BLOCKS_MAX = 60;

/** Fringe colours of the RGB split (above and below a slice). */
export const GLITCH_SPLIT_COLORS = ["#ff1f4b", "#00e5ff"] as const;
/** Peak opacity of the scanlines at 1. */
const SCANLINE_MAX = 0.35;

export interface GlitchOptions {
  readonly width: number;
  readonly height: number;
  /** Base gradient stops, evenly spaced. */
  readonly colors: readonly string[];
  /** Base gradient direction, CSS-style degrees (0 = to top). */
  readonly angle: number;
  /** Number of shifted slices, clamped to [0, 40]. */
  readonly slices: number;
  /** Largest sideways shift as a share of the width in [0, 1]. */
  readonly shift: number;
  /** RGB split strength in [0, 1] (fringe height and opacity). */
  readonly split: number;
  /** Number of stray blocks, clamped to [0, 60]. */
  readonly blocks: number;
  /** Scanline strength in [0, 1]. */
  readonly scanlines: number;
  readonly rng: Rng;
  readonly grain?: GrainLayer | null;
}

export interface GlitchSlice {
  /** Left edge and width in px (a tear rarely spans the whole width). */
  readonly x: number;
  readonly width: number;
  /** Top and height in px, sideways shift in px. */
  readonly y: number;
  readonly height: number;
  readonly dx: number;
  /** Runs through the palette backwards, so the tear stands out. */
  readonly invert: boolean;
}

export interface GlitchBlock {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Palette index, or -1 for white and -2 for black. */
  readonly color: number;
  readonly opacity: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Seeded slices and blocks. Draws for the maximum counts whatever the params,
 * so more slices or a stronger shift never reshuffle the rest.
 */
export function glitchLayout(o: GlitchOptions): {
  slices: GlitchSlice[];
  blocks: GlitchBlock[];
} {
  const nSlices = Math.round(clamp(o.slices, 0, GLITCH_SLICES_MAX));
  const nBlocks = Math.round(clamp(o.blocks, 0, GLITCH_BLOCKS_MAX));
  const shift = clamp(o.shift, 0, 1) * o.width;
  const slices: GlitchSlice[] = [];
  for (let i = 0; i < GLITCH_SLICES_MAX; i++) {
    const y = o.rng.next() * o.height;
    // Mostly thin tears, now and then a thick one.
    const thick = o.rng.next() < 0.2;
    const height = o.height * (thick ? o.rng.float(0.04, 0.12) : o.rng.float(0.004, 0.035));
    const dx = shift * o.rng.float(-1, 1);
    const full = o.rng.next() < 0.45;
    const x = full ? 0 : o.rng.float(-0.2, 0.6) * o.width;
    const width = full ? o.width : o.width * o.rng.float(0.3, 0.9);
    const invert = o.rng.next() < 0.25;
    if (i < nSlices) {
      slices.push({ x, width, y, height: Math.min(height, o.height - y), dx, invert });
    }
  }
  const colorCount = Math.max(1, o.colors.length);
  const blocks: GlitchBlock[] = [];
  for (let i = 0; i < GLITCH_BLOCKS_MAX; i++) {
    const x = o.rng.next() * o.width;
    const y = o.rng.next() * o.height;
    const width = o.width * o.rng.float(0.02, 0.28);
    const height = o.height * o.rng.float(0.003, 0.025);
    const pick = o.rng.next();
    const opacity = o.rng.float(0.55, 1);
    const color =
      pick < 0.15 ? -1 : pick < 0.25 ? -2 : Math.floor(((pick - 0.25) / 0.75) * colorCount);
    if (i < nBlocks) blocks.push({ x, y, width, height, color, opacity });
  }
  return { slices, blocks };
}

function stops(colors: readonly string[]): string {
  const last = Math.max(1, colors.length - 1);
  return colors
    .map((c, i) => `<stop offset="${formatNumber(i / last, 3)}" stop-color="${c}"/>`)
    .join("");
}

/** SVG document: base gradient, shifted slices with fringes, blocks, scanlines, grain. */
export function glitchSvg(o: GlitchOptions): string {
  const colors = o.colors.length > 0 ? o.colors : ["#000000", "#ffffff"];
  const { slices, blocks } = glitchLayout(o);
  const f = (v: number): string => formatNumber(v, 2);
  const w = f(o.width);
  const h = f(o.height);
  const cx = o.width / 2;
  const cy = o.height / 2;
  // The gradient line spans the canvas along the angle, like CSS.
  const a = (o.angle * Math.PI) / 180;
  const half = (Math.abs(o.width * Math.sin(a)) + Math.abs(o.height * Math.cos(a))) / 2;
  const dx = Math.sin(a) * half;
  const dy = -Math.cos(a) * half;
  const gradient =
    `<linearGradient x1="${f(cx - dx)}" y1="${f(cy - dy)}" x2="${f(cx + dx)}" y2="${f(cy + dy)}" ` +
    `gradientUnits="userSpaceOnUse">${stops(colors)}</linearGradient>`;
  const base = stableId("g", gradient);
  let defs = gradient.replace("<linearGradient ", `<linearGradient id="${base}" `);
  const reversed = gradient.replace(stops(colors), stops([...colors].reverse()));
  let body = `<rect width="${w}" height="${h}" fill="url(#${base})"/>`;
  const split = clamp(o.split, 0, 1);
  const seen = new Set<string>();
  for (const s of slices) {
    // A shifted copy of the base gradient; slices with the same shift share it.
    // Full copy instead of `href`, which older design apps do not resolve.
    const moved = (s.invert ? reversed : gradient).replace(
      "<linearGradient ",
      `<linearGradient gradientTransform="translate(${f(s.dx)} 0)" `,
    );
    const id = stableId("t", moved);
    if (!seen.has(id)) {
      seen.add(id);
      defs += moved.replace("<linearGradient ", `<linearGradient id="${id}" `);
    }
    const sx = f(s.x);
    const sw = f(s.width);
    body += `<rect x="${sx}" y="${f(s.y)}" width="${sw}" height="${f(s.height)}" fill="url(#${id})"/>`;
    if (split > 0) {
      const fringe = Math.max(1, s.height * 0.35 * split);
      const op = formatNumber(0.25 + 0.6 * split, 3);
      const [red, cyan] = GLITCH_SPLIT_COLORS;
      // Fringes are offset sideways in opposite directions, like a split signal.
      const off = Math.sign(s.dx || 1) * o.width * 0.01 * split;
      body +=
        `<rect x="${f(s.x + off)}" y="${f(s.y - fringe)}" width="${sw}" height="${f(fringe)}" ` +
        `fill="${red}" opacity="${op}" style="mix-blend-mode:screen"/>` +
        `<rect x="${f(s.x - off)}" y="${f(s.y + s.height)}" width="${sw}" height="${f(fringe)}" ` +
        `fill="${cyan}" opacity="${op}" style="mix-blend-mode:screen"/>`;
    }
  }
  for (const b of blocks) {
    const fill = b.color === -1 ? "#ffffff" : b.color === -2 ? "#000000" : colors[b.color];
    body +=
      `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.width)}" height="${f(b.height)}" ` +
      `fill="${fill}" opacity="${formatNumber(b.opacity, 2)}"/>`;
  }
  const scan = clamp(o.scanlines, 0, 1) * SCANLINE_MAX;
  if (scan > 0) {
    // About 270 lines on any canvas, never thinner than 2 px per period.
    const period = Math.max(2, Math.round(o.height / 270));
    const line =
      `<pattern width="${period}" height="${period}" patternUnits="userSpaceOnUse">` +
      `<rect width="${period}" height="${f(period / 2)}" fill="#000"/></pattern>`;
    const id = stableId("l", line);
    defs += line.replace("<pattern ", `<pattern id="${id}" `);
    body += `<rect width="${w}" height="${h}" fill="url(#${id})" opacity="${formatNumber(scan, 3)}"/>`;
  }
  const grain = o.grain ? grainOverlay(o.width, o.height, o.grain) : { def: "", rect: "" };
  defs += grain.def;
  return svgDocument(o.width, o.height, `<defs>${defs}</defs>${body}${grain.rect}`);
}
