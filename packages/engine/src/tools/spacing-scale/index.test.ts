import { describe, expect, it } from "vitest";
import { fluidClamp } from "../fluid-type";
import { type SpacingScaleOptions, spacingSizes, spacingSpecimenSvg } from "./index";

const opts = (o: Partial<SpacingScaleOptions> = {}): SpacingScaleOptions => ({
  minViewport: 360,
  maxViewport: 1280,
  minBase: 16,
  maxBase: 20,
  sizesDown: 3,
  sizesUp: 4,
  pairs: "none",
  pairFrom: "s",
  pairTo: "l",
  ...o,
});

describe("spacingSizes", () => {
  it("lists the t-shirt sizes as multiples of the base", () => {
    const sizes = spacingSizes(opts());
    expect(sizes.map((s) => s.name)).toEqual(["3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl"]);
    const s = sizes.find((x) => x.name === "s");
    expect([s?.min, s?.max]).toEqual([16, 20]);
    const xl = sizes.find((x) => x.name === "xl");
    expect([xl?.min, xl?.max]).toEqual([48, 60]);
  });

  it("clamps the counts", () => {
    expect(spacingSizes(opts({ sizesDown: 9, sizesUp: 9 }))).toHaveLength(9);
    expect(spacingSizes(opts({ sizesDown: 0, sizesUp: 0 })).map((s) => s.name)).toEqual(["s"]);
  });

  it("adds one-up pairs and a custom pair", () => {
    const oneUp = spacingSizes(opts({ sizesDown: 1, sizesUp: 2, pairs: "one-up" }));
    expect(oneUp.filter((s) => s.pair).map((s) => s.name)).toEqual(["xs-s", "s-m", "m-l"]);
    const custom = spacingSizes(opts({ pairs: "custom", pairFrom: "s", pairTo: "2xl" }));
    const pair = custom.find((s) => s.pair);
    expect(pair?.name).toBe("s-2xl");
    expect([pair?.min, pair?.max]).toEqual([16, 80]);
    expect(
      spacingSizes(opts({ pairs: "custom", pairFrom: "s", pairTo: "s" })).some((s) => s.pair),
    ).toBe(false);
  });

  it("writes clamp() values that reach min and max at the viewports", () => {
    const s = spacingSizes(opts()).find((x) => x.name === "s");
    if (!s) throw new Error("missing s");
    expect(s.intercept + s.slope * 360).toBeCloseTo(16, 9);
    expect(s.intercept + s.slope * 1280).toBeCloseTo(20, 9);
    expect(fluidClamp(s, "rem")).toMatch(/^clamp\(1rem, .+vw, 1\.25rem\)$/);
  });
});

describe("spacingSpecimenSvg", () => {
  it("draws one row per size with its variable name", () => {
    const sizes = spacingSizes(opts({ pairs: "one-up" }));
    const svg = spacingSpecimenSvg({
      sizes,
      names: sizes.map((s) => `--space-${s.name}`),
      minViewport: 360,
      maxViewport: 1280,
      viewport: 1280,
      background: "#ffffff",
      ink: "#111111",
      muted: "#888888",
      accent: "#4f46e5",
      width: 1280,
      height: 4000,
    });
    for (const s of sizes) expect(svg).toContain(`--space-${s.name}<`);
    expect(svg).toContain('text-anchor="end" font-family');
  });
});
