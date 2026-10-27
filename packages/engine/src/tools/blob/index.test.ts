import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { distance } from "../../vec";
import {
  type BlobSvgOptions,
  MAX_DEVIATION,
  blobPath,
  blobPoints,
  blobSvg,
  circleTension,
} from "./index";

const shape = { cx: 50, cy: 50, radius: 40, complexity: 6, randomness: 0.5 };

describe("circleTension", () => {
  it("approaches the classic Catmull-Rom value for many points", () => {
    expect(circleTension(4)).toBeCloseTo(0.8284, 4);
    expect(circleTension(200)).toBeCloseTo(0.5, 3);
  });
});

describe("blobPoints", () => {
  it("returns `complexity` points within the radius", () => {
    const points = blobPoints({ ...shape, rng: createRng(1) });
    expect(points).toHaveLength(6);
    for (const p of points) {
      const d = distance(p, { x: 50, y: 50 });
      expect(d).toBeLessThanOrEqual(40 + 1e-9);
      expect(d).toBeGreaterThanOrEqual(
        (40 / (1 + 0.5 * MAX_DEVIATION)) * (1 - 0.5 * MAX_DEVIATION) - 1e-9,
      );
    }
  });

  it("lies on a circle when randomness is 0", () => {
    const points = blobPoints({ ...shape, randomness: 0, rng: createRng(3) });
    for (const p of points) expect(distance(p, { x: 50, y: 50 })).toBeCloseTo(40, 9);
  });

  it("enforces at least three points", () => {
    expect(blobPoints({ ...shape, complexity: 1, rng: createRng(1) })).toHaveLength(3);
  });

  it("is deterministic per seed and varies across seeds", () => {
    const a = blobPoints({ ...shape, rng: createRng(9) });
    expect(a).toEqual(blobPoints({ ...shape, rng: createRng(9) }));
    expect(a).not.toEqual(blobPoints({ ...shape, rng: createRng(10) }));
  });
});

describe("blobPath", () => {
  it("is a closed cubic path with one segment per point", () => {
    const d = blobPath({ ...shape, rng: createRng(1) });
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(6);
  });
});

describe("blobSvg", () => {
  const opts: BlobSvgOptions = {
    width: 400,
    height: 300,
    rng: createRng(1),
    background: "#ffffff",
    colors: ["#ff6347", "#1e90ff"],
    complexity: 7,
    randomness: 0.4,
    size: 0.8,
    fillStyle: "solid",
    strokeWidth: 8,
    gradientAngle: 45,
  };

  it("renders a solid blob over the background", () => {
    const svg = blobSvg({ ...opts, rng: createRng(1) });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="400" height="300"/);
    expect(svg).toContain('<rect width="400" height="300" fill="#ffffff"/>');
    expect(svg).toContain('fill="#ff6347"/>');
  });

  it("renders outlines and gradients", () => {
    const outline = blobSvg({
      ...opts,
      rng: createRng(1),
      fillStyle: "outline",
      background: "transparent",
    });
    expect(outline).toContain('fill="none" stroke="#ff6347" stroke-width="8"');
    expect(outline).not.toContain("<rect");
    const gradient = blobSvg({ ...opts, rng: createRng(1), fillStyle: "gradient" });
    expect(gradient).toMatch(/<linearGradient id="(bg[0-9a-z]+)" .*fill="url\(#\1\)"/);
    expect(gradient.match(/<stop /g)).toHaveLength(2);
  });

  it("keeps the shape identical across fill styles for the same seed", () => {
    const d = (svg: string): string | undefined => /<path d="([^"]+)"/.exec(svg)?.[1];
    const solid = d(blobSvg({ ...opts, rng: createRng(4), strokeWidth: 0 }));
    const gradient = d(blobSvg({ ...opts, rng: createRng(4), fillStyle: "gradient" }));
    expect(solid).toBe(gradient);
  });
});
