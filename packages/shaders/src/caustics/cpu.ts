/**
 * CPU twin of `CAUSTICS_FRAGMENT` in float64 (static motifs, unit tests).
 */
import type { PixelBuffer } from "@musterli/effects";
import { clamp, list, num, renderCpuTile, smoothstep } from "../cpu-common";
import type { ShaderFrameInput } from "../frame";
import { fbm2, hash3, hash32 } from "../noise";
import { rampColor } from "../palette";

const CELL_EPSILON = 0.001;
const TAU = 6.28318530718;
const LATTICE_OFFSET = 32768;

const unit = (h: number): number => (h >>> 8) / 16777216;

export function renderCausticsCpu(input: ShaderFrameInput): PixelBuffer {
  const u = input.uniforms;
  const palette = input.palette;
  if (!palette) throw new TypeError("caustics needs a palette texture");
  const style = num(u, "u_style");
  const [ba = 0, bb = 0, bc = 0, bd = 0] = list(u, "u_basis", 4);
  const scale = num(u, "u_scale");
  const jitter = num(u, "u_jitter");
  const warp = num(u, "u_warp");
  const edge = num(u, "u_edge");
  const contrast = num(u, "u_contrast");
  const theta = num(u, "u_theta");
  const [o0x = 0, o0y = 0, o1x = 0, o1y = 0] = list(u, "u_off", 4);
  const grain = num(u, "u_grain");
  const vignette = num(u, "u_vignette");
  const [s0 = 0, s1 = 0, s2 = 0] = list(u, "u_salts", 3);
  const grainSalt = num(u, "u_grainSalt");
  const { design, out } = input;
  const minEdge = Math.min(design.width, design.height);
  const aa = ((design.width / out.width) * scale) / minEdge;
  const ramp = new Float64Array(3);
  const res = new Float64Array(3);

  const voronoi = (px: number, py: number, salt: number): Float64Array => {
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    let f1 = 8;
    let f2 = 8;
    let id = 0;
    for (let y = -1; y <= 1; y++) {
      for (let x = -1; x <= 1; x++) {
        const h0 = hash3(ix + x + LATTICE_OFFSET, iy + y + LATTICE_OFFSET, salt);
        const h1 = hash32(h0);
        const h2 = hash32(h1);
        const h3 = hash32(h2);
        const a = theta + TAU * unit(h3);
        const ox = (unit(h0) - 0.5) * 0.7 * jitter + 0.25 * jitter * Math.cos(a);
        const oy = (unit(h1) - 0.5) * 0.7 * jitter + 0.25 * jitter * Math.sin(a);
        const dist = Math.hypot(x + 0.5 + ox - fx, y + 0.5 + oy - fy);
        if (dist < f1) {
          f2 = f1;
          f1 = dist;
          id = unit(h2);
        } else if (dist < f2) {
          f2 = dist;
        }
      }
    }
    res[0] = f1;
    res[1] = f2;
    res[2] = id;
    return res;
  };

  return renderCpuTile(input, (px, outColor) => {
    let p0 = ba * px.cx + bb * px.cy;
    let p1 = bc * px.cx + bd * px.cy;
    if (warp > 0) {
      const wx = fbm2(p0 * 0.25 + o0x, p1 * 0.25 + o0y, s1, 3);
      const wy = fbm2(p0 * 0.25 + 3.1 + o1x, p1 * 0.25 + 7.7 + o1y, s1, 3);
      p0 += warp * 0.6 * wx;
      p1 += warp * 0.6 * wy;
    }
    const [f1 = 0, f2 = 0, id = 0] = voronoi(p0, p1, s0);
    const seam = f2 - f1;
    let v: number;
    if (style === 0) {
      const width = 0.04 + 0.5 * edge;
      const c1 = 1 - smoothstep(0, width + aa, seam);
      const [g1 = 0, g2 = 0] = voronoi(p0 * 1.7 + 13.1, p1 * 1.7 + 5.3, s2);
      const c2 = 1 - smoothstep(0, width * 1.4 + aa, g2 - g1);
      v = clamp(0.15 + 0.85 * (c1 * c1 + 0.55 * c2 * c2), 0, 1);
    } else if (style === 1) {
      const shade = 0.3 + 0.55 * id + 0.15 * (1 - f1);
      v = shade * smoothstep(0, 0.02 + 0.25 * edge + aa, seam);
    } else {
      const facet = 0.15 + 0.6 * id + 0.25 * (1 - f1);
      v = Math.max(facet, 1 - smoothstep(0, 0.01 + 0.12 * edge + aa, seam));
    }
    v = clamp(0.5 + (v - 0.5) * contrast, 0, 1);
    rampColor(palette, v, ramp);
    let r = ramp[0] ?? 0;
    let g = ramp[1] ?? 0;
    let b = ramp[2] ?? 0;
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
    outColor[0] = r;
    outColor[1] = g;
    outColor[2] = b;
  });
}
