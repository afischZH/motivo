/**
 * CPU twin of `LIQUID_CHROME_FRAGMENT` in float64 (static motifs, unit tests).
 */
import type { PixelBuffer } from "@musterli/effects";
import { clamp, list, mix, num, renderCpuTile, smoothstep } from "../cpu-common";
import type { ShaderFrameInput } from "../frame";
import { fbm2, hash3 } from "../noise";
import { rampColor } from "../palette";

const CELL_EPSILON = 0.001;
const EPS = 0.01;
const TAU = 6.28318530718;

export function renderLiquidChromeCpu(input: ShaderFrameInput): PixelBuffer {
  const u = input.uniforms;
  const palette = input.palette;
  if (!palette) throw new TypeError("liquid chrome needs a palette texture");
  const [ba = 0, bb = 0, bc = 0, bd = 0] = list(u, "u_basis", 4);
  const warp = num(u, "u_warp");
  const detail = num(u, "u_detail");
  const relief = num(u, "u_relief");
  const bands = num(u, "u_bands");
  const [lx = 1, ly = 0] = list(u, "u_light", 2);
  const specular = num(u, "u_specular");
  const iris = num(u, "u_iridescence");
  const [o0x = 0, o0y = 0, o1x = 0, o1y = 0, o2x = 0, o2y = 0] = list(u, "u_off", 6);
  const grain = num(u, "u_grain");
  const vignette = num(u, "u_vignette");
  const [hr = 1, hg = 1, hb = 1] = list(u, "u_highlight", 3);
  const [s0 = 0, s1 = 0, s2 = 0] = list(u, "u_salts", 3);
  const grainSalt = num(u, "u_grainSalt");
  const ll = Math.hypot(lx, ly, 1.4);
  const lnx = lx / ll;
  const lny = ly / ll;
  const lnz = 1.4 / ll;
  const ramp = new Float64Array(3);

  const height = (x: number, y: number): number => {
    const qx = fbm2(x + o0x, y + o0y, s0, 3);
    const qy = fbm2(x + 5.2 + o1x, y + 1.3 + o1y, s1, 3);
    return fbm2(x + warp * qx + o2x, y + warp * qy + o2y, s2, detail);
  };

  return renderCpuTile(input, (px, out) => {
    const p0 = ba * px.cx + bb * px.cy;
    const p1 = bc * px.cx + bd * px.cy;
    const gx = (height(p0 + EPS, p1) - height(p0 - EPS, p1)) / (2 * EPS);
    const gy = (height(p0, p1 + EPS) - height(p0, p1 - EPS)) / (2 * EPS);
    const nl = Math.hypot(gx * relief, gy * relief, 1);
    const nx = (-gx * relief) / nl;
    const ny = (-gy * relief) / nl;
    const nz = 1 / nl;
    const rx = 2 * nz * nx;
    const ry = 2 * nz * ny;
    const e = 0.5 + 0.5 * (rx * lx + ry * ly);
    const v = 0.5 - 0.5 * Math.cos(e * Math.PI * bands);
    rampColor(palette, v, ramp);
    let r = ramp[0] ?? 0;
    let g = ramp[1] ?? 0;
    let b = ramp[2] ?? 0;
    if (iris > 0) {
      const k = 0.35 + 0.65 * v;
      const w = iris * 0.45;
      r = mix(r, (0.5 + 0.5 * Math.cos(TAU * (2 * e))) * k, w);
      g = mix(g, (0.5 + 0.5 * Math.cos(TAU * (2 * e + 0.33))) * k, w);
      b = mix(b, (0.5 + 0.5 * Math.cos(TAU * (2 * e + 0.67))) * k, w);
    }
    const spec = clamp(Math.pow(Math.max(nx * lnx + ny * lny + nz * lnz, 0), 48) * specular, 0, 1);
    r = mix(r, hr, spec);
    g = mix(g, hg, spec);
    b = mix(b, hb, spec);
    if (grain > 0) {
      const h =
        (hash3(Math.floor(px.dx + CELL_EPSILON), Math.floor(px.dy + CELL_EPSILON), grainSalt) >>>
          8) /
        16777216;
      const n = (h - 0.5) * 0.25 * grain;
      r += n;
      g += n;
      b += n;
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
