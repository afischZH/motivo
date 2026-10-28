import { describe, expect, it } from "vitest";
import {
  DIFFUSION_KERNELS,
  DITHER_ALGORITHMS,
  LUMA_WEIGHTS,
  NEUTRAL_TONE,
  applyDither,
  bayerMatrix,
  createPixelBuffer,
  demoPhoto,
  pixelDigest,
  resizeCover,
  resizeNearest,
  scaleGrid,
  type DitherOptions,
  type PixelBuffer,
} from "./index";

function solid(width: number, height: number, rgb: [number, number, number]): PixelBuffer {
  const buf = createPixelBuffer(width, height);
  for (let i = 0; i < buf.data.length; i += 4) buf.data.set([...rgb, 255], i);
  return buf;
}

/** Distinct colours of a buffer as `r,g,b` strings. */
function colours(buf: PixelBuffer): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < buf.data.length; i += 4) {
    out.add(`${buf.data[i]},${buf.data[i + 1]},${buf.data[i + 2]}`);
  }
  return out;
}

const share = (buf: PixelBuffer, r: number): number => {
  let n = 0;
  for (let i = 0; i < buf.data.length; i += 4) if (buf.data[i] === r) n++;
  return n / (buf.width * buf.height);
};

const MONO: DitherOptions = {
  ...NEUTRAL_TONE,
  algorithm: "floyd-steinberg",
  palette: ["#000000", "#ffffff"],
  mode: "tone",
  weights: LUMA_WEIGHTS.rec709,
  serpentine: true,
};

const CGA = ["#000000", "#55ffff", "#ff55ff", "#ffffff"];

const photo = resizeCover(demoPhoto(160, 110), 160, 110);

describe("kernels", () => {
  it("weights add up to the divisor (Atkinson passes on 6/8)", () => {
    for (const [id, k] of Object.entries(DIFFUSION_KERNELS)) {
      const sum = k.taps.reduce((s, [, , w]) => s + w, 0);
      expect(sum, id).toBe(id === "atkinson" ? 6 : k.divisor);
    }
  });

  it("builds Bayer matrices with every threshold once", () => {
    const m = bayerMatrix(4);
    expect(new Set(m).size).toBe(16);
    expect([...m].sort((a, b) => a - b)[0]).toBeCloseTo(1 / 32, 9);
  });
});

describe("applyDither", () => {
  it.each(DITHER_ALGORITHMS)("%s keeps grey at about half black, half white", (algorithm) => {
    const out = applyDither(solid(64, 64, [128, 128, 128]), { ...MONO, algorithm });
    expect(colours(out)).toEqual(new Set(["0,0,0", "255,255,255"]));
    expect(Math.abs(share(out, 255) - 0.5)).toBeLessThan(algorithm === "atkinson" ? 0.12 : 0.04);
  });

  it.each(DITHER_ALGORITHMS)("%s uses only palette colours in colour mode", (algorithm) => {
    const out = applyDither(photo, { ...MONO, algorithm, palette: CGA, mode: "color" });
    for (const c of colours(out)) {
      expect(["0,0,0", "85,255,255", "255,85,255", "255,255,255"]).toContain(c);
    }
  });

  it("is deterministic and depends on the scan order", () => {
    const a = pixelDigest(applyDither(photo, MONO));
    expect(pixelDigest(applyDither(photo, MONO))).toBe(a);
    expect(pixelDigest(applyDither(photo, { ...MONO, serpentine: false }))).not.toBe(a);
  });

  it("spreads the picture over a tonal palette and keeps alpha", () => {
    const greens = ["#d3e6a7", "#1b2d1a", "#8db26a", "#3e6b35"];
    const out = applyDither(photo, { ...MONO, palette: greens, algorithm: "bayer4" });
    expect(colours(out).size).toBe(4);
    const clear = createPixelBuffer(4, 4);
    expect(applyDither(clear, MONO).data[3]).toBe(0);
    expect(colours(applyDither(photo, { ...MONO, palette: ["#123456"] }))).toEqual(
      new Set(["18,52,86"]),
    );
  });

  it("follows the tone curve", () => {
    const grey = solid(48, 48, [128, 128, 128]);
    const bright = applyDither(grey, { ...MONO, brightness: 60 });
    expect(share(bright, 255)).toBeGreaterThan(share(applyDither(grey, MONO), 255) + 0.2);
  });
});

describe("grid scaling", () => {
  it("enlarges with hard pixels and shrinks with the mean", () => {
    const grid = createPixelBuffer(2, 1);
    grid.data.set([0, 0, 0, 255, 255, 255, 255, 255]);
    const big = resizeNearest(grid, 6, 3);
    expect([big.data[8], big.data[12], big.data[4 * 6]]).toEqual([0, 255, 0]);
    expect(scaleGrid(grid, 6, 3).data).toEqual(big.data);
    const small = scaleGrid(resizeNearest(grid, 8, 4), 2, 1);
    expect([small.data[0], small.data[4]]).toEqual([0, 255]);
    expect(scaleGrid(grid, 1, 1).data[0]).toBe(128);
    expect(resizeNearest(grid, 2, 1).data).toEqual(grid.data);
  });
});
