import { describe, expect, it } from "vitest";
import {
  CMYK_CLASSIC_ANGLES,
  HALFTONE_SHAPES,
  NEUTRAL_TONE,
  LUMA_WEIGHTS,
  applyCmykHalftone,
  applyHalftone,
  cellCentre,
  cmykHalftoneSvg,
  cmykPlates,
  coverageLevel,
  createPixelBuffer,
  demoPhoto,
  halftoneCellEstimate,
  halftonePlate,
  halftoneScreen,
  halftoneSizeLut,
  halftoneSvg,
  pixelDigest,
  plateRow,
  plateShapeCount,
  resizeCover,
  rgbToCmyk,
  screenCells,
  screenMeans,
  shapeCoverage,
  shapeMaxSize,
  shapeSizeForCoverage,
  type CmykHalftoneOptions,
  type HalftoneOptions,
  type PixelBuffer,
} from "./index";

function solid(width: number, height: number, rgb: [number, number, number]): PixelBuffer {
  const buf = createPixelBuffer(width, height);
  for (let i = 0; i < buf.data.length; i += 4) buf.data.set([...rgb, 255], i);
  return buf;
}

/** Mean of a channel over a buffer, 0 to 255. */
function mean(buf: PixelBuffer, channel = 0): number {
  let sum = 0;
  for (let i = channel; i < buf.data.length; i += 4) sum += buf.data[i] ?? 0;
  return sum / (buf.width * buf.height);
}

const HALFTONE: HalftoneOptions = {
  ...NEUTRAL_TONE,
  cell: 8,
  angle: 45,
  shape: "circle",
  ink: "#000000",
  paper: "#ffffff",
  weights: LUMA_WEIGHTS.rec709,
  invert: false,
};

const CMYK: CmykHalftoneOptions = {
  ...NEUTRAL_TONE,
  cell: 8,
  angles: CMYK_CLASSIC_ANGLES,
  shape: "circle",
  inks: { c: "#00ffff", m: "#ff00ff", y: "#ffff00", k: "#000000" },
  paper: "#ffffff",
  gcr: 1,
  offsets: { c: [0, 0], m: [0, 0], y: [0, 0], k: [0, 0] },
};

// Cached: the demo picture is the most expensive input of these tests.
const photo = resizeCover(demoPhoto(240, 160), 240, 160);

describe("shape coverage", () => {
  it.each(HALFTONE_SHAPES)("%s: size and coverage are inverse and monotonic", (shape) => {
    let last = -1;
    for (let i = 0; i <= 20; i++) {
      const c = i / 20;
      const size = shapeSizeForCoverage(shape, c);
      expect(shapeCoverage(shape, size)).toBeCloseTo(c, 5);
      expect(size).toBeGreaterThanOrEqual(last);
      last = size;
    }
    expect(shapeCoverage(shape, 0)).toBe(0);
    expect(shapeCoverage(shape, shapeMaxSize(shape))).toBeCloseTo(1, 9);
  });

  it("knows the circle's overlap and the diamond's checkerboard", () => {
    expect(shapeCoverage("circle", 0.5)).toBeCloseTo(Math.PI / 4, 9);
    expect(shapeCoverage("diamond", 1)).toBe(0.5);
    expect(shapeSizeForCoverage("line", 0.3)).toBeCloseTo(0.3, 9);
  });

  it("caches a size table per shape", () => {
    const lut = halftoneSizeLut("square");
    expect(lut).toHaveLength(256);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBeCloseTo(1, 6);
    expect(halftoneSizeLut("square")).toBe(lut);
    expect(coverageLevel(0.5)).toBe(128);
    expect(coverageLevel(2)).toBe(255);
  });
});

describe("halftone screens", () => {
  it("covers the picture with a margin and maps cell centres back", () => {
    const s = halftoneScreen(100, 60, 10, 30);
    expect(screenCells(s)).toBe(s.cols * s.rows);
    // Every pixel centre lies in a cell of the grid.
    for (const [x, y] of [
      [0, 0],
      [99, 0],
      [0, 59],
      [99, 59],
    ] as const) {
      const u = ((x + 0.5 - s.cx) * s.cos + (y + 0.5 - s.cy) * s.sin) / s.cell;
      const v = (-(x + 0.5 - s.cx) * s.sin + (y + 0.5 - s.cy) * s.cos) / s.cell;
      expect(Math.floor(u) - s.i0).toBeGreaterThan(0);
      expect(Math.floor(u) - s.i0).toBeLessThan(s.cols - 1);
      expect(Math.floor(v) - s.j0).toBeGreaterThan(0);
      expect(Math.floor(v) - s.j0).toBeLessThan(s.rows - 1);
    }
    const flat = halftoneScreen(100, 60, 10, 0, 0);
    expect([flat.i0, flat.j0, flat.cols, flat.rows]).toEqual([-5, -3, 10, 6]);
    expect(cellCentre(flat, 0, 0)).toEqual([5, 5]);
  });

  it("averages values per cell and fills empty cells from the nearest pixel", () => {
    const buf = solid(20, 20, [255, 0, 0]);
    const s = halftoneScreen(20, 20, 10, 0, 1);
    const [means] = screenMeans(buf, [s], (r, _g, _b, out) => {
      out[0] = r / 255;
    });
    expect(means).toHaveLength(screenCells(s));
    expect([...(means ?? [])].every((v) => v === 1)).toBe(true);
  });
});

