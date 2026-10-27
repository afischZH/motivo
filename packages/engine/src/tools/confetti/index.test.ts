import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { MAX_DOT_SITES } from "../polka-dots";
import { CONFETTI_SHAPES, type ConfettiSvgOptions, confettiPiece, confettiSvg } from "./index";

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;

const opts: ConfettiSvgOptions = {
  width: 200,
  height: 150,
  rng: createRng(1),
  background: "#ffffff",
  colors: ["#ff0000", "#00aa00", "#0000ff"],
  shape: "mixed",
  spacing: 20,
  size: 0.6,
  sizeVariance: 0.3,
  rotation: 90,
};

describe("confettiPiece", () => {
  const c = { x: 10, y: 10 };

  it("builds an axis aligned chip without rotation", () => {
    expect(confettiPiece("rect", c, 8, 0)).toEqual({
      tag: "path",
      attrs: 'd="M6 8L14 8L14 12L6 12Z"',
    });
  });

  it("rotates the outline around the centre", () => {
    expect(confettiPiece("rect", c, 8, Math.PI / 2).attrs).toBe('d="M12 6L12 14L8 14L8 6Z"');
  });

  it("returns circles, triangles and stroked squiggles", () => {
    expect(confettiPiece("circle", c, 10, 1).attrs).toBe('cx="10" cy="10" r="3.5"');
    expect(confettiPiece("triangle", c, 10, 0).attrs).toMatch(/^d="M10 5L.*Z"$/);
    const squiggle = confettiPiece("squiggle", c, 9, 0);
    expect(squiggle.stroke).toBeCloseTo(1.26, 9);
    expect(squiggle.attrs).toBe('d="M5.5 10Q7 7.3 8.5 10Q10 12.7 11.5 10Q13 7.3 14.5 10"');
  });
});

describe("confettiSvg", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = confettiSvg({ ...opts, rng: createRng(4) });
    expect(confettiSvg({ ...opts, rng: createRng(4) })).toBe(a);
    expect(confettiSvg({ ...opts, rng: createRng(5) })).not.toBe(a);
  });

  it("uses only the requested shape", () => {
    const circles = confettiSvg({ ...opts, rng: createRng(1), shape: "circle" });
    expect(circles).not.toContain("<path");
    expect((circles.match(/<circle /g) ?? []).length).toBeGreaterThan(10);
    const squiggles = confettiSvg({ ...opts, rng: createRng(1), shape: "squiggle" });
    expect(squiggles).toContain('stroke-linecap="round"');
    expect(squiggles).not.toContain("<circle");
  });

  it("keeps positions and colours when only the rotation changes", () => {
    const groups = (svg: string): string[] =>
      [...svg.matchAll(/<g fill="([^"]+)"/g)].map((m) => m[1] ?? "");
    const circles = (r: number): string =>
      confettiSvg({ ...opts, rng: createRng(2), shape: "circle", rotation: r });
    expect(circles(0)).toBe(circles(180));
    expect(groups(confettiSvg({ ...opts, rng: createRng(2), rotation: 0 }))).toEqual(
      groups(confettiSvg({ ...opts, rng: createRng(2), rotation: 45 })),
    );
  });

  for (const shape of CONFETTI_SHAPES) {
    it(`stays bounded and fast on an extreme strip (${shape})`, () => {
      const start = clock.now();
      const svg = confettiSvg({
        ...opts,
        shape,
        width: 8192,
        height: 16,
        spacing: 0.1,
        rng: createRng(1),
      });
      expect(clock.now() - start).toBeLessThan(500);
      expect((svg.match(/<(path|circle) /g) ?? []).length).toBeLessThanOrEqual(MAX_DOT_SITES);
    });
  }
});
