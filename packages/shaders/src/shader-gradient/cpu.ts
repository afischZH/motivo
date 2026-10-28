/**
 * CPU reference of `SHADER_GRADIENT_FRAGMENT`, line by line in float64.
 * Only for places without WebGL: static motifs at build time (Node) and
 * unit tests. The editor always renders on the GPU.
 */
import type { PixelBuffer } from "@musterli/effects";
import { fbm2, hash3, simplex2 } from "../noise";
import { rampColor } from "../palette";
import type { ShaderFrameInput } from "../frame";

type Uniforms = ShaderFrameInput["uniforms"];

function num(u: Uniforms, name: string): number {
  const v = u[name];
  if (typeof v !== "number") throw new TypeError(`uniform ${name} must be a number`);
  return v;
}

function list(u: Uniforms, name: string, length: number): readonly number[] {
  const v = u[name];
  if (!Array.isArray(v) || v.length !== length) {
    throw new TypeError(`uniform ${name} must have ${length} numbers`);
  }
  return v as readonly number[];
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** GLSL `CELL_EPSILON`: keeps cell edges stable between float32 and float64. */
const CELL_EPSILON = 0.001;

/** Converts like the GPU writing to an RGBA8 target. */
const toByte = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);

/**
 * Renders `input.tile` of the output (default: all of it) into RGBA,
 * top row first.
 */
export function renderShaderGradientCpu(input: ShaderFrameInput): PixelBuffer {
  const { uniforms: u, out, design } = input;
  const tile = input.tile ?? { x: 0, y: 0, width: out.width, height: out.height };
  const palette = input.palette;
  if (!palette) throw new TypeError("shader gradient needs a palette texture");

  const style = num(u, "u_style");
  const detail = num(u, "u_detail");
  const [ba = 0, bb = 0, bc = 0, bd = 0] = list(u, "u_basis", 4);
  const off = list(u, "u_off", 8);
  const [o0x = 0, o0y = 0, o1x = 0, o1y = 0, o2x = 0, o2y = 0, o3x = 0, o3y = 0] = off;
  const w = num(u, "u_warp");
  const amplitude = num(u, "u_amplitude");
  const bayer = list(u, "u_bayer", 64);
  const bayerSize = num(u, "u_bayerSize");
  const levels = num(u, "u_levels");
  const ditherScale = num(u, "u_ditherScale");
  const grain = num(u, "u_grain");
  const vignette = num(u, "u_vignette");
  const salts = list(u, "u_salts", 5);
  const grainSalt = num(u, "u_grainSalt");
  const [s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0] = salts;

  const fbm = (x: number, y: number, s: number) => fbm2(x, y, s, detail);

  const field = (px: number, py: number): number => {
    switch (style) {
      case 0: {
        const lx = px * 0.5;
        const ly = py * 0.5;
        const qx = simplex2(lx + o0x, ly + o0y, s0);
        const qy = simplex2(lx + 5.2 + o1x, ly + 1.3 + o1y, s1);
        const wx = lx + w * qx;
        const wy = ly + w * qy;
        const rx = simplex2(wx + 1.7 + o2x, wy + 9.2 + o2y, s2);
        const ry = simplex2(wx + 8.3 + o3x, wy + 2.8 + o3y, s3);
        return fbm(lx + w * rx, ly + w * ry, s4);
      }
      case 1: {
        const b = simplex2(px * 0.45 + o0x, py * 0.45 + o0y, s0);
        const c = simplex2(px * 0.9 + o1x, py * 0.9 + o1y, s1);
        return Math.sin((px + 0.35 * py) * 4 + w * 2.2 * b + 0.5 * c);
      }
      case 2: {
        const sx = px * 0.18;
        const sy = py * 1.6;
        const q = fbm(sx + o0x, sy + o0y, s0);
        return fbm(sx + w * q + o1x, sy + w * 0.5 * q + o1y, s1);
      }
      case 3: {
        const qx = simplex2(px * 0.4 + o0x, py * 0.4 + o0y, s0);
        const qy = simplex2(px * 0.4 + 3.1 + o1x, py * 0.4 + 7.7 + o1y, s1);
        return simplex2(px * 0.6 + 0.5 * w * qx + o2x, py * 0.6 + 0.5 * w * qy + o2y, s2);
      }
      case 4: {
        const t = fbm(px * 0.6 + o0x, py * 0.6 + o0y, s0);
        return Math.sin(px * 6 + py * 2 + w * 2.5 * t);
      }
      case 5: {
        const qx = simplex2(px * 0.5 + o0x, py * 0.5 + o0y, s0);
        const qy = simplex2(px * 0.5 + 4 + o1x, py * 0.5 + 1 + o1y, s1);
        return Math.sin(Math.hypot(px + 0.4 * w * qx, py + 0.4 * w * qy) * 10);
      }
      default: {
        const x = px + w * 0.6 * fbm(px * 0.7 + o0x, py * 0.2 + o0y, s0);
        return fbm(x * 1.5 + o1x, py * 0.25 + o1y, s1);
      }
    }
  };

  const data = new Uint8ClampedArray(tile.width * tile.height * 4);
  const color = new Float64Array(3);
  const minEdge = Math.min(design.width, design.height);
  const steps = levels - 1;
  for (let row = 0; row < tile.height; row++) {
    const pyOut = tile.y + row + 0.5;
    const uvy = pyOut / out.height;
    const dy = uvy * design.height;
    const cy = (dy - 0.5 * design.height) / minEdge;
    for (let col = 0; col < tile.width; col++) {
      const pxOut = tile.x + col + 0.5;
      const uvx = pxOut / out.width;
      const dx = uvx * design.width;
      const cx = (dx - 0.5 * design.width) / minEdge;
      const p0 = ba * cx + bb * cy;
      const p1 = bc * cx + bd * cy;

      let v = Math.min(1, Math.max(0, 0.5 + 0.5 * amplitude * field(p0, p1)));
      if (bayerSize > 0) {
        const cellX = Math.floor(dx / ditherScale + CELL_EPSILON);
        const cellY = Math.floor(dy / ditherScale + CELL_EPSILON);
        const idx = (cellY % bayerSize) * bayerSize + (cellX % bayerSize);
        v = Math.min(1, Math.max(0, Math.floor(v * steps + (bayer[idx] ?? 0)) / steps));
      }
      rampColor(palette, v, color);
      let r = color[0] ?? 0;
      let g = color[1] ?? 0;
      let b = color[2] ?? 0;
      if (grain > 0) {
        const h =
          (hash3(Math.floor(dx + CELL_EPSILON), Math.floor(dy + CELL_EPSILON), grainSalt) >>> 8) /
          16777216;
        const n = (h - 0.5) * 0.25 * grain;
        r += n;
        g += n;
        b += n;
      }
      if (vignette > 0) {
        const qx = (uvx - 0.5) * 2;
        const qy = (uvy - 0.5) * 2;
        const k =
          1 - 0.85 * vignette * smoothstep(0.3, 1, Math.sqrt(qx * qx + qy * qy) * 0.70710678);
        r *= k;
        g *= k;
        b *= k;
      }
      const o = (row * tile.width + col) * 4;
      data[o] = toByte(r);
      data[o + 1] = toByte(g);
      data[o + 2] = toByte(b);
      data[o + 3] = 255;
    }
  }
  return { width: tile.width, height: tile.height, data };
}
