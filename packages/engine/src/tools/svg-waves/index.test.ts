import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { type WavesSvgOptions, wavePoints, wavesSvg } from "./index";

describe("wavePoints", () => {
  it("spans the full width with points around the baseline", () => {
    const points = wavePoints({
      width: 300,
      baseline: 100,
      amplitude: 20,
      points: 4,
      rng: createRng(1),
    });
    expect(points.map((p) => p.x)).toEqual([0, 100, 200, 300]);
    for (const p of points) {
      expect(p.y).toBeGreaterThanOrEqual(80);
      expect(p.y).toBeLessThanOrEqual(120);
    }
  });

  it("uses at least two points", () => {
    expect(
      wavePoints({ width: 10, baseline: 0, amplitude: 1, points: 0, rng: createRng(1) }),
    ).toHaveLength(2);
  });
});

describe("wavesSvg", () => {
  const opts: WavesSvgOptions = {
    width: 400,
    height: 200,
    rng: createRng(1),
    background: "#ffffff",
    colors: ["#a0d8ef", "#003366"],
    layers: 3,
    points: 5,
    amplitude: 0.6,
    smoothness: 1,
    coverage: 0.5,
    direction: "up",
  };

  it("draws one closed path per layer with colours along the palette", () => {
    const svg = wavesSvg({ ...opts, rng: createRng(1) });
    const fills = [...svg.matchAll(/<path d="[^"]+" fill="(#[0-9a-f]{6})"\/>/g)].map((m) => m[1]);
    expect(fills).toHaveLength(3);
    expect(fills[0]).toBe("#a0d8ef");
    expect(fills[2]).toBe("#003366");
    expect(svg.match(/Z"/g)).toHaveLength(3);
  });

  it("closes along the bottom edge for up and the top edge for down", () => {
    expect(wavesSvg({ ...opts, rng: createRng(1) })).toContain("L400 200 L0 200Z");
    expect(wavesSvg({ ...opts, rng: createRng(1), direction: "down" })).toContain("L400 0 L0 0Z");
  });

  it("uses straight segments when smoothness is 0", () => {
    const svg = wavesSvg({ ...opts, rng: createRng(1), layers: 1, smoothness: 0 });
    const d = /<path d="([^"]+)"/.exec(svg)?.[1] ?? "";
    // With tension 0 every control point equals a segment endpoint.
    const nums = d
      .replace(/[MCLZ]/g, " ")
      .trim()
      .split(/\s+/)
      .map(Number);
    expect(nums[0]).toBe(0);
    expect(nums[2]).toBe(nums[0]);
    expect(nums[3]).toBe(nums[1]);
  });

  it("stays within the covered band", () => {
    const svg = wavesSvg({ ...opts, rng: createRng(2), smoothness: 0 });
    const ys = [...svg.matchAll(/<path d="([^"]+)"/g)].flatMap((m) =>
      (m[1] ?? "")
        .replace(/[MCLZ]/g, " ")
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((_, i) => i % 2 === 1),
    );
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(100 - 1e-9);
  });

  it("is deterministic", () => {
    expect(wavesSvg({ ...opts, rng: createRng(5) })).toBe(wavesSvg({ ...opts, rng: createRng(5) }));
  });
});