describe("applyHalftone", () => {
  it("prints the tone: white stays paper, black becomes ink, grey about half", () => {
    expect(mean(applyHalftone(solid(64, 64, [255, 255, 255]), HALFTONE))).toBe(255);
    expect(mean(applyHalftone(solid(64, 64, [0, 0, 0]), HALFTONE))).toBeLessThan(2);
    for (const shape of HALFTONE_SHAPES) {
      const grey = mean(applyHalftone(solid(96, 96, [128, 128, 128]), { ...HALFTONE, shape }));
      expect(Math.abs(grey - 128), shape).toBeLessThan(12);
    }
  });

  it("inverts, keeps transparency and is deterministic", () => {
    const dark = solid(32, 32, [0, 0, 0]);
    expect(mean(applyHalftone(dark, { ...HALFTONE, invert: true }))).toBe(255);
    const clear = applyHalftone(solid(32, 32, [255, 255, 255]), {
      ...HALFTONE,
      paper: "transparent",
    });
    expect(mean(clear, 3)).toBe(0);
    const a = applyHalftone(photo, HALFTONE);
    expect(pixelDigest(applyHalftone(photo, HALFTONE))).toBe(pixelDigest(a));
  });

  it("fades tiny cells to the flat tone instead of darkening them", () => {
    const grey = solid(64, 64, [191, 191, 191]);
    const tiny = mean(applyHalftone(grey, { ...HALFTONE, cell: 1 }));
    expect(Math.abs(tiny - 191)).toBeLessThan(6);
  });

  it("anti-aliases plate rows between 0 and 1", () => {
    const plate = halftonePlate(photo, HALFTONE);
    const row = new Float32Array(photo.width);
    plateRow(plate, 40, row);
    expect(Math.min(...row)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...row)).toBeLessThanOrEqual(1);
    expect(row.some((v) => v > 0 && v < 1)).toBe(true);
  });
});

describe("halftoneSvg", () => {
  it.each(HALFTONE_SHAPES)("draws %s cells as compact paths in design units", (shape) => {
    const svg = halftoneSvg(photo, { ...HALFTONE, shape }, { width: 480, height: 320 });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="480" height="320"/);
    expect(svg).toContain('<rect width="480" height="320" fill="#ffffff"/>');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    if (shape === "line") expect(svg).toMatch(/<path d="M[-\d.]+ [-\d.]+H/);
    else expect(svg).toMatch(/stroke-width="[\d.]+" d="M[-\d.]+ [-\d.]+h0/);
    if (shape === "diamond") expect(svg).toContain("rotate(45)");
  });

  it("leaves the paper out when transparent and stays near the cell estimate", () => {
    const svg = halftoneSvg(photo, { ...HALFTONE, paper: "transparent" }, photo);
    expect(svg).not.toContain("<rect");
    const plate = halftonePlate(photo, HALFTONE);
    expect(plateShapeCount(plate)).toBeLessThanOrEqual(screenCells(plate.screen));
    expect(halftoneCellEstimate(240, 160, 8)).toBe(33 * 23);
    // About 16 bytes per dot.
    expect(svg.length / plateShapeCount(plate)).toBeLessThan(20);
  });
});

describe("CMYK", () => {
  it("separates with grey component replacement", () => {
    const out = new Float32Array(4);
    rgbToCmyk(0.5, 0.5, 0.5, 1, out);
    expect([...out]).toEqual([0, 0, 0, 0.5]);
    rgbToCmyk(0.5, 0.5, 0.5, 0, out);
    expect([...out]).toEqual([0.5, 0.5, 0.5, 0]);
    rgbToCmyk(1, 0, 0, 1, out);
    expect([...out]).toEqual([0, 1, 1, 0]);
    rgbToCmyk(0, 0, 0, 1, out);
    expect([...out]).toEqual([0, 0, 0, 1]);
  });

  it("multiplies the inks onto the paper", () => {
    const red = applyCmykHalftone(solid(64, 64, [255, 0, 0]), CMYK);
    expect(mean(red, 0)).toBeGreaterThan(240);
    expect(mean(red, 1)).toBeLessThan(25);
    const white = applyCmykHalftone(solid(32, 32, [255, 255, 255]), { ...CMYK, paper: "#f0e8d8" });
    expect([mean(white, 0), mean(white, 1), mean(white, 2)]).toEqual([0xf0, 0xe8, 0xd8]);
  });

  it("shifts plates, drops disabled inks and is deterministic", () => {
    const plates = cmykPlates(photo, {
      ...CMYK,
      offsets: { ...CMYK.offsets, m: [12, 0] },
      enabled: { c: true, m: true, y: false, k: true },
    });
    expect(plates).toHaveLength(3);
    expect(plates[1]?.dx).toBe(12);
    // The offset grows the margin, so the shifted edge stays printed.
    expect(plates[1]?.screen.cols).toBeGreaterThan(halftoneScreen(240, 160, 8, 75).cols);
    const a = pixelDigest(applyCmykHalftone(photo, CMYK));
    expect(pixelDigest(applyCmykHalftone(photo, CMYK))).toBe(a);
  });

  it("writes one multiply group per ink", () => {
    const svg = cmykHalftoneSvg(photo, CMYK, { width: 480, height: 320 });
    expect(svg.match(/mix-blend-mode:multiply/g)).toHaveLength(4);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });
});
