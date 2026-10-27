import { describe, expect, it } from "vitest";
import { GENERATOR_BUDGET_MS, fastest } from "../../testing/timing";
import {
  MAX_DIETER_DOTS,
  type DieterDotsSvgOptions,
  dieterDotCount,
  dieterDotSites,
  dieterDotsSvg,
  effectiveRings,
} from "./index";

const opts: DieterDotsSvgOptions = {
  width: 200,
  height: 200,
  background: "#111111",
  colors: ["#eeeeee", "#ff6600"],
  rings: 3,
  dotsPerRing: 6,
  ringSpacing: 20,
  scale: 0.5,
  falloff: 0,
  twist: 0,
  colorMode: "single",
};

describe("dieterDotSites", () => {
  it("places a centre dot and dotsPerRing * i dots on ring i", () => {
    const sites = dieterDotSites(opts);
    expect(sites).toHaveLength(dieterDotCount(3, 6));
    expect(sites[0]).toEqual({ x: 100, y: 100, ring: 0 });
    expect(sites.filter((s) => s.ring === 2)).toHaveLength(12);
    // The first dot of each ring sits at 12 o'clock.
    const first = sites.find((s) => s.ring === 1);
    expect(first?.x).toBeCloseTo(100, 9);
    expect(first?.y).toBeCloseTo(80, 9);
  });

  it("rotates rings by the twist", () => {
    const first = dieterDotSites({ ...opts, twist: 90 }).find((s) => s.ring === 1);
    expect(first?.x).toBeCloseTo(120, 9);
    expect(first?.y).toBeCloseTo(100, 9);
  });
});

describe("effectiveRings", () => {
  it("drops rings beyond the canvas corners", () => {
    expect(effectiveRings({ ...opts, rings: 40 })).toBe(
      Math.ceil(Math.hypot(200, 200) / 2 / 20) + 1,
    );
  });

  it("caps the dot count", () => {
    const rings = effectiveRings({
      width: 8192,
      height: 8192,
      rings: 1000,
      dotsPerRing: 36,
      ringSpacing: 1,
    });
    expect(dieterDotCount(rings, 36)).toBeLessThanOrEqual(MAX_DIETER_DOTS);
    expect(dieterDotCount(rings + 1, 36)).toBeGreaterThan(MAX_DIETER_DOTS);
  });
});

describe("dieterDotsSvg", () => {
  it("draws every dot in one colour group", () => {
    const svg = dieterDotsSvg(opts);
    expect(svg.match(/<circle /g)).toHaveLength(37);
    expect(svg).toContain('<g fill="#eeeeee"><circle cx="100" cy="100" r="5"/>');
  });

  it("alternates colours per ring and blends them as a gradient", () => {
    expect(dieterDotsSvg({ ...opts, colorMode: "alternate" }).match(/<g /g)).toHaveLength(2);
    const gradient = dieterDotsSvg({ ...opts, colorMode: "gradient" });
    expect(gradient.match(/<g /g)).toHaveLength(4);
    expect(gradient).toContain('<g fill="#ff6600">');
  });

  it("shrinks outer dots with falloff", () => {
    const svg = dieterDotsSvg({ ...opts, falloff: 0.5 });
    expect(svg).toContain('r="5"/>');
    expect(svg).toContain('r="2.5"/>');
  });

  it("stays bounded and fast with extreme params", () => {
    const { ms, value: svg } = fastest(() =>
      dieterDotsSvg({
        ...opts,
        width: 8192,
        height: 8192,
        rings: 1000,
        dotsPerRing: 36,
        ringSpacing: 0.1,
      }),
    );
    expect(ms).toBeLessThan(GENERATOR_BUDGET_MS);
    expect((svg.match(/<circle /g) ?? []).length).toBeLessThanOrEqual(MAX_DIETER_DOTS);
  });
});
