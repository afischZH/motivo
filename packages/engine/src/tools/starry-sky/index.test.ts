import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { MAX_DOT_SITES } from "../polka-dots";
import { type StarrySkySvgOptions, sparklePath, starrySkySvg } from "./index";

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

const opts: StarrySkySvgOptions = {
  width: 300,
  height: 200,
  rng: createRng(1),
  colors: ["#000022", "#223366"],
  starColor: "#ffffff",
  spacing: 15,
  size: 0.3,
  twinkle: 0.5,
  glow: 0,
  sparkles: 0,
};

describe("sparklePath", () => {
  it("draws a closed four-pointed star", () => {
    expect(sparklePath({ x: 0, y: 0 }, 10)).toBe(
      "M0 -10Q1.4 -1.4 10 0Q1.4 1.4 0 10Q-1.4 1.4 -10 0Q-1.4 -1.4 0 -10Z",
    );
  });
});

describe("starrySkySvg", () => {
  it("fills the canvas with the sky gradient", () => {
    const svg = starrySkySvg({ ...opts, rng: createRng(1) });
    expect(svg).toMatch(/<linearGradient id="sky[0-9a-z]+" x1="0" y1="0" x2="0" y2="1">/);
    expect(svg).toContain('<stop offset="1" stop-color="#223366"/>');
    expect(svg).toMatch(/<rect width="300" height="200" fill="url\(#sky[0-9a-z]+\)"\/>/);
  });

  it("groups stars by brightness and keeps them all bright without twinkle", () => {
    const flat = starrySkySvg({ ...opts, rng: createRng(1), twinkle: 0 });
    expect(flat.match(/<g /g)).toHaveLength(1);
    expect(flat).not.toContain("opacity=");
    const varied = starrySkySvg({ ...opts, rng: createRng(1), twinkle: 0.8 });
    expect((varied.match(/<g /g) ?? []).length).toBeGreaterThan(3);
  });

  it("adds sparkles and glows on request without moving the stars", () => {
    const centres = (svg: string): Set<string> =>
      new Set(
        [...svg.matchAll(/<circle cx="([^"]+)" cy="([^"]+)" r="[^"]+"\/>/g)].map(
          (m) => `${m[1]},${m[2]}`,
        ),
      );
    const plain = centres(starrySkySvg({ ...opts, rng: createRng(3) }));
    const fancySvg = starrySkySvg({ ...opts, rng: createRng(3), sparkles: 4, glow: 0.5 });
    expect(fancySvg.match(/Z/g)).toHaveLength(4);
    expect(fancySvg).toMatch(/<radialGradient id="glow/);
    // Every star of the plain sky is still there; sparkles replace at most 4 of them.
    const fancy = centres(fancySvg);
    expect([...plain].filter((c) => !fancy.has(c)).length).toBeLessThanOrEqual(4);
  });

  it("is deterministic", () => {
    const o = { ...opts, glow: 0.4, sparkles: 6 };
    expect(starrySkySvg({ ...o, rng: createRng(9) })).toBe(
      starrySkySvg({ ...o, rng: createRng(9) }),
    );
  });

  it("stays bounded and fast on an extreme strip", () => {
    const start = clock.now();
    const svg = starrySkySvg({
      ...opts,
      width: 8192,
      height: 16,
      spacing: 0.05,
      glow: 1,
      sparkles: 24,
      rng: createRng(1),
    });
    expect(clock.now() - start).toBeLessThan(500);
    // Stars are capped; glows only surround the larger ones.
    expect((svg.match(/<circle /g) ?? []).length).toBeLessThanOrEqual(MAX_DOT_SITES * 1.5);
  });
});
