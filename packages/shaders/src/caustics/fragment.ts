/**
 * Fragment shader of caustics and cells. CPU twin: `cpu.ts` (change both).
 */
import { GLSL_NOISE, GLSL_PRELUDE } from "../glsl/common";

export const CAUSTICS_FRAGMENT = /* glsl */ `${GLSL_PRELUDE}
${GLSL_NOISE}
uniform int u_style;
uniform vec4 u_basis;
uniform float u_scale;
uniform float u_jitter;
uniform float u_warp;
uniform float u_edge;
uniform float u_contrast;
uniform float u_theta;
uniform vec2 u_off[2];
uniform float u_grain;
uniform float u_vignette;
uniform uint u_salts[3];
uniform uint u_grainSalt;

const float CELL_EPSILON = 0.001;
const float TAU = 6.28318530718;

float unit(uint h) { return float(h >> 8u) / 16777216.0; }

// Nearest distance, second nearest distance and the nearest cell's hash.
vec3 voronoi(vec2 p, uint salt) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      ivec2 cell = ivec2(i + g) + 32768;
      uint h0 = musterliHash3(uint(cell.x), uint(cell.y), salt);
      uint h1 = musterliHash(h0);
      uint h2 = musterliHash(h1);
      uint h3 = musterliHash(h2);
      float a = u_theta + TAU * unit(h3);
      vec2 o = (vec2(unit(h0), unit(h1)) - 0.5) * 0.7 * u_jitter
             + 0.25 * u_jitter * vec2(cos(a), sin(a));
      vec2 r = g + 0.5 + o - f;
      float dist = length(r);
      if (dist < f1) {
        f2 = f1;
        f1 = dist;
        id = unit(h2);
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }
  return vec3(f1, f2, id);
}

void main() {
  vec2 px = musterliPixel();
  vec2 uv = px / u_resolution;
  vec2 d = uv * u_design;
  float minEdge = min(u_design.x, u_design.y);
  vec2 c = (d - 0.5 * u_design) / minEdge;
  vec2 p = vec2(u_basis.x * c.x + u_basis.y * c.y, u_basis.z * c.x + u_basis.w * c.y);
  // Width of one output pixel in cell units, for smooth seams.
  float aa = u_design.x / u_resolution.x * u_scale / minEdge;

  if (u_warp > 0.0) {
    vec2 w = vec2(musterliFbm(p * 0.25 + u_off[0], u_salts[1], 3),
                  musterliFbm(p * 0.25 + vec2(3.1, 7.7) + u_off[1], u_salts[1], 3));
    p += u_warp * 0.6 * w;
  }

  vec3 v1 = voronoi(p, u_salts[0]);
  float seam = v1.y - v1.x;
  float v;
  if (u_style == 0) {
    float width = 0.04 + 0.5 * u_edge;
    vec3 v2 = voronoi(p * 1.7 + vec2(13.1, 5.3), u_salts[2]);
    float c1 = 1.0 - smoothstep(0.0, width + aa, seam);
    float c2 = 1.0 - smoothstep(0.0, width * 1.4 + aa, v2.y - v2.x);
    v = clamp(0.15 + 0.85 * (c1 * c1 + 0.55 * c2 * c2), 0.0, 1.0);
  } else if (u_style == 1) {
    float shade = 0.3 + 0.55 * v1.z + 0.15 * (1.0 - v1.x);
    v = shade * smoothstep(0.0, 0.02 + 0.25 * u_edge + aa, seam);
  } else {
    float facet = 0.15 + 0.6 * v1.z + 0.25 * (1.0 - v1.x);
    v = max(facet, 1.0 - smoothstep(0.0, 0.01 + 0.12 * u_edge + aa, seam));
  }
  v = clamp(0.5 + (v - 0.5) * u_contrast, 0.0, 1.0);
  vec3 color = musterliRamp(v);

  if (u_grain > 0.0) {
    uvec2 g = uvec2(floor(d + CELL_EPSILON));
    float h = float(musterliHash3(g.x, g.y, u_grainSalt) >> 8u) / 16777216.0;
    color += (h - 0.5) * 0.25 * u_grain;
  }
  if (u_vignette > 0.0) {
    vec2 q = (uv - 0.5) * 2.0;
    color *= 1.0 - 0.85 * u_vignette * smoothstep(0.3, 1.0, length(q) * 0.70710678);
  }
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
