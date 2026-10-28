import { describe, expect, it } from "vitest";
import { GL_TYPES, UniformError, packUniforms, uniformBaseName } from "./uniforms";

const info = (name: string, type: number, size = 1) => ({ name, type, size });

describe("packUniforms", () => {
  it("maps scalars, vectors, arrays and matrices to typed setters", () => {
    const calls = packUniforms(
      {
        u_f: 0.5,
        u_v2: [1, 2],
        u_i: 3,
        u_u: 0xffffffff,
        u_b: true,
        u_arr: [1, 2, 3, 4, 5, 6, 7, 8],
        u_m: [1, 0, 0, 1],
      },
      [
        info("u_f", GL_TYPES.FLOAT),
        info("u_v2", GL_TYPES.FLOAT_VEC2),
        info("u_i", GL_TYPES.INT),
        info("u_u", GL_TYPES.UNSIGNED_INT),
        info("u_b", GL_TYPES.BOOL),
        info("u_arr[0]", GL_TYPES.FLOAT_VEC2, 4),
        info("u_m", GL_TYPES.FLOAT_MAT2),
      ],
    );
    expect(calls.map((c) => [c.name, c.method, c.data.constructor.name, [...c.data]])).toEqual([
      ["u_f", "uniform1fv", "Float32Array", [0.5]],
      ["u_v2", "uniform2fv", "Float32Array", [1, 2]],
      ["u_i", "uniform1iv", "Int32Array", [3]],
      ["u_u", "uniform1uiv", "Uint32Array", [0xffffffff]],
      ["u_b", "uniform1iv", "Int32Array", [1]],
      ["u_arr", "uniform2fv", "Float32Array", [1, 2, 3, 4, 5, 6, 7, 8]],
      ["u_m", "uniformMatrix2fv", "Float32Array", [1, 0, 0, 1]],
    ]);
  });

  it("skips runtime uniforms, samplers and values of removed uniforms", () => {
    const calls = packUniforms(
      { u_unused: 1, u_x: 2 },
      [
        info("u_resolution", GL_TYPES.FLOAT_VEC2),
        info("u_palette", GL_TYPES.SAMPLER_2D),
        info("u_x", GL_TYPES.FLOAT),
      ],
      new Set(["u_resolution"]),
    );
    expect(calls.map((c) => c.name)).toEqual(["u_x"]);
  });

  it("rejects missing values, wrong lengths, non-finite numbers and fractions for ints", () => {
    const f = [info("u_a", GL_TYPES.FLOAT_VEC2)];
    expect(() => packUniforms({}, f)).toThrow(UniformError);
    expect(() => packUniforms({ u_a: [1] }, f)).toThrow(/expected 2/);
    expect(() => packUniforms({ u_a: [1, Number.NaN] }, f)).toThrow(/non-finite/);
    expect(() => packUniforms({ u_a: 1.5 }, [info("u_a", GL_TYPES.INT)])).toThrow(/integers/);
    expect(() => packUniforms({ u_a: 1 }, [info("u_a", 0x1234)])).toThrow(/unsupported GL type/);
  });

  it("strips the array suffix of names", () => {
    expect(uniformBaseName("u_off[0]")).toBe("u_off");
    expect(uniformBaseName("u_x")).toBe("u_x");
  });
});
