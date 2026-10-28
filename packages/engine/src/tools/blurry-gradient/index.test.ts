import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  BLURRY_CIRCLES_MAX,
  BLURRY_CIRCLES_MIN,
  type BlurryGradientOptions,
  besselI0Scaled,
  blurredDiskProfile,
  blurryCircles,
  blurryGradientSvg,
} from "./index";

const opts = (o: Partial<BlurryGradientOptions> = {}): BlurryGradientOptions => ({
  width: 600,
  height: 400,
  background: "#ffffff",
  colors: ["#ff0000", "#00ff00", "#0000ff"],
  circles: 4,
  layout: "corners",
  size: 0.4,
  spread: 0,
  opacity: 0.8,
  blur: 0.5,
  rng: createRng(1),
  ...o,
});

describe("besselI0Scaled", () => {
  it("matches reference values of exp(-x) I0(x)", () => {
    expect(besselI0Scaled(0)).toBeCloseTo(1, 6);
    expect(besselI0Scaled(1)).toBeCloseTo(0.4657596, 6);
    expect(besselI0Scaled(3.75)).toBeCloseTo(0.2144571, 5);
    expect(besselI0Scaled(10)).toBeCloseTo(0.1278333, 6);
    // Asymptotically 1 / sqrt(2 pi x).
    expect(besselI0Scaled(1e4) * Math.sqrt(2 * Math.PI * 1e4)).toBeCloseTo(1, 4);
  });
});

describe("blurredDiskProfile", () => {
  it("is the sharp disk without blur", () => {
    expect(blurredDiskProfile(10, 0, 9.9)).toBe(1);
    expect(blurredDiskProfile(10, 0, 10.1)).toBe(0);
    expect(blurredDiskProfile(0, 5, 0)).toBe(0);
  });

  it("matches the closed form at the centre: 1 - exp(-R² / 2σ²)", () => {
    for (const [r, s] of [
      [10, 5],
      [100, 40],
      [50, 120],
    ] as const) {
      expect(blurredDiskProfile(r, s, 0)).toBeCloseTo(1 - Math.exp(-(r * r) / (2 * s * s)), 4);
    }
  });

  it("is about one half at the rim of a large disk and fades out beyond 3σ", () => {
    expect(blurredDiskProfile(1000, 10, 1000)).toBeCloseTo(0.5, 2);
    expect(blurredDiskProfile(200, 30, 200 + 3 * 30)).toBeLessThan(0.003);
  });

  it("decreases monotonically with the distance", () => {
    let prev = Infinity;
    for (let r = 0; r <= 300; r += 10) {
      const v = blurredDiskProfile(150, 40, r);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });
});

describe("blurryCircles", () => {
  it("clamps the count and cycles the colours", () => {
    expect(blurryCircles(opts({ circles: 0 }))).toHaveLength(BLURRY_CIRCLES_MIN);
    expect(blurryCircles(opts({ circles: 9 }))).toHaveLength(BLURRY_CIRCLES_MAX);
    expect(blurryCircles(opts({ circles: 4 })).map((c) => c.color)).toEqual([
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ff0000",
    ]);
  });

  it("puts the circles on the corners and then the centre", () => {
    const circles = blurryCircles(opts({ circles: 5 }));
    const corners = circles.slice(0, 4).map((c) => `${c.cx},${c.cy}`);
    expect(corners.sort()).toEqual(["0,0", "0,400", "600,0", "600,400"]);
    expect(circles[4]).toMatchObject({ cx: 300, cy: 200 });
  });

  it("starts with the centre for the mixed layout and clusters for center", () => {
    expect(blurryCircles(opts({ layout: "mixed" }))[0]).toMatchObject({ cx: 300, cy: 200 });
    for (const c of blurryCircles(opts({ layout: "center", circles: 5 }))) {
      expect(c.cx).toBeGreaterThanOrEqual(150);
      expect(c.cx).toBeLessThanOrEqual(450);
    }
  });

  it("moves corner circles inwards with spread", () => {
    for (const c of blurryCircles(opts({ spread: 1, circles: 4 }))) {
      expect(c.cx).toBeGreaterThanOrEqual(0);
      expect(c.cx).toBeLessThanOrEqual(600);
      expect(c.cy).toBeGreaterThanOrEqual(0);
      expect(c.cy).toBeLessThanOrEqual(400);
    }
  });

  it("keeps positions when the count changes", () => {
    const three = blurryCircles(opts({ circles: 3, spread: 0.5 }));
    const five = blurryCircles(opts({ circles: 5, spread: 0.5 }));
    expect(five.slice(0, 3).map((c) => [c.cx, c.cy])).toEqual(three.map((c) => [c.cx, c.cy]));
  });
});

describe("blurryGradientSvg", () => {
  it("draws each blurred circle as a radial gradient without filters", () => {
    const svg = blurryGradientSvg(opts());
    expect(svg).not.toContain("<filter");
    expect(svg.match(/<radialGradient /g)).toHaveLength(4);
    expect(svg).toContain('gradientUnits="userSpaceOnUse"');
    expect(svg).toContain('<stop stop-color="#ff0000" offset="0" stop-opacity="');
    expect(svg).toMatch(/stop-opacity="0"\/><\/radialGradient>/);
  });

  it("draws sharp translucent circles without blur", () => {
    const svg = blurryGradientSvg(opts({ blur: 0, opacity: 0.5 }));
    expect(svg).not.toContain("<radialGradient");
    expect(svg).toContain('r="160" fill="#ff0000" fill-opacity="0.5"');
  });

  it("keeps the background and adds grain on top", () => {
    const svg = blurryGradientSvg(
      opts({
        grain: { href: "data:image/png;base64,AAAA", edge: 128, opacity: 0.1, blend: "overlay" },
      }),
    );
    expect(svg).toContain('<rect width="600" height="400" fill="#ffffff"/>');
    expect(svg.endsWith('style="mix-blend-mode:overlay"/></svg>')).toBe(true);
  });
});
