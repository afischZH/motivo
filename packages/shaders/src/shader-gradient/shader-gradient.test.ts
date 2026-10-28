import { describe, expect, it } from "vitest";
import { paletteTextureData } from "../palette";
import { planTiles } from "../tiles";
import { renderShaderGradientCpu } from "./cpu";
import { SHADER_GRADIENT_FRAGMENT } from "./fragment";
import {
  SHADER_GRADIENT_STYLES,
  TIME_ORBITS,
  shaderGradientUniforms,
  type ShaderGradientOptions,
} from "./uniforms";

const BASE: ShaderGradientOptions = {
  style: "liquid",
  frequency: 1.6,
  amplitude: 1,
  warp: 1.2,
  detail: 3,
  angle: 20,
  zoom: 1,
  phase: 0.25,
  dither: "off",
  levels: 6,
  ditherScale: 2,
  grain: 0,
  vignette: 0,
  seed: 1,
};

/**
 * Byte-exact comparison as one string: `toEqual` on large typed arrays walks
 * every element through the matcher and is slow on a busy CI runner.
 */
const bytes = (data: Uint8Array | Uint8ClampedArray): string =>
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");

const PALETTE = paletteTextureData(["#1e1b4b", "#7c3aed", "#f472b6", "#fde68a"]);
const DESIGN = { width: 160, height: 100 };

function render(o: Partial<ShaderGradientOptions>, out = DESIGN, t = 0) {
  return renderShaderGradientCpu({
    uniforms: shaderGradientUniforms({ ...BASE, ...o }, t),
    palette: PALETTE,
    out,
    design: DESIGN,
  });
}

describe("shaderGradientUniforms", () => {
  it("loops seamlessly: t = 1 gives the offsets of t = 0", () => {
    const a = shaderGradientUniforms(BASE, 0).u_off as number[];
    const b = shaderGradientUniforms(BASE, 1).u_off as number[];
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 9));
    const half = shaderGradientUniforms(BASE, 0.5).u_off as number[];
    const moved = half.reduce((sum, v, i) => sum + Math.abs(v - (a[i] ?? 0)), 0);
    expect(moved).toBeGreaterThan(1);
    expect(a).toHaveLength(TIME_ORBITS.length * 2);
  });

  it("phase and t add up", () => {
    expect(shaderGradientUniforms({ ...BASE, phase: 0.75 }, 0).u_off).toEqual(
      shaderGradientUniforms({ ...BASE, phase: 0.5 }, 0.25).u_off,
    );
  });

  it("fills the Bayer array only with dithering on", () => {
    const off = shaderGradientUniforms(BASE);
    expect(off.u_bayerSize).toBe(0);
    expect((off.u_bayer as number[]).every((v) => v === 0)).toBe(true);
    const on = shaderGradientUniforms({ ...BASE, dither: "bayer4" });
    expect(on.u_bayerSize).toBe(4);
    expect((on.u_bayer as number[]).slice(0, 16).every((v) => v > 0 && v < 1)).toBe(true);
    expect(on.u_bayer).toHaveLength(64);
  });

  it("derives integer salts from the seed", () => {
    const a = shaderGradientUniforms({ ...BASE, seed: 1 });
    const b = shaderGradientUniforms({ ...BASE, seed: 2 });
    expect(a.u_salts).toHaveLength(5);
    expect(a.u_salts).not.toEqual(b.u_salts);
    for (const s of a.u_salts as number[]) expect(Number.isInteger(s) && s >= 0).toBe(true);
    expect(a.u_style).toBe(0);
    expect(shaderGradientUniforms({ ...BASE, style: "aurora" }).u_style).toBe(6);
  });

  it("names every uniform the fragment shader declares", () => {
    const declared = [...SHADER_GRADIENT_FRAGMENT.matchAll(/^uniform \w+ (u_\w+)/gm)].map(
      (m) => m[1],
    );
    const provided = new Set([
      "u_resolution",
      "u_tileOrigin",
      "u_tileSize",
      "u_design",
      "u_palette",
    ]);
    const values = Object.keys(shaderGradientUniforms(BASE));
    expect(declared.filter((n) => !provided.has(n ?? "")).sort()).toEqual(values.sort());
  });
});

