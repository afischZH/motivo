import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  MESH_BLUR_MAX,
  MESH_FIELD_SIGMA,
  MESH_FILTER_SIGMA_MAX,
  MESH_OUTPUT_EDGE_MAX,
  MESH_POINTS_MAX,
  MESH_POINTS_MIN,
  type MeshBlob,
  type MeshGradientOptions,
  meshBlobs,
  meshBlurPlan,
  meshField,
  meshFieldImage,
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

describe("meshBlurPlan", () => {
  it("skips tiny blurs and keeps the filter while the largest export stays under the cap", () => {
    expect(meshBlurPlan(600, 400, 0.4)).toEqual({ kind: "none" });
    const limit = (MESH_FILTER_SIGMA_MAX * 600) / MESH_OUTPUT_EDGE_MAX;
    expect(meshBlurPlan(600, 400, limit)).toEqual({ kind: "filter", sigma: limit });
    expect(meshBlurPlan(600, 400, limit + 0.01)).toEqual({
      kind: "raster",
      sigma: limit + 0.01,
      pixel: (limit + 0.01) / MESH_FIELD_SIGMA,
    });
  });

  it("bounds the blur in output pixels and the field size for every design and export size", () => {
    const sizes = [
      [8192, 8192],
      [7680, 4320],
      [1920, 1080],
      [1080, 1920],
      [600, 400],
      [8192, 64],
      [64, 64],
    ] as const;
    for (const [w, h] of sizes) {
      const maxScale = MESH_OUTPUT_EDGE_MAX / Math.max(w, h);
      for (let blur = 0; blur <= 1; blur += 0.05) {
        const sigma = blur * MESH_BLUR_MAX * Math.min(w, h);
        const plan = meshBlurPlan(w, h, sigma);
        if (plan.kind === "filter") {
          // feGaussianBlur stays far below the browser clamps (about 270 to 520 px)
          // and the filter surface below 8192 + 6 * 200 px per edge.
          expect(sigma * maxScale).toBeLessThanOrEqual(MESH_FILTER_SIGMA_MAX);
        } else if (plan.kind === "raster") {
          expect(sigma / plan.pixel).toBe(MESH_FIELD_SIGMA);
          const columns = Math.ceil(w / plan.pixel) + 2;
          const rows = Math.ceil(h / plan.pixel) + 2;
          const edge = (MESH_FIELD_SIGMA * MESH_OUTPUT_EDGE_MAX) / MESH_FILTER_SIGMA_MAX;
          expect(Math.max(columns, rows)).toBeLessThanOrEqual(Math.ceil(edge) + 2);
        }
      }
    }
  });
});

/** A blob given as a straight-edged polygon, for exact field checks. */
const polygonBlob = (pts: { x: number; y: number }[], color: string): MeshBlob => ({
  cx: 0,
  cy: 0,
  radius: 0,
  color,
  d: "",
  path: {
    start: pts[0] as { x: number; y: number },
    segments: pts.map((_, i) => {
      const a = pts[i] as { x: number; y: number };
      const b = pts[(i + 1) % pts.length] as { x: number; y: number };
      return { c1: a, c2: b, to: b };
    }),
    closed: true,
  },
});

