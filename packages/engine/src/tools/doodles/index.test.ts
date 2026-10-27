import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { GENERATOR_BUDGET_MS, fastest } from "../../testing/timing";
import {
  DOODLE_KINDS,
  type DoodlesSvgOptions,
  MAX_DOODLES,
  MIN_DOODLE_SPACING_PX,
  doodleNoise,
  doodlePath,
  doodleStrokes,
  doodlesSvg,
  effectiveDoodleSpacing,
} from "./index";

const opts = (o: Partial<DoodlesSvgOptions> = {}): DoodlesSvgOptions => ({
  width: 300,
  height: 200,
  rng: createRng(1),
  background: "#ffffff",
  colors: ["#111111", "#ff3366"],
  shape: "mixed",
  spacing: 50,
  size: 0.8,
  sizeVariance: 0.3,
  rotation: 45,
  wobble: 0.5,
  strokeWidth: 3,
  ...o,
});

const coords = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("doodleStrokes", () => {
  it.each(DOODLE_KINDS)("%s stays within the unit square", (kind) => {
    const strokes = doodleStrokes(kind);
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      expect(s.points.length).toBeGreaterThanOrEqual(3);
      for (const p of s.points) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it("draws a cross as two strokes", () => {
    expect(doodleStrokes("cross")).toHaveLength(2);
  });
});

describe("doodlePath", () => {
  const noise = doodleNoise(createRng(4));
  const base = {
    kind: "squiggle" as const,
    center: { x: 100, y: 100 },
    size: 80,
    angle: 0,
    wobble: 0,
    noise,
    phase: 3,
  };

  it("follows the clean geometry without wobble", () => {
    const d = doodlePath(base);
    expect(d.startsWith("M60 100")).toBe(true);
    expect(d.endsWith("140 100")).toBe(true);
  });

  it("moves points with wobble but keeps them near the shape", () => {
    const clean = coords(doodlePath(base));
    const shaky = coords(doodlePath({ ...base, wobble: 1 }));
    expect(shaky).not.toEqual(clean);
    expect(shaky).toHaveLength(clean.length);
    shaky.forEach((v, i) => expect(Math.abs(v - (clean[i] ?? 0))).toBeLessThanOrEqual(80 * 0.4));
  });

  it("differs per phase and rotates around the centre", () => {
    expect(doodlePath({ ...base, wobble: 1, phase: 50 })).not.toBe(
      doodlePath({ ...base, wobble: 1 }),
    );
    expect(doodlePath({ ...base, angle: Math.PI / 2 }).startsWith("M100 60")).toBe(true);
  });

  it("closes closed shapes and splits multi-stroke shapes", () => {
    expect(doodlePath({ ...base, kind: "star" }).endsWith("Z")).toBe(true);
    expect(doodlePath({ ...base, kind: "cross" }).match(/M/g)).toHaveLength(2);
  });
});

describe("effectiveDoodleSpacing", () => {
  it("clamps to the minimum and to the doodle cap", () => {
    expect(effectiveDoodleSpacing(100, 100, 1)).toBe(MIN_DOODLE_SPACING_PX);
    expect(effectiveDoodleSpacing(8192, 8192, 8)).toBeGreaterThan(100);
    expect(() => effectiveDoodleSpacing(100, 100, 0)).toThrow(RangeError);
  });
});

describe("doodlesSvg", () => {
  it("is deterministic and groups strokes by colour", () => {
    const a = doodlesSvg(opts());
    expect(doodlesSvg(opts())).toBe(a);
    expect(a.match(/<path /g)?.length).toBeLessThanOrEqual(2);
    expect(a).toContain('stroke-linecap="round"');
    expect(a).toContain('<rect width="300" height="200" fill="#ffffff"/>');
  });

  it("uses only the chosen shape", () => {
    const stars = doodlesSvg(opts({ shape: "star" }));
    const subpaths = (stars.match(/M/g) ?? []).length;
    expect(subpaths).toBeGreaterThan(3);
    expect((stars.match(/Z/g) ?? []).length).toBe(subpaths);
  });

  it("keeps positions stable when only the shape changes", () => {
    const starts = (svg: string) => (svg.match(/M-?\d/g) ?? []).length;
    expect(starts(doodlesSvg(opts({ shape: "squiggle" })))).toBe(
      starts(doodlesSvg(opts({ shape: "arc" }))),
    );
  });

  it("stays within the doodle cap on extreme params", () => {
    const { ms, value } = fastest(() =>
      doodlesSvg(opts({ width: 8192, height: 8192, spacing: 1, rng: createRng(2) })),
    );
    expect((value.match(/M/g) ?? []).length).toBeLessThanOrEqual(MAX_DOODLES * 2);
    expect(ms).toBeLessThan(GENERATOR_BUDGET_MS);
  });
});