describe("renderShaderGradientCpu", () => {
  it("is deterministic and depends on the seed and the time", () => {
    const a = render({});
    expect(bytes(render({}).data)).toBe(bytes(a.data));
    expect(bytes(render({ seed: 2 }).data)).not.toBe(bytes(a.data));
    expect(bytes(render({}, DESIGN, 0.3).data)).not.toBe(bytes(a.data));
    expect(bytes(render({}, DESIGN, 1).data)).toBe(bytes(render({}, DESIGN, 0).data));
  });

  it("renders every style opaque and with more than one colour", () => {
    for (const style of SHADER_GRADIENT_STYLES) {
      const { data } = render({ style }, { width: 40, height: 25 });
      const colours = new Set<number>();
      for (let i = 0; i < data.length; i += 4) {
        expect(data[i + 3]).toBe(255);
        colours.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
      }
      expect(colours.size, style).toBeGreaterThan(10);
    }
  });

  it("tiles give exactly the pixels of one full render", () => {
    const o = { dither: "bayer4" as const, grain: 0.6, vignette: 0.5 };
    const full = render(o);
    const uniforms = shaderGradientUniforms({ ...BASE, ...o });
    for (const row of planTiles(DESIGN.width, DESIGN.height, 48)) {
      for (const tile of row.tiles) {
        const part = renderShaderGradientCpu({
          uniforms,
          palette: PALETTE,
          out: DESIGN,
          design: DESIGN,
          tile,
        });
        for (let r = 0; r < tile.height; r++) {
          const a = ((tile.y + r) * DESIGN.width + tile.x) * 4;
          expect(bytes(part.data.subarray(r * tile.width * 4, (r + 1) * tile.width * 4))).toBe(
            bytes(full.data.subarray(a, a + tile.width * 4)),
          );
        }
      }
    }
  });

  it("a 2x render scaled down matches the 1x render (preview == export)", () => {
    // A real design size, rendered small: the field has the same detail per pixel as in the editor.
    const design = { width: 1600, height: 1000 };
    const at = (out: { width: number; height: number }) =>
      renderShaderGradientCpu({
        uniforms: shaderGradientUniforms({ ...BASE, style: "silk" }),
        palette: PALETTE,
        out,
        design,
      });
    const W = 120;
    const H = 75;
    const small = at({ width: W, height: H });
    const big = at({ width: W * 2, height: H * 2 });
    let diff = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (const [dx, dy] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ] as const) {
            sum += big.data[((y * 2 + dy) * W * 2 + x * 2 + dx) * 4 + c] ?? 0;
          }
          diff += Math.abs(sum / 4 - (small.data[(y * W + x) * 4 + c] ?? 0));
        }
      }
    }
    expect(diff / (W * H * 3)).toBeLessThan(2);
  });

  it("dithering uses at most `levels` colours of the ramp", () => {
    const { data } = render({ dither: "bayer8", levels: 4 });
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      colours.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    expect(colours.size).toBeLessThanOrEqual(4);
    expect(colours.size).toBeGreaterThan(1);
  });

  it("grain stays in design pixels: a 2x render repeats each grain cell", () => {
    const flat = { amplitude: 0, grain: 1 };
    const big = render(flat, { width: DESIGN.width * 2, height: DESIGN.height * 2 });
    const at = (x: number, y: number) => big.data[(y * DESIGN.width * 2 + x) * 4] ?? 0;
    let same = 0;
    for (let x = 0; x < 100; x += 2) if (at(x, 10) === at(x + 1, 11)) same++;
    expect(same).toBe(50);
    const small = render(flat);
    expect(new Set(Array.from({ length: 60 }, (_, i) => small.data[i * 4])).size).toBeGreaterThan(
      10,
    );
  });

  it("the vignette darkens the corners, not the centre", () => {
    const flat = { amplitude: 0 };
    const plain = render(flat);
    const vig = render({ ...flat, vignette: 1 });
    const centre = ((DESIGN.height / 2) * DESIGN.width + DESIGN.width / 2) * 4;
    expect(vig.data[centre]).toBe(plain.data[centre]);
    expect(vig.data[0] ?? 0).toBeLessThan((plain.data[0] ?? 0) * 0.4);
  });

  it("refuses frames without a palette or with malformed uniforms", () => {
    const uniforms = shaderGradientUniforms(BASE);
    expect(() =>
      renderShaderGradientCpu({ uniforms, palette: null, out: DESIGN, design: DESIGN }),
    ).toThrow(TypeError);
    expect(() =>
      renderShaderGradientCpu({
        uniforms: { ...uniforms, u_off: [1] },
        palette: PALETTE,
        out: DESIGN,
        design: DESIGN,
      }),
    ).toThrow(TypeError);
  });
});