describe("meshField", () => {
  it("places the field one pixel past the canvas on every side", () => {
    const f = meshField([], 600, 400, 80, 20);
    expect(f).toMatchObject({ x: -20, y: -20, width: 640, height: 440 });
    expect(f.image.width).toBe(32);
    expect(f.image.height).toBe(22);
    expect(f.image.data.every((v) => v === 0)).toBe(true);
  });

  it("is opaque under a blob covering everything and blurs a straight edge like a Gaussian", () => {
    const full = meshField(
      [
        polygonBlob(
          [
            { x: -900, y: -900 },
            { x: 1500, y: -900 },
            { x: 1500, y: 1300 },
            { x: -900, y: 1300 },
          ],
          "#336699",
        ),
      ],
      600,
      400,
      80,
      20,
    );
    for (let i = 0; i < full.image.data.length; i += 4) {
      expect(Array.from(full.image.data.subarray(i, i + 4))).toEqual([0x33, 0x66, 0x99, 255]);
    }
    // Left half covered: alpha follows the normal CDF across x = 300 (sigma 80).
    const half = meshField(
      [
        polygonBlob(
          [
            { x: -900, y: -900 },
            { x: 300, y: -900 },
            { x: 300, y: 1300 },
            { x: -900, y: 1300 },
          ],
          "#ffffff",
        ),
      ],
      600,
      400,
      80,
      20,
    );
    const row = 10 * half.image.width * 4;
    // Pixel i covers x in [-20 + 20 i, 20 i), centre 20 i - 10.
    const alpha = (i: number) => (half.image.data[row + i * 4 + 3] as number) / 255;
    const cdf = (z: number) =>
      0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z ** 3)));
    for (const i of [8, 12, 15, 16, 19, 23]) {
      expect(alpha(i)).toBeCloseTo(cdf((300 - (20 * i - 10)) / 80), 2);
    }
  });

  it("is deterministic and encodes RGB only when fully opaque", () => {
    const o = opts({ blur: 1 });
    const blobs = meshBlobs(o);
    const a = meshFieldImage(blobs, 600, 400, 80, 20);
    expect(meshFieldImage(meshBlobs(opts({ blur: 1 })), 600, 400, 80, 20)).toEqual(a);
    expect(a.href.startsWith("data:image/png;base64,")).toBe(true);
    // Byte 25 of a PNG is the IHDR colour type; it sits in base64 characters 32 to 35 (bytes 24 to 26).
    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const ihdrColorType = (href: string) => {
      const quad = href.slice(
        "data:image/png;base64,".length + 32,
        "data:image/png;base64,".length + 36,
      );
      const n = [...quad].reduce((acc, ch) => (acc << 6) | B64.indexOf(ch), 0);
      return (n >>> 8) & 0xff;
    };
    const cover = polygonBlob(
      [
        { x: -900, y: -900 },
        { x: 1500, y: -900 },
        { x: 1500, y: 1300 },
        { x: -900, y: 1300 },
      ],
      "#000000",
    );
    expect(ihdrColorType(meshFieldImage([cover], 600, 400, 80, 20).href)).toBe(2);
    expect(ihdrColorType(meshFieldImage([], 600, 400, 80, 20).href)).toBe(6);
  });
});

describe("meshGradientSvg", () => {
  it("blurs small blurs with one sRGB feGaussianBlur and a padded filter region", () => {
    // 600 px may be exported at up to 8192 px: sigma 8 stays under 200 output px.
    const svg = meshGradientSvg(opts({ blur: 0.1 }));
    const sigma = 8; // 0.1 * MESH_BLUR_MAX * 400
    expect(svg).toContain(`<feGaussianBlur stdDeviation="${sigma}"/>`);
    expect(svg).toContain('color-interpolation-filters="sRGB"');
    expect(svg).toContain(`x="${-3 * sigma}" y="${-3 * sigma}" width="${600 + 6 * sigma}"`);
    const id = /<filter id="(\w+)"/.exec(svg)?.[1];
    expect(svg).toContain(`<g filter="url(#${id ?? "?"})">`);
    expect(svg).not.toContain("feTurbulence");
    expect(svg).not.toContain("<image");
  });

  it("renders large blurs as a small upscaled raster field instead of a filter", () => {
    const svg = meshGradientSvg(opts({ blur: 1 }));
    expect(svg).not.toContain("<filter");
    expect(svg).not.toContain("<path");
    // sigma 80 -> 20 user units per field pixel, field 32 x 22 px from (-20, -20).
    expect(svg).toContain(
      '<image x="-20" y="-20" width="640" height="440" preserveAspectRatio="none" ' +
        'xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="data:image/png;base64,',
    );
  });

  it("keeps the SVG small at 8K", () => {
    for (const blur of [0.15, 0.5, 1]) {
      const svg = meshGradientSvg(opts({ width: 8192, height: 8192, blur }));
      expect(svg.length).toBeLessThan(160_000);
    }
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
      svg.indexOf("<image x="),
    );
    expect(svg.lastIndexOf("<rect ")).toBeGreaterThan(svg.indexOf("<image x="));
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
