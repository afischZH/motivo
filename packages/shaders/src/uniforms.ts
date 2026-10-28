/**
 * Uniform packing (pure, no WebGL): turns a plain record of uniform values
 * into typed setter calls for the active uniforms of a linked program. The
 * runtime reads the active uniforms once per program (`getActiveUniform`)
 * and applies the calls; Node tests check the packing without a GPU.
 */

/** A uniform value as tools produce it (`WebglRenderer.uniforms`). */
export type UniformValue = number | boolean | readonly number[];

/** GLSL uniform types (WebGL2 enums), as `getActiveUniform().type` reports them. */
export const GL_TYPES = {
  FLOAT: 0x1406,
  FLOAT_VEC2: 0x8b50,
  FLOAT_VEC3: 0x8b51,
  FLOAT_VEC4: 0x8b52,
  INT: 0x1404,
  INT_VEC2: 0x8b53,
  INT_VEC3: 0x8b54,
  INT_VEC4: 0x8b55,
  UNSIGNED_INT: 0x1405,
  UNSIGNED_INT_VEC2: 0x8dc6,
  UNSIGNED_INT_VEC3: 0x8dc7,
  UNSIGNED_INT_VEC4: 0x8dc8,
  BOOL: 0x8b56,
  FLOAT_MAT2: 0x8b5a,
  FLOAT_MAT3: 0x8b5b,
  FLOAT_MAT4: 0x8b5c,
  SAMPLER_2D: 0x8b5e,
} as const;

/** One active uniform of a program: name without `[0]`, GL type, array length. */
export interface UniformInfo {
  name: string;
  type: number;
  size: number;
}

/** The setter a value needs (`gl[method](location, data)` or `uniformMatrix*fv`). */
export type UniformMethod =
  | "uniform1fv"
  | "uniform2fv"
  | "uniform3fv"
  | "uniform4fv"
  | "uniform1iv"
  | "uniform2iv"
  | "uniform3iv"
  | "uniform4iv"
  | "uniform1uiv"
  | "uniform2uiv"
  | "uniform3uiv"
  | "uniform4uiv"
  | "uniformMatrix2fv"
  | "uniformMatrix3fv"
  | "uniformMatrix4fv";

export interface UniformCall {
  name: string;
  method: UniformMethod;
  data: Float32Array | Int32Array | Uint32Array;
}

type Kind = "f" | "i" | "ui" | "b" | "mat";

const LAYOUT: Readonly<Record<number, { kind: Kind; components: number; method: UniformMethod }>> =
  {
    [GL_TYPES.FLOAT]: { kind: "f", components: 1, method: "uniform1fv" },
    [GL_TYPES.FLOAT_VEC2]: { kind: "f", components: 2, method: "uniform2fv" },
    [GL_TYPES.FLOAT_VEC3]: { kind: "f", components: 3, method: "uniform3fv" },
    [GL_TYPES.FLOAT_VEC4]: { kind: "f", components: 4, method: "uniform4fv" },
    [GL_TYPES.INT]: { kind: "i", components: 1, method: "uniform1iv" },
    [GL_TYPES.INT_VEC2]: { kind: "i", components: 2, method: "uniform2iv" },
    [GL_TYPES.INT_VEC3]: { kind: "i", components: 3, method: "uniform3iv" },
    [GL_TYPES.INT_VEC4]: { kind: "i", components: 4, method: "uniform4iv" },
    [GL_TYPES.UNSIGNED_INT]: { kind: "ui", components: 1, method: "uniform1uiv" },
    [GL_TYPES.UNSIGNED_INT_VEC2]: { kind: "ui", components: 2, method: "uniform2uiv" },
    [GL_TYPES.UNSIGNED_INT_VEC3]: { kind: "ui", components: 3, method: "uniform3uiv" },
    [GL_TYPES.UNSIGNED_INT_VEC4]: { kind: "ui", components: 4, method: "uniform4uiv" },
    [GL_TYPES.BOOL]: { kind: "b", components: 1, method: "uniform1iv" },
    [GL_TYPES.FLOAT_MAT2]: { kind: "mat", components: 4, method: "uniformMatrix2fv" },
    [GL_TYPES.FLOAT_MAT3]: { kind: "mat", components: 9, method: "uniformMatrix3fv" },
    [GL_TYPES.FLOAT_MAT4]: { kind: "mat", components: 16, method: "uniformMatrix4fv" },
  };

export class UniformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UniformError";
  }
}

/** `u_off[0]` -> `u_off` (arrays report their first element). */
export function uniformBaseName(name: string): string {
  return name.endsWith("[0]") ? name.slice(0, -3) : name;
}

function flatten(name: string, value: UniformValue): number[] {
  if (typeof value === "boolean") return [value ? 1 : 0];
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return [...(value as readonly number[])];
  throw new UniformError(`Uniform ${name}: unsupported value`);
}

/**
 * Setter calls for every active uniform with a value. `provided` names
 * uniforms the runtime sets itself (resolution, tile, samplers); they and
 * values for uniforms the compiler removed are skipped. Throws
 * `UniformError` for a missing value, a wrong length, a non-finite number,
 * or an integer uniform given a fraction.
 */
export function packUniforms(
  values: Readonly<Record<string, UniformValue>>,
  infos: readonly UniformInfo[],
  provided: ReadonlySet<string> = new Set(),
): UniformCall[] {
  const calls: UniformCall[] = [];
  for (const info of infos) {
    const name = uniformBaseName(info.name);
    if (provided.has(name) || info.type === GL_TYPES.SAMPLER_2D) continue;
    const layout = LAYOUT[info.type];
    if (!layout)
      throw new UniformError(`Uniform ${name}: unsupported GL type 0x${info.type.toString(16)}`);
    const value = values[name];
    if (value === undefined) throw new UniformError(`Uniform ${name}: no value`);
    const flat = flatten(name, value);
    const expected = layout.components * info.size;
    if (flat.length !== expected) {
      throw new UniformError(`Uniform ${name}: expected ${expected} numbers, got ${flat.length}`);
    }
    for (const v of flat) {
      if (!Number.isFinite(v)) throw new UniformError(`Uniform ${name}: non-finite value`);
      if ((layout.kind === "i" || layout.kind === "ui") && !Number.isInteger(v)) {
        throw new UniformError(`Uniform ${name}: expected integers`);
      }
    }
    const data =
      layout.kind === "ui"
        ? Uint32Array.from(flat, (v) => v >>> 0)
        : layout.kind === "i" || layout.kind === "b"
          ? Int32Array.from(flat)
          : Float32Array.from(flat);
    calls.push({ name, method: layout.method, data });
  }
  return calls;
}
