/**
 * Fragment shader of light beams. CPU twin: `cpu.ts` (change both).
 */
import { GLSL_NOISE, GLSL_PRELUDE } from "../glsl/common";

export const LIGHT_BEAMS_FRAGMENT = /* glsl */ `${GLSL_PRELUDE}
${GLSL_NOISE}
uniform vec2 u_source;
uniform vec2 u_coneDir;
uniform float u_coneCos;
uniform float u_density;
uniform float u_sharpness;
uniform float u_decay;
uniform float u_intensity;
uniform float u_haze;
uniform vec2 u_off[3];
uniform float u_grain;
uniform float u_vignette;
uniform uint u_salts[3];
uniform uint u_grainSalt;

const float CELL_EPSILON = 0.001;

void main() {
  vec2 px = musterliPixel();
  vec2 uv = px / u_resolution;
  vec2 d = uv * u_design;
  vec2 c = (d - 0.5 * u_design) / min(u_design.x, u_design.y);

  vec2 v = c - u_source;
  float dist = max(length(v), 1e-4);
  vec2 dir = v / dist;
  float n = musterliFbm(dir * u_density + u_off[0], u_salts[0], 3);
  float m = musterliSimplex(dir * u_density * 2.3 + u_off[1], u_salts[1]);
  float ray = pow(clamp(0.5 + 0.9 * n + 0.3 * m, 0.0, 1.0), u_sharpness);
  float cone = smoothstep(u_coneCos - 0.12, u_coneCos + 0.08, dot(dir, u_coneDir));
  float fall = exp(-dist * u_decay);
  float haze = (0.5 + 0.5 * musterliFbm(c * 1.5 + u_off[2], u_salts[2], 4)) * u_haze;

  float value = clamp((ray * cone * u_intensity + 0.35 * haze) * fall, 0.0, 1.0);
  vec3 color = musterliRamp(value);

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
