/**
 * Fragment shader of liquid chrome. CPU twin: `cpu.ts` (change both).
 */
import { GLSL_NOISE, GLSL_PRELUDE } from "../glsl/common";

export const LIQUID_CHROME_FRAGMENT = /* glsl */ `${GLSL_PRELUDE}
${GLSL_NOISE}
uniform vec4 u_basis;
uniform float u_warp;
uniform int u_detail;
uniform float u_relief;
uniform float u_bands;
uniform vec2 u_light;
uniform float u_specular;
uniform float u_iridescence;
uniform vec2 u_off[3];
uniform float u_grain;
uniform float u_vignette;
uniform vec3 u_highlight;
uniform uint u_salts[3];
uniform uint u_grainSalt;

const float CELL_EPSILON = 0.001;
const float EPS = 0.01;
const float PI = 3.14159265359;

float height(vec2 p) {
  vec2 q = vec2(musterliFbm(p + u_off[0], u_salts[0], 3),
                musterliFbm(p + vec2(5.2, 1.3) + u_off[1], u_salts[1], 3));
  return musterliFbm(p + u_warp * q + u_off[2], u_salts[2], u_detail);
}

void main() {
  vec2 px = musterliPixel();
  vec2 uv = px / u_resolution;
  vec2 d = uv * u_design;
  vec2 c = (d - 0.5 * u_design) / min(u_design.x, u_design.y);
  vec2 p = vec2(u_basis.x * c.x + u_basis.y * c.y, u_basis.z * c.x + u_basis.w * c.y);

  float gx = (height(p + vec2(EPS, 0.0)) - height(p - vec2(EPS, 0.0))) / (2.0 * EPS);
  float gy = (height(p + vec2(0.0, EPS)) - height(p - vec2(0.0, EPS))) / (2.0 * EPS);
  vec3 n = normalize(vec3(-gx * u_relief, -gy * u_relief, 1.0));
  // Reflection of a view straight down the z axis.
  vec3 r = vec3(2.0 * n.z * n.x, 2.0 * n.z * n.y, 2.0 * n.z * n.z - 1.0);
  float e = 0.5 + 0.5 * (r.x * u_light.x + r.y * u_light.y);
  float v = 0.5 - 0.5 * cos(e * PI * u_bands);
  vec3 color = musterliRamp(v);

  if (u_iridescence > 0.0) {
    vec3 rainbow = 0.5 + 0.5 * cos(6.28318530718 * (2.0 * e + vec3(0.0, 0.33, 0.67)));
    color = mix(color, rainbow * (0.35 + 0.65 * v), u_iridescence * 0.45);
  }

  vec3 l = normalize(vec3(u_light, 1.4));
  float spec = pow(max(dot(n, l), 0.0), 48.0) * u_specular;
  color = mix(color, u_highlight, clamp(spec, 0.0, 1.0));

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
