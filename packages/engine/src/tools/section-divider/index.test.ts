import { describe, expect, it } from "vitest";
import {
  DIVIDER_SHAPES,
  dividerEdge,
  dividerLayerOpacity,
  dividerLayerShare,
  sectionDividerSvg,
  type SectionDividerOptions,
} from "./index";

const base: SectionDividerOptions = {
  shape: "wave",
  position: "bottom",
  count: 2,
  layers: 1,
  flip: false,
  invert: false,
  color: "#4f46e5",
  background: "transparent",
  width: 1440,
  height: 120,
};

/** All y coordinates of a path (pairs after the commands). */
function ys(d: string): number[] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return nums.filter((_, i) => i % 2 === 1);
}

describe("section divider", () => {
  it.each(DIVIDER_SHAPES)("draws %s from the left to the right edge inside the box", (shape) => {
    const d = dividerEdge({ shape, width: 1000, height: 100, count: 3, share: 1, phase: 0 });
    expect(d.startsWith("M0 ")).toBe(true);
    // Arcs carry radii and flags, so only the end point is checked for them.
    expect(d.trim().endsWith(shape === "steps" ? "H1000" : "100") || d.includes("1000 ")).toBe(
      true,
    );
    if (shape !== "clouds" && shape !== "steps") {
      for (const y of ys(d)) expect(y).toBeGreaterThanOrEqual(-100.01);
    }
  });

  it("reaches the top edge with the full share and stays lower with a smaller one", () => {
    const full = dividerEdge({
      shape: "tilt",
      width: 100,
      height: 100,
      count: 1,
      share: 1,
      phase: 0,
    });
    expect(full).toBe("M0 100L100 0");
    const half = dividerEdge({
      shape: "tilt",
      width: 100,
      height: 100,
      count: 1,
      share: 0.5,
      phase: 0,
    });
    expect(half).toBe("M0 100L100 50");
  });

  it("peaks an arc exactly at the top (quadratic control at 2·top − h)", () => {
    const d = dividerEdge({
      shape: "curve",
      width: 200,
      height: 100,
      count: 1,
      share: 1,
      phase: 0,
    });
    expect(d).toBe("M0 100Q100 -100 200 100");
  });

  it("keeps wave troughs above the bottom edge", () => {
    const d = dividerEdge({ shape: "wave", width: 400, height: 100, count: 2, share: 1, phase: 0 });
    const end = d.match(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)(?=\s*$)/);
    expect(Number(end?.[2])).toBeCloseTo(80, 1);
  });

  it("stacks layers: back ones reach higher below the edge, lower above it, front opaque", () => {
    expect([0, 1, 2].map((j) => dividerLayerShare(j, 3, false))).toEqual([1, 0.85, 0.7]);
    expect([0, 1, 2].map((j) => dividerLayerShare(j, 3, true))).toEqual([0.7, 0.85, 1]);
    expect(dividerLayerOpacity(2, 3)).toBe(1);
    expect(dividerLayerOpacity(0, 3)).toBeLessThan(dividerLayerOpacity(1, 3));
    const svg = sectionDividerSvg({ ...base, layers: 3 });
    expect(svg.match(/<path /g)).toHaveLength(3);
    expect(svg.match(/fill-opacity/g)).toHaveLength(2);
  });

  it("stretches to any width and flips with one transform", () => {
    expect(sectionDividerSvg(base)).toContain('preserveAspectRatio="none"');
    expect(sectionDividerSvg(base)).not.toContain("<g ");
    expect(sectionDividerSvg({ ...base, flip: true })).toContain("matrix(-1 0 0 1 1440 0)");
    expect(sectionDividerSvg({ ...base, position: "top" })).toContain("matrix(1 0 0 -1 0 120)");
  });

  it("closes the fill below the edge, or above it when inverted, with an optional background", () => {
    expect(sectionDividerSvg(base)).toContain("L1440 120L0 120Z");
    expect(sectionDividerSvg({ ...base, invert: true })).toContain("L1440 0L0 0Z");
    expect(sectionDividerSvg({ ...base, background: "#ffffff" })).toContain(
      '<rect width="1440" height="120" fill="#ffffff"/>',
    );
  });
});
