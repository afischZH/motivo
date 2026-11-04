/**
 * Fragment shader of the dot wave grid. CPU twin: `cpu.ts` (change both).
 */
import { GLSL_NOISE, GLSL_PRELUDE } from "../glsl/common";

export const DOT_WAVE_FRAGMENT = /* glsl */ `${GLSL_PRELUDE}
${GLSL_NOISE}
uniform int u_field;
uniform int u_shape;
uniform float u_spacing;
uniform vec2 u_size;
uniform float u_frequency;
uniform vec2 u_dir;
uniform float u_warp;
uniform float u_fade;
uniform float u_wavePhase;
uniform vec2 u_off[2];
uniform vec3 u_background;
uniform uint u_salts[2];
uniform float u_grain;
uniform float u_vignette;
uniform uint u_grainSalt;

const float TAU = 6.28318530718;
const float CELL_EPSILON = 0.001;

// Field value in [0, 1] at a cell centre c (centred units).
float field(vec2 c) {
  float k = u_frequency;
  if (u_field == 0) {
    float n = musterliFbm(c * k * 0.5 + u_off[0], u_salts[0], 3);
    float m = musterliSimplex(c * k + u_off[1], u_salts[1]);
    return clamp(0.5 + 0.8 * n + 0.25 * m, 0.0, 1.0);
  }
  float bend = u_warp * musterliSimplex(c * k * 0.4 + u_off[0], u_salts[0]);
  float x = u_field == 1 ? dot(c, u_dir) * k : length(c) * k;
  return 0.5 + 0.5 * sin(TAU * x + bend - u_wavePhase);
}

// Signed distance (design px) of the mark of radius r at q.
float mark(vec2 q, float r) {
  float s = u_spacing;
  if (u_shape == 0) return length(q) - r;
  if (u_shape == 1) {
    vec2 a = abs(q);
    return max(a.x, a.y) - r * 0.886;
  }
  if (u_shape == 2) {
    vec2 a = vec2(dot(q, u_dir), dot(q, vec2(-u_dir.y, u_dir.x)));
    float t = s * 0.11;
    vec2 b = abs(a) - vec2(max(r - t, 0.0), 0.0);
    return length(max(b, 0.0)) - t;
  }
  if (u_shape == 3) {
    float t = s * 0.09;
    vec2 a = abs(q);
    float h = max(a.x - r, a.y - t);
    float v = max(a.y - r, a.x - t);
    return min(h, v);
  }
  return abs(length(q) - r) - s * 0.07;
}

void main() {
  vec2 px = musterliPixel();
  vec2 uv = px / u_resolution;
  vec2 d = uv * u_design;
  float minEdge = min(u_design.x, u_design.y);
  float aa = u_design.x / u_resolution.x;

  vec2 g = (d - 0.5 * u_design) / u_spacing + 0.5;
  vec2 cell = floor(g);
  vec2 centre = cell * u_spacing + 0.5 * u_design;
  vec2 c = (centre - 0.5 * u_design) / minEdge;
  float v = field(c);

  float edge = length((centre / u_design - 0.5) * 2.0) * 0.70710678;
  float fade = 1.0 - u_fade * smoothstep(0.25, 1.0, edge);
  float r = 0.5 * u_spacing * mix(u_size.x, u_size.y, v) * fade;

  float cover = r > 0.0 ? clamp(0.5 - mark(d - centre, r) / aa, 0.0, 1.0) : 0.0;
  vec3 color = mix(u_background, musterliRamp(v), cover);

  if (u_grain > 0.0) {
    uvec2 gp = uvec2(floor(d + CELL_EPSILON));
    float h = float(musterliHash3(gp.x, gp.y, u_grainSalt) >> 8u) / 16777216.0;
    color += (h - 0.5) * 0.25 * u_grain;
  }
  if (u_vignette > 0.0) {
    vec2 q = (uv - 0.5) * 2.0;
    color *= 1.0 - 0.85 * u_vignette * smoothstep(0.3, 1.0, length(q) * 0.70710678);
  }
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
