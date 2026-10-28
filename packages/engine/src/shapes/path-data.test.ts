import { describe, expect, it } from "vitest";
import { flattenPath, parsePathData, pathBounds, translatePath, windingNumber } from "./path-data";

describe("parsePathData", () => {
  it("reads absolute commands and splits implicit repeats", () => {
    expect(parsePathData("M0 0L1 2 3 4Z")).toEqual([
      { cmd: "M", args: [0, 0] },
      { cmd: "L", args: [1, 2] },
      { cmd: "L", args: [3, 4] },
      { cmd: "Z", args: [] },
    ]);
    expect(parsePathData("M0,0 1,1").map((c) => c.cmd)).toEqual(["M", "L"]);
    expect(parsePathData("M-1.5-.5H2V3")).toHaveLength(3);
  });

  it.each([
    ["", "empty"],
    ["L0 0", "no M"],
    ["M0 0l1 1", "relative"],
    ["M0 0L1", "arity"],
    ["M0 0Z1", "Z args"],
    ["M0 0X1", "unknown"],
    ["1 2", "number first"],
  ])("rejects %s (%s)", (d) => {
    expect(() => parsePathData(d)).toThrow(SyntaxError);
  });
});

describe("flattenPath and pathBounds", () => {
  it("measures arcs, cubic and quadratic curves", () => {
    const b = pathBounds("M-10 0A10 10 0 1 0 10 0A10 10 0 1 0 -10 0Z");
    expect(b.minY).toBeCloseTo(-10, 1);
    expect(b.maxY).toBeCloseTo(10, 1);
    expect(pathBounds("M0 0Q10 20 20 0Z").maxY).toBeCloseTo(10, 1);
    expect(pathBounds("M0 0C0 40 20 40 20 0Z").maxY).toBeCloseTo(30, 1);
    expect(pathBounds("M0 0C0 10 10 10 10 0S20 -10 20 0Z").minY).toBeCloseTo(-7.5, 1);
    expect(pathBounds("M0 0Q5 10 10 0T20 0Z").minY).toBeCloseTo(-5, 1);
  });

  it("splits subpaths and computes nonzero winding", () => {
    const polys = flattenPath(
      "M-10 0A10 10 0 1 0 10 0A10 10 0 1 0 -10 0ZM-5 0A5 5 0 1 1 5 0A5 5 0 1 1 -5 0Z",
    );
    expect(polys).toHaveLength(2);
    expect(windingNumber(polys, 0, 0)).toBe(0);
    expect(windingNumber(polys, 8, 0)).not.toBe(0);
    expect(windingNumber(polys, 20, 0)).toBe(0);
  });
});

describe("translatePath", () => {
  it("moves points but not arc radii or flags", () => {
    expect(translatePath("M0 0H10V5A3 4 30 1 0 1 2C1 2 3 4 5 6Z", 50, 50)).toBe(
      "M50 50H60V55A3 4 30 1 0 51 52C51 52 53 54 55 56Z",
    );
  });
});
