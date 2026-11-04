/**
 * Embed config (docs/ARCHITECTURE.md 4.22): everything the standalone
 * player needs to loop a shader on any web page, as plain JSON. The same
 * fragment shader and the same uniforms as the editor, so the embed shows
 * the editor preview. Uniforms that change over the loop are sampled at
 * `t = i / samples`; the player interpolates between neighbouring samples.
 */
import { minifyGlsl } from "./glsl-minify";
import { RUNTIME_UNIFORMS } from "../frame";
import type { UniformValue } from "../uniforms";

/** Config format version; the player refuses other versions. */
export const EMBED_CONFIG_VERSION = 1;

/** Samples per loop for uniforms that move; 48 keeps circles within 0.25 % of their radius. */
export const EMBED_TIME_SAMPLES = 48;

export interface EmbedConfig {
  /** Format version (`EMBED_CONFIG_VERSION`). */
  v: number;
  /** Minified fragment shader. */
  f: string;
  /** Uniforms that stay the same over the loop (flattened arrays). */
  u: Record<string, number | number[]>;
  /** Uniforms that move: `n` samples of equal length, concatenated. */
  d: Record<string, number[]>;
  /** Number of samples per loop (0 when nothing moves). */
  n: number;
  /** RGBA palette texture (256 texels) as base64, empty without a ramp. */
  p: string;
  /** Seconds per loop, 0 for a still picture. */
  l: number;
  /** CSS colour shown before the first frame and without WebGL2. */
  b: string;
}

export interface EmbedSource {
  fragment: string;
  /** Uniforms at loop time `t` in [0, 1). */
  uniformsAt(t: number): Readonly<Record<string, UniformValue>>;
  palette: Uint8Array | null;
  loopSeconds: number;
}

function flat(value: UniformValue): number[] {
  if (typeof value === "boolean") return [value ? 1 : 0];
  if (typeof value === "number") return [value];
  return [...value];
}

/** Rounds moving samples to 4 decimals; integers stay exact. */
function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 without `btoa` (works in Node and workers alike). */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64[(n >> 18) & 63];
    out += BASE64[(n >> 12) & 63];
    out += b === undefined ? "=" : BASE64[(n >> 6) & 63];
    out += c === undefined ? "=" : BASE64[n & 63];
  }
  return out;
}

function hex2(v: number): string {
  return Math.round(v).toString(16).padStart(2, "0");
}

/** Middle colour of the ramp (or near-black) as `#rrggbb`. */
function fallbackColor(palette: Uint8Array | null): string {
  if (!palette || palette.length < 4) return "#111111";
  const i = Math.floor(palette.length / 8) * 4;
  return `#${hex2(palette[i] ?? 0)}${hex2(palette[i + 1] ?? 0)}${hex2(palette[i + 2] ?? 0)}`;
}

function same(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The embed config of one design. Pure and deterministic. Uniforms the
 * runtime sets itself (`RUNTIME_UNIFORMS`) must not appear in the tool's
 * uniforms and are left out. Throws `RangeError` for non-finite values or
 * a uniform whose length changes over the loop.
 */
export function buildEmbedConfig(source: EmbedSource, samples = EMBED_TIME_SAMPLES): EmbedConfig {
  const loop =
    Number.isFinite(source.loopSeconds) && source.loopSeconds > 0 ? source.loopSeconds : 0;
  const count = loop > 0 ? Math.max(2, Math.round(samples)) : 1;
  const frames = Array.from({ length: count }, (_, i) => source.uniformsAt(i / count));
  const first = frames[0] ?? {};
  const u: Record<string, number | number[]> = {};
  const d: Record<string, number[]> = {};
  for (const name of Object.keys(first).sort()) {
    if (RUNTIME_UNIFORMS.has(name)) continue;
    const series = frames.map((f) => {
      const value = f[name];
      if (value === undefined) throw new RangeError(`Uniform ${name} missing in a frame`);
      return flat(value);
    });
    const base = series[0] ?? [];
    for (const s of series) {
      if (s.length !== base.length) throw new RangeError(`Uniform ${name} changes length`);
      if (!s.every(Number.isFinite)) throw new RangeError(`Uniform ${name} is not finite`);
    }
    if (series.every((s) => same(s, base))) {
      u[name] = base.length === 1 && !Array.isArray(first[name]) ? (base[0] ?? 0) : base;
    } else {
      d[name] = series.flatMap((s) => s.map(round4));
    }
  }
  const moving = Object.keys(d).length > 0;
  return {
    v: EMBED_CONFIG_VERSION,
    f: minifyGlsl(source.fragment),
    u,
    d,
    n: moving ? count : 0,
    p: source.palette ? toBase64(source.palette) : "",
    l: moving ? loop : 0,
    b: fallbackColor(source.palette),
  };
}
