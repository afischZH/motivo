import { describe, expect, it } from "vitest";
import { PALETTE_TEXTURE_SIZE, paletteTextureData, rampColor } from "./palette";

describe("palette texture", () => {
  it("holds 256 opaque RGBA texels from the first to the last colour", () => {
    const data = paletteTextureData(["#ff0000", "#0000ff"]);
    expect(data.length).toBe(PALETTE_TEXTURE_SIZE * 4);
    expect([...data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...data.subarray(data.length - 4)]).toEqual([0, 0, 255, 255]);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it("is deterministic", () => {
    expect(paletteTextureData(["#123456", "#abcdef", "#00ff88"])).toEqual(
      paletteTextureData(["#123456", "#abcdef", "#00ff88"]),
    );
  });
});

describe("rampColor", () => {
  const data = paletteTextureData(["#000000", "#ffffff"]);
  const out = new Float64Array(3);

  it("returns the end texels at 0 and 1 and clamps outside", () => {
    rampColor(data, 0, out);
    expect([...out]).toEqual([0, 0, 0]);
    rampColor(data, 1, out);
    expect([...out]).toEqual([1, 1, 1]);
    rampColor(data, 7, out);
    expect([...out]).toEqual([1, 1, 1]);
    rampColor(data, -1, out);
    expect([...out]).toEqual([0, 0, 0]);
  });

  it("interpolates linearly between neighbouring texels", () => {
    const a = (data[100 * 4] ?? 0) / 255;
    const b = (data[101 * 4] ?? 0) / 255;
    rampColor(data, 100.25 / 255, out);
    expect(out[0]).toBeCloseTo(a + (b - a) * 0.25, 10);
  });
});
