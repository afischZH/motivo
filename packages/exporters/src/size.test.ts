import { describe, expect, it } from "vitest";
import { resolveRasterSize, splitIntoBands } from "./size";

const design = { width: 1200, height: 800 };

describe("resolveRasterSize", () => {
  it("defaults to the design size", () => {
    expect(resolveRasterSize(design)).toEqual({ width: 1200, height: 800, clamped: false });
  });

  it("keeps the aspect ratio for width-only and height-only requests", () => {
    expect(resolveRasterSize(design, { width: 600 })).toMatchObject({ width: 600, height: 400 });
    expect(resolveRasterSize(design, { height: 1000 })).toMatchObject({
      width: 1500,
      height: 1000,
    });
  });

  it("uses exact sizes when both edges are given", () => {
    expect(resolveRasterSize(design, { width: 300, height: 300 })).toMatchObject({
      width: 300,
      height: 300,
    });
  });

  it("scales", () => {
    expect(resolveRasterSize(design, { scale: 2 })).toMatchObject({ width: 2400, height: 1600 });
    expect(resolveRasterSize(design, { scale: 0.5 })).toMatchObject({ width: 600, height: 400 });
  });

  it("clamps to the max edge (8192 by default) keeping the ratio", () => {
    expect(resolveRasterSize(design, { scale: 10 })).toEqual({
      width: 8192,
      height: 5461,
      clamped: true,
    });
    expect(resolveRasterSize(design, { width: 4000 }, 2000)).toEqual({
      width: 2000,
      height: 1333,
      clamped: true,
    });
    expect(resolveRasterSize({ width: 8192, height: 8192 })).toMatchObject({ clamped: false });
  });

  it("ignores invalid requests and never returns less than 1 px", () => {
    expect(resolveRasterSize(design, { width: -5, scale: Number.NaN })).toMatchObject({
      width: 1200,
      height: 800,
    });
    expect(resolveRasterSize({ width: 10000, height: 1 }, {}, 8192)).toMatchObject({
      width: 8192,
      height: 1,
    });
  });
});

describe("splitIntoBands", () => {
  it("covers every row exactly once", () => {
    const bands = splitIntoBands(1000, 1050, 100_000);
    expect(bands.map((b) => b.height)).toEqual([
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 50,
    ]);
    let y = 0;
    for (const b of bands) {
      expect(b.y).toBe(y);
      y += b.height;
    }
    expect(y).toBe(1050);
  });

  it("uses one band for small images and at least one row per band", () => {
    expect(splitIntoBands(100, 100)).toEqual([{ y: 0, height: 100 }]);
    expect(splitIntoBands(10_000, 3, 10)).toHaveLength(3);
  });

  it("splits an 8K square into bands of at most the pixel budget", () => {
    const bands = splitIntoBands(8192, 8192);
    expect(bands.length).toBeGreaterThan(1);
    for (const b of bands) expect(b.height * 8192).toBeLessThanOrEqual(4_000_000);
  });
});
