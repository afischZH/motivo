import { describe, expect, it } from "vitest";
import { crc32 } from "../png";
import { createRng } from "../rng";
import {
  SAMPLE_IMAGE_HEIGHT,
  SAMPLE_IMAGE_WIDTH,
  extractPalette,
  formatShare,
  sampleImagePixels,
  sortExtracted,
  type RgbaPixels,
} from "./index";

type Rgba = readonly [number, number, number, number];

/** A 1-pixel-high strip with `n` pixels of each colour, in order. */
function strip(blocks: readonly (readonly [Rgba, number])[]): RgbaPixels {
  const width = blocks.reduce((sum, [, n]) => sum + n, 0);
  const data = new Uint8ClampedArray(width * 4);
  let o = 0;
  for (const [rgba, n] of blocks) {
    for (let i = 0; i < n; i++, o += 4) data.set(rgba, o);
  }
  return { width, height: 1, data };
}

const RED: Rgba = [230, 57, 70, 255];
const NAVY: Rgba = [29, 53, 87, 255];
const SAND: Rgba = [241, 250, 238, 255];

describe("extractPalette", () => {
  it("finds the exact colours and shares of a three-colour image", () => {
    const pixels = strip([
      [NAVY, 500],
      [RED, 300],
      [SAND, 200],
    ]);
    for (let seed = 0; seed < 10; seed++) {
      const out = extractPalette(pixels, { count: 3, rng: createRng(seed) });
      expect(out.map((c) => c.color)).toEqual(["#1d3557", "#e63946", "#f1faee"]);
      expect(out.map((c) => c.share)).toEqual([0.5, 0.3, 0.2]);
    }
  });

  it("returns fewer colours when the image has fewer distinct ones", () => {
    const pixels = strip([
      [RED, 10],
      [NAVY, 30],
    ]);
    const out = extractPalette(pixels, { count: 8, rng: createRng(1) });
    expect(out).toEqual([
      { color: "#1d3557", share: 0.75 },
      { color: "#e63946", share: 0.25 },
    ]);
  });

  it("ignores transparent pixels and returns nothing for a fully transparent image", () => {
    const pixels = strip([
      [[255, 255, 255, 0], 900],
      [RED, 100],
    ]);
    expect(extractPalette(pixels, { count: 3, rng: createRng(1) })).toEqual([
      { color: "#e63946", share: 1 },
    ]);
    const empty = strip([[[0, 0, 0, 10], 50]]);
    expect(extractPalette(empty, { count: 5, rng: createRng(1) })).toEqual([]);
  });

  it("merges the two halves of a blended colour into its mean", () => {
    // Two near-identical greys must not be reported as separate colours when count is 1.
    const pixels = strip([
      [[100, 100, 100, 255], 50],
      [[110, 110, 110, 255], 50],
    ]);
    const [only] = extractPalette(pixels, { count: 1, rng: createRng(1) });
    expect(only?.share).toBe(1);
    expect(only?.color).toMatch(/^#6[6-9a-b]6[6-9a-b]6[6-9a-b]$/);
  });

  it("is deterministic per seed, sorted by share and sums to 1", () => {
    const pixels = sampleImagePixels();
    for (const count of [3, 5, 8, 10]) {
      const a = extractPalette(pixels, { count, rng: createRng(7) });
      expect(extractPalette(pixels, { count, rng: createRng(7) })).toEqual(a);
      expect(a).toHaveLength(count);
      const shares = a.map((c) => c.share);
      expect([...shares].sort((x, y) => y - x)).toEqual(shares);
      expect(shares.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
      for (const c of a) expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("can land in another local optimum with another seed", () => {
    const pixels = sampleImagePixels();
    const runs = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        extractPalette(pixels, { count: 6, rng: createRng(seed) })
          .map((c) => c.color)
          .join(),
      ),
    );
    expect(runs.size).toBeGreaterThan(1);
  });

  it("stays fast on the worst case: 256 × 256 pixels, every bin different", () => {
    const width = 256;
    const data = new Uint8ClampedArray(width * width * 4);
    const rng = createRng(3);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = rng.int(0, 255);
      data[i + 1] = rng.int(0, 255);
      data[i + 2] = rng.int(0, 255);
      data[i + 3] = 255;
    }
    const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
    const start = clock.now();
    const out = extractPalette({ width, height: width, data }, { count: 10, rng: createRng(1) });
    expect(clock.now() - start).toBeLessThan(1500);
    expect(out).toHaveLength(10);
  });

  it("only reads width × height pixels", () => {
    const pixels = strip([
      [RED, 4],
      [NAVY, 4],
    ]);
    const cropped = { ...pixels, width: 4 };
    expect(extractPalette(cropped, { count: 3, rng: createRng(1) })).toEqual([
      { color: "#e63946", share: 1 },
    ]);
  });
});

describe("sortExtracted", () => {
  const colors = [
    { color: "#1d3557", share: 0.4 },
    { color: "#808080", share: 0.1 },
    { color: "#e63946", share: 0.3 },
    { color: "#f1faee", share: 0.05 },
    { color: "#2a9d8f", share: 0.15 },
  ];

  it("sorts by share, lightness or hue without mutating the input", () => {
    const copy = JSON.parse(JSON.stringify(colors)) as typeof colors;
    expect(sortExtracted(colors, "share").map((c) => c.share)).toEqual([0.4, 0.3, 0.15, 0.1, 0.05]);
    // OKLab lightness: teal 0.63, red 0.60, grey 0.60 (perceptual, not HSL).
    expect(sortExtracted(colors, "lightness").map((c) => c.color)).toEqual([
      "#f1faee",
      "#2a9d8f",
      "#e63946",
      "#808080",
      "#1d3557",
    ]);
    // Red (hue ~25), teal (~180), navy (~255); greys last, light to dark.
    expect(sortExtracted(colors, "hue").map((c) => c.color)).toEqual([
      "#e63946",
      "#2a9d8f",
      "#1d3557",
      "#f1faee",
      "#808080",
    ]);
    expect(colors).toEqual(copy);
  });
});

describe("formatShare", () => {
  it("rounds to whole percent and marks tiny shares", () => {
    expect(formatShare(0.237)).toBe("24%");
    expect(formatShare(1)).toBe("100%");
    expect(formatShare(0.004)).toBe("<1%");
  });
});

describe("sampleImagePixels", () => {
  it("is an opaque, deterministic picture", () => {
    const a = sampleImagePixels();
    expect(a.width).toBe(SAMPLE_IMAGE_WIDTH);
    expect(a.height).toBe(SAMPLE_IMAGE_HEIGHT);
    expect(a.data).toHaveLength(SAMPLE_IMAGE_WIDTH * SAMPLE_IMAGE_HEIGHT * 4);
    for (let i = 3; i < a.data.length; i += 4) expect(a.data[i]).toBe(255);
    expect(sampleImagePixels().data).toEqual(a.data);
    expect(crc32(new Uint8Array(a.data.buffer)).toString(16)).toMatchSnapshot();
  });
});
