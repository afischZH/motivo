/**
 * CPU twin of `DOT_WAVE_FRAGMENT` in float64 (static motifs, unit tests).
 */
import type { PixelBuffer } from "@musterli/effects";
import { clamp, list, mix, num, renderCpuTile, smoothstep } from "../cpu-common";
import type { ShaderFrameInput } from "../frame";
import { fbm2, hash3, simplex2 } from "../noise";
import { rampColor } from "../palette";

const CELL_EPSILON = 0.001;
const TAU = 6.28318530718;

export function renderDotWaveCpu(input: ShaderFrameInput): PixelBuffer {
  const u = input.uniforms;
  const palette = input.palette;
  if (!palette) throw new TypeError("dot wave needs a palette texture");
  const fieldKind = num(u, "u_field");
  const shape = num(u, "u_shape");
  const s = num(u, "u_spacing");
  const [sizeLo = 0, sizeHi = 0] = list(u, "u_size", 2);
  const k = num(u, "u_frequency");
  const [dirX = 1, dirY = 0] = list(u, "u_dir", 2);
  const warp = num(u, "u_warp");
  const fadeAmount = num(u, "u_fade");
  const wavePhase = num(u, "u_wavePhase");
  const [o0x = 0, o0y = 0, o1x = 0, o1y = 0] = list(u, "u_off", 4);
  const [bgR = 0, bgG = 0, bgB = 0] = list(u, "u_background", 3);
  const [s0 = 0, s1 = 0] = list(u, "u_salts", 2);
  const grain = num(u, "u_grain");
  const vignette = num(u, "u_vignette");
  const grainSalt = num(u, "u_grainSalt");
  const { design } = input;
  const minEdge = Math.min(design.width, design.height);
  const ramp = new Float64Array(3);

  const field = (cx: number, cy: number): number => {
    if (fieldKind === 0) {
      const n = fbm2(cx * k * 0.5 + o0x, cy * k * 0.5 + o0y, s0, 3);
      const m = simplex2(cx * k + o1x, cy * k + o1y, s1);
      return clamp(0.5 + 0.8 * n + 0.25 * m, 0, 1);
    }
    const bend = warp * simplex2(cx * k * 0.4 + o0x, cy * k * 0.4 + o0y, s0);
    const x = fieldKind === 1 ? (cx * dirX + cy * dirY) * k : Math.hypot(cx, cy) * k;
    return 0.5 + 0.5 * Math.sin(TAU * x + bend - wavePhase);
  };

  const mark = (qx: number, qy: number, r: number): number => {
    if (shape === 0) return Math.hypot(qx, qy) - r;
    if (shape === 1) return Math.max(Math.abs(qx), Math.abs(qy)) - r * 0.886;
    if (shape === 2) {
      const ax = qx * dirX + qy * dirY;
      const ay = qx * -dirY + qy * dirX;
      const t = s * 0.11;
      const bx = Math.max(Math.abs(ax) - Math.max(r - t, 0), 0);
      const by = Math.max(Math.abs(ay), 0);
      return Math.hypot(bx, by) - t;
    }
    if (shape === 3) {
      const t = s * 0.09;
      const ax = Math.abs(qx);
      const ay = Math.abs(qy);
      return Math.min(Math.max(ax - r, ay - t), Math.max(ay - r, ax - t));
    }
    return Math.abs(Math.hypot(qx, qy) - r) - s * 0.07;
  };

  return renderCpuTile(input, (px, out) => {
    const cellX = Math.floor((px.dx - 0.5 * design.width) / s + 0.5);
    const cellY = Math.floor((px.dy - 0.5 * design.height) / s + 0.5);
    const centreX = cellX * s + 0.5 * design.width;
    const centreY = cellY * s + 0.5 * design.height;
    const v = field(
      (centreX - 0.5 * design.width) / minEdge,
      (centreY - 0.5 * design.height) / minEdge,
    );
    const ex = (centreX / design.width - 0.5) * 2;
    const ey = (centreY / design.height - 0.5) * 2;
    const fade = 1 - fadeAmount * smoothstep(0.25, 1, Math.hypot(ex, ey) * 0.70710678);
    const r = 0.5 * s * mix(sizeLo, sizeHi, v) * fade;
    const cover = r > 0 ? clamp(0.5 - mark(px.dx - centreX, px.dy - centreY, r) / px.aa, 0, 1) : 0;
    rampColor(palette, v, ramp);
    let r0 = mix(bgR, ramp[0] ?? 0, cover);
    let g0 = mix(bgG, ramp[1] ?? 0, cover);
    let b0 = mix(bgB, ramp[2] ?? 0, cover);
    if (grain > 0) {
      const h =
        (hash3(Math.floor(px.dx + CELL_EPSILON), Math.floor(px.dy + CELL_EPSILON), grainSalt) >>>
          8) /
        16777216;
      const n = (h - 0.5) * 0.25 * grain;
      r0 += n;
      g0 += n;
      b0 += n;
    }
    if (vignette > 0) {
      const qx = (px.uvx - 0.5) * 2;
      const qy = (px.uvy - 0.5) * 2;
      const kv = 1 - 0.85 * vignette * smoothstep(0.3, 1, Math.hypot(qx, qy) * 0.70710678);
      r0 *= kv;
      g0 *= kv;
      b0 *= kv;
    }
    out[0] = r0;
    out[1] = g0;
    out[2] = b0;
  });
}
