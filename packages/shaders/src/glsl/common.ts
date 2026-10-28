/**
 * GLSL building blocks, kept as TypeScript strings (no loader, works in
 * Node, workers and every bundler). Each has a CPU twin in `../noise.ts`;
 * keep both in step.
 *
 * Hot reload: the editor renders in a worker, which Next/webpack does not
 * hot-replace, so a GLSL change shows after a page reload in `next dev`.
 */

/** Version, precision and the standard inputs every Musterli shader gets. */
export const GLSL_PRELUDE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

// Set by the runtime for every tile.
uniform vec2 u_resolution;  // output size in px
uniform vec2 u_tileOrigin;  // top left of the tile in output px
uniform vec2 u_tileSize;    // tile size in px
uniform vec2 u_design;      // design size (render context) in CSS px
uniform sampler2D u_palette; // 256 x 1 colour ramp (RGBA8)

out vec4 fragColor;

// Centre of the current output pixel, origin top left, y down: the same
// for every tile layout (tiles only move the origin).
vec2 musterliPixel() {
  return vec2(u_tileOrigin.x + gl_FragCoord.x, u_tileOrigin.y + u_tileSize.y - gl_FragCoord.y);
}

// Ramp colour at v in [0, 1]: linear between the two neighbouring texels.
vec3 musterliRamp(float v) {
  float x = clamp(v, 0.0, 1.0) * 255.0;
  int i0 = min(int(floor(x)), 254);
  float f = x - float(i0);
  vec3 a = texelFetch(u_palette, ivec2(i0, 0), 0).rgb;
  vec3 b = texelFetch(u_palette, ivec2(i0 + 1, 0), 0).rgb;
  return mix(a, b, f);
}
`;

/** Integer hash (lowbias32) and seeded 2D simplex noise with fbm. */
export const GLSL_NOISE = /* glsl */ `
uint musterliHash(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

uint musterliHash3(uint a, uint b, uint c) {
  return musterliHash(a ^ musterliHash(b ^ musterliHash(c)));
}

const vec2 MUSTERLI_GRAD[8] = vec2[8](
  vec2(1.0, 0.0), vec2(0.70710678, 0.70710678), vec2(0.0, 1.0), vec2(-0.70710678, 0.70710678),
  vec2(-1.0, 0.0), vec2(-0.70710678, -0.70710678), vec2(0.0, -1.0), vec2(0.70710678, -0.70710678)
);

float musterliCorner(vec2 x, ivec2 cell, uint seed) {
  float t = 0.5 - dot(x, x);
  if (t <= 0.0) return 0.0;
  uint h = musterliHash3(uint(cell.x), uint(cell.y), seed);
  t *= t;
  return t * t * dot(MUSTERLI_GRAD[h & 7u], x);
}

// 2D simplex noise in about [-1, 1]. Lattice points are offset by 32768 so
// the hash only sees non-negative integers.
float musterliSimplex(vec2 p, uint seed) {
  const float F2 = 0.36602540378443865;
  const float G2 = 0.21132486540518713;
  float s = (p.x + p.y) * F2;
  vec2 i = floor(p + s);
  float t = (i.x + i.y) * G2;
  vec2 x0 = p - (i - t);
  ivec2 o = x0.x > x0.y ? ivec2(1, 0) : ivec2(0, 1);
  vec2 x1 = x0 - vec2(o) + G2;
  vec2 x2 = x0 - 1.0 + 2.0 * G2;
  ivec2 c = ivec2(i) + 32768;
  float n = musterliCorner(x0, c, seed) + musterliCorner(x1, c + o, seed)
    + musterliCorner(x2, c + 1, seed);
  return 99.0 * n;
}

// Fractal sum of 1 to 6 octaves (gain 0.5, lacunarity 2 with a rotation),
// normalised by the total amplitude.
float musterliFbm(vec2 p, uint seed, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * musterliSimplex(p, seed + uint(i) * 0x9e3779b9u);
    norm += amp;
    p = vec2(1.6 * p.x - 1.2 * p.y, 1.2 * p.x + 1.6 * p.y);
    amp *= 0.5;
  }
  return sum / norm;
}
`;
