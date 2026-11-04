/**
 * CPU twin of `LIGHT_BEAMS_FRAGMENT` in float64 (static motifs, unit tests).
 */
import type { PixelBuffer } from "@musterli/effects";
import { clamp, list, num, renderCpuTile, smoothstep } from "../cpu-common";
import type { ShaderFrameInput } from "../frame";
import { fbm2, hash3, simplex2 } from "../noise";
import { rampColor } from "../palette";

const CELL_EPSILON = 0.001;

export function renderLightBeamsCpu(input: ShaderFrameInput): PixelBuffer {
  const u = input.uniforms;
  const palette = input.palette;
  if (!palette) throw new TypeError("light beams needs a palette texture");
  const [sx = 0, sy = 0] = list(u, "u_source", 2);
  const [cdx = 0, cdy = 1] = list(u, "u_coneDir", 2);
  const coneCos = num(u, "u_coneCos");
  const density = num(u, "u_density");
  const sharpness = num(u, "u_sharpness");
  const decay = num(u, "u_decay");
  const intensity = num(u, "u_intensity");
  const hazeAmount = num(u, "u_haze");
  const [o0x = 0, o0y = 0, o1x = 0, o1y = 0, o2x = 0, o2y = 0] = list(u, "u_off", 6);
  const grain = num(u, "u_grain");
  const vignette = num(u, "u_vignette");
  const [s0 = 0, s1 = 0, s2 = 0] = list(u, "u_salts", 3);
  const grainSalt = num(u, "u_grainSalt");
  const ramp = new Float64Array(3);

  return renderCpuTile(input, (px, out) => {
    const vx = px.cx - sx;
    const vy = px.cy - sy;
    const dist = Math.max(Math.hypot(vx, vy), 1e-4);
    const dx = vx / dist;
    const dy = vy / dist;
    const n = fbm2(dx * density + o0x, dy * density + o0y, s0, 3);
    const m = simplex2(dx * density * 2.3 + o1x, dy * density * 2.3 + o1y, s1);
    const ray = Math.pow(clamp(0.5 + 0.9 * n + 0.3 * m, 0, 1), sharpness);
    const cone = smoothstep(coneCos - 0.12, coneCos + 0.08, dx * cdx + dy * cdy);
    const fall = Math.exp(-dist * decay);
    const haze = (0.5 + 0.5 * fbm2(px.cx * 1.5 + o2x, px.cy * 1.5 + o2y, s2, 4)) * hazeAmount;
    const value = clamp((ray * cone * intensity + 0.35 * haze) * fall, 0, 1);
    rampColor(palette, value, ramp);
    let r = ramp[0] ?? 0;
    let g = ramp[1] ?? 0;
    let b = ramp[2] ?? 0;
    if (grain > 0) {
      const h =
        (hash3(Math.floor(px.dx + CELL_EPSILON), Math.floor(px.dy + CELL_EPSILON), grainSalt) >>>
          8) /
        16777216;
      const k = (h - 0.5) * 0.25 * grain;
      r += k;
      g += k;
      b += k;
    }
    if (vignette > 0) {
      const qx = (px.uvx - 0.5) * 2;
      const qy = (px.uvy - 0.5) * 2;
      const k = 1 - 0.85 * vignette * smoothstep(0.3, 1, Math.hypot(qx, qy) * 0.70710678);
      r *= k;
      g *= k;
      b *= k;
    }
    out[0] = r;
    out[1] = g;
    out[2] = b;
  });
}
