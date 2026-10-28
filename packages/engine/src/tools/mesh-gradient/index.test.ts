import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  MESH_BLUR_MAX,
  MESH_POINTS_MAX,
  MESH_POINTS_MIN,
  type MeshGradientOptions,
  meshBlobs,
  meshGradientSvg,
  spreadPoints,
} from "./index";

const opts = (o: Partial<MeshGradientOptions> = {}): MeshGradientOptions => ({
  width: 600,
  height: 400,
  background: "#ffffff",
  colors: ["#ff0000", "#00ff00", "#0000ff"],
  points: 5,
  blur: 0.5,
  warp: 0.5,
  rng: createRng(1),
  ...o,
});

describe("spreadPoints", () => {
  it("is deterministic and stays within the margin around the canvas", () => {
    const a = spreadPoints(createRng(4), 8, 600, 400, 0.1);
    expect(spreadPoints(createRng(4), 8, 600, 400, 0.1)).toEqual(a);
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(-60);
      expect(p.x).toBeLessThanOrEqual(660);
      expect(p.y).toBeGreaterThanOrEqual(-40);
      expect(p.y).toBeLessThanOrEqual(440);
    }
  });

  it("spreads points further apart than plain uniform sampling", () => {
    const minDist = (pts: { x: number; y: number }[]): number => {
      let d = Infinity;
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i] as { x: number; y: number };
          const b = pts[j] as { x: number; y: number };
          d = Math.min(d, Math.hypot(a.x - b.x, a.y - b.y));
        }
      return d;
    };
    let spread = 0;
    let uniform = 0;
    for (let seed = 1; seed <= 20; seed++) {
      spread += minDist(spreadPoints(createRng(seed), 6, 600, 400, 0));
      const rng = createRng(seed);
      uniform += minDist(
        Array.from({ length: 6 }, () => ({ x: rng.float(0, 600), y: rng.float(0, 400) })),
      );
    }
    expect(spread).toBeGreaterThan(uniform * 1.5);
  });
});

describe("meshBlobs", () => {
  it("clamps the number of blobs and cycles the colours", () => {
    expect(meshBlobs(opts({ points: 1 }))).toHaveLength(MESH_POINTS_MIN);
    expect(meshBlobs(opts({ points: 99 }))).toHaveLength(MESH_POINTS_MAX);
    const blobs = meshBlobs(opts({ points: 5 }));
    expect(blobs.map((b) => b.color)).toEqual([
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ff0000",
      "#00ff00",
    ]);
  });

  it("keeps the blob positions when blur or warp change", () => {
    const centres = (o: Partial<MeshGradientOptions>) =>
      meshBlobs(opts(o)).map((b) => [b.cx, b.cy, b.radius]);
    const base = centres({});
    expect(centres({ blur: 1 })).toEqual(base);
    expect(centres({ warp: 0 })).toEqual(base);
    expect(centres({ warp: 1 })).toEqual(base);
  });

  it("draws closed cubic paths that change with warp", () => {
    const smooth = meshBlobs(opts({ warp: 0 }));
    const warped = meshBlobs(opts({ warp: 1 }));
    for (const b of smooth) expect(b.d).toMatch(/^M[-\d.]+ [-\d.]+( C[-\d. ]+){6} Z$/);
    expect(warped[0]?.d).not.toBe(smooth[0]?.d);
  });
});

describe("meshGradientSvg", () => {
  it("blurs the blob group with one sRGB Gaussian blur and a padded filter region", () => {
    const svg = meshGradientSvg(opts({ blur: 1 }));
    const sigma = MESH_BLUR_MAX * 400;
    expect(svg).toContain(`<feGaussianBlur stdDeviation="${sigma}"/>`);
    expect(svg).toContain('color-interpolation-filters="sRGB"');
    expect(svg).toContain(`x="${-3 * sigma}" y="${-3 * sigma}" width="${600 + 6 * sigma}"`);
    const id = /<filter id="(\w+)"/.exec(svg)?.[1];
    expect(svg).toContain(`<g filter="url(#${id ?? "?"})">`);
    expect(svg).not.toContain("feTurbulence");
  });

  it("omits the filter without blur and the background when transparent", () => {
    const svg = meshGradientSvg(opts({ blur: 0, background: "transparent" }));
    expect(svg).not.toContain("<filter");
    expect(svg).not.toContain("<defs>");
    expect(svg).not.toContain("<rect");
    expect(svg.match(/<path /g)).toHaveLength(5);
  });

  it("draws the background first and the grain last", () => {
    const svg = meshGradientSvg(
      opts({
        grain: { href: "data:image/png;base64,AAAA", edge: 128, opacity: 0.2, blend: "overlay" },
      }),
    );
    expect(svg.indexOf('<rect width="600" height="400" fill="#ffffff"/>')).toBeLessThan(
      svg.indexOf("<g "),
    );
    expect(svg.lastIndexOf("<rect ")).toBeGreaterThan(svg.indexOf("</g>"));
    expect(svg).toContain('opacity="0.2" style="mix-blend-mode:overlay"');
  });

  it("is deterministic per seed", () => {
    expect(meshGradientSvg(opts({ rng: createRng(7) }))).toBe(
      meshGradientSvg(opts({ rng: createRng(7) })),
    );
    expect(meshGradientSvg(opts({ rng: createRng(7) }))).not.toBe(
      meshGradientSvg(opts({ rng: createRng(8) })),
    );
  });
});
