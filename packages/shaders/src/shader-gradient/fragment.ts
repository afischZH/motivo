/**
 * Fragment shader of the shader gradient (docs/TOOLS.md C4). The CPU twin
 * is `cpu.ts`: change both together (the unit tests and the end-to-end
 * comparison of the static motif with the preview catch drift).
 */
import { GLSL_NOISE, GLSL_PRELUDE } from "../glsl/common";

export const SHADER_GRADIENT_FRAGMENT = /* glsl */ `${GLSL_PRELUDE}
${GLSL_NOISE}
uniform int u_style;
uniform int u_detail;
uniform vec4 u_basis;
uniform vec2 u_off[4];
uniform float u_warp;
uniform float u_amplitude;
uniform float u_bayer[64];
uniform int u_bayerSize;
uniform int u_levels;
uniform float u_ditherScale;
uniform float u_grain;
uniform float u_vignette;
uniform uint u_salts[5];
uniform uint u_grainSalt;

// Pixel centres of a downscaled render can land exactly on a cell edge;
// float32 and float64 would then round to different cells.
const float CELL_EPSILON = 0.001;

float fbmS(vec2 p, int k) { return musterliFbm(p, u_salts[k], u_detail); }
float noiseS(vec2 p, int k) { return musterliSimplex(p, u_salts[k]); }

float field(vec2 p) {
  float w = u_warp;
  if (u_style == 0) {
    // liquid: two stages of domain warping, a fractal sum on top
    vec2 l = p * 0.5;
    vec2 q = vec2(noiseS(l + u_off[0], 0), noiseS(l + vec2(5.2, 1.3) + u_off[1], 1));
    vec2 r = vec2(noiseS(l + w * q + vec2(1.7, 9.2) + u_off[2], 2),
                  noiseS(l + w * q + vec2(8.3, 2.8) + u_off[3], 3));
    return fbmS(l + w * r, 4);
  }
  if (u_style == 1) {
    // silk: sine folds bent by slow noise
    float b = noiseS(p * 0.45 + u_off[0], 0);
    float c = noiseS(p * 0.9 + u_off[1], 1);
    return sin((p.x + 0.35 * p.y) * 4.0 + w * 2.2 * b + 0.5 * c);
  }
  if (u_style == 2) {
    // streaked: noise stretched along x
    vec2 s = vec2(p.x * 0.18, p.y * 1.6);
    float q = fbmS(s + u_off[0], 0);
    return fbmS(s + w * vec2(q, 0.5 * q) + u_off[1], 1);
  }
  if (u_style == 3) {
    // grainy: large soft blobs, one octave
    vec2 q = vec2(noiseS(p * 0.4 + u_off[0], 0), noiseS(p * 0.4 + vec2(3.1, 7.7) + u_off[1], 1));
    return noiseS(p * 0.6 + 0.5 * w * q + u_off[2], 2);
  }
  if (u_style == 4) {
    // marble: veins with fbm turbulence
    float t = fbmS(p * 0.6 + u_off[0], 0);
    return sin(p.x * 6.0 + p.y * 2.0 + w * 2.5 * t);
  }
  if (u_style == 5) {
    // ripple: rings around the centre, bent
    vec2 q = vec2(noiseS(p * 0.5 + u_off[0], 0), noiseS(p * 0.5 + vec2(4.0, 1.0) + u_off[1], 1));
    return sin(length(p + 0.4 * w * q) * 10.0);
  }
  // aurora: vertical curtains swaying sideways
  float x = p.x + w * 0.6 * fbmS(vec2(p.x * 0.7, p.y * 0.2) + u_off[0], 0);
  return fbmS(vec2(x * 1.5, p.y * 0.25) + u_off[1], 1);
}

void main() {
  vec2 px = musterliPixel();
  vec2 uv = px / u_resolution;
  vec2 d = uv * u_design;
  vec2 c = (d - 0.5 * u_design) / min(u_design.x, u_design.y);
  vec2 p = vec2(u_basis.x * c.x + u_basis.y * c.y, u_basis.z * c.x + u_basis.w * c.y);

  float v = clamp(0.5 + 0.5 * u_amplitude * field(p), 0.0, 1.0);

  if (u_bayerSize > 0) {
    ivec2 cell = ivec2(floor(d / u_ditherScale + CELL_EPSILON));
    int idx = (cell.y % u_bayerSize) * u_bayerSize + (cell.x % u_bayerSize);
    float steps = float(u_levels - 1);
    v = clamp(floor(v * steps + u_bayer[idx]) / steps, 0.0, 1.0);
  }

  vec3 color = musterliRamp(v);

  if (u_grain > 0.0) {
    uvec2 g = uvec2(floor(d + CELL_EPSILON));
    float h = float(musterliHash3(g.x, g.y, u_grainSalt) >> 8u) / 16777216.0;
    color += (h - 0.5) * 0.25 * u_grain;
  }

  if (u_vignette > 0.0) {
    vec2 q = (uv - 0.5) * 2.0;
    float r = length(q) * 0.70710678;
    color *= 1.0 - 0.85 * u_vignette * smoothstep(0.3, 1.0, r);
  }

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
