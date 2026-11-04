/**
 * Shared pieces of the CPU twins (S2): uniform readers, GLSL built-ins in
 * float64 and the per-pixel loop that walks a tile exactly like the GPU
 * runtime (pixel centres, `u_design` coordinates, RGBA8 rounding).
 */
import type { PixelBuffer } from "@musterli/effects";
import type { ShaderFrameInput } from "./frame";

export type Uniforms = ShaderFrameInput["uniforms"];

export function num(u: Uniforms, name: string): number {
  const v = u[name];
  if (typeof v !== "number") throw new TypeError(`uniform ${name} must be a number`);
  return v;
}

export function list(u: Uniforms, name: string, length: number): readonly number[] {
  const v = u[name];
  if (!Array.isArray(v) || v.length !== length) {
    throw new TypeError(`uniform ${name} must have ${length} numbers`);
  }
  return v as readonly number[];
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** GLSL `fract`. */
export const fract = (x: number): number => x - Math.floor(x);

/** Converts like the GPU writing to an RGBA8 target. */
export const toByte = (v: number): number => Math.round(clamp(v, 0, 1) * 255);

/** What a CPU shader sees for one pixel (all in float64). */
export interface CpuPixel {
  /** Design coordinates of the pixel centre, origin top left. */
  dx: number;
  dy: number;
  /** 0..1 across the output. */
  uvx: number;
  uvy: number;
  /** Centred coordinates, shorter design edge = 1. */
  cx: number;
  cy: number;
  /** Design pixels per output pixel (anti-aliasing width). */
  aa: number;
}

/**
 * Runs `shade` for every pixel of `input.tile` (default all of it); `shade`
 * writes linear 0..1 RGBA into `out`.
 */
export function renderCpuTile(
  input: ShaderFrameInput,
  shade: (px: CpuPixel, out: Float64Array) => void,
): PixelBuffer {
  const { out, design } = input;
  const tile = input.tile ?? { x: 0, y: 0, width: out.width, height: out.height };
  const data = new Uint8ClampedArray(tile.width * tile.height * 4);
  const color = new Float64Array(4);
  const minEdge = Math.min(design.width, design.height);
  const px: CpuPixel = {
    dx: 0,
    dy: 0,
    uvx: 0,
    uvy: 0,
    cx: 0,
    cy: 0,
    aa: design.width / out.width,
  };
  for (let row = 0; row < tile.height; row++) {
    px.uvy = (tile.y + row + 0.5) / out.height;
    px.dy = px.uvy * design.height;
    px.cy = (px.dy - 0.5 * design.height) / minEdge;
    for (let col = 0; col < tile.width; col++) {
      px.uvx = (tile.x + col + 0.5) / out.width;
      px.dx = px.uvx * design.width;
      px.cx = (px.dx - 0.5 * design.width) / minEdge;
      color[3] = 1;
      shade(px, color);
      const o = (row * tile.width + col) * 4;
      data[o] = toByte(color[0] ?? 0);
      data[o + 1] = toByte(color[1] ?? 0);
      data[o + 2] = toByte(color[2] ?? 0);
      data[o + 3] = toByte(color[3] ?? 1);
    }
  }
  return { width: tile.width, height: tile.height, data };
}

/**
 * Offsets on circles for seamless loops: one (x, y) pair per orbit
 * `[radius, phase, turns]`, at loop position `loop` (any real number).
 */
export function orbitOffsets(
  loop: number,
  orbits: readonly (readonly [radius: number, phase: number, turns: number])[],
): number[] {
  const theta = 2 * Math.PI * (loop - Math.floor(loop));
  const out: number[] = [];
  for (const [radius, phase, turns] of orbits) {
    out.push(radius * Math.cos(theta * turns + phase), radius * Math.sin(theta * turns + phase));
  }
  return out;
}

/** Hex `#rrggbb` to linear-free 0..1 sRGB components (as the GPU receives them). */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1] ?? "0", 16) : 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
