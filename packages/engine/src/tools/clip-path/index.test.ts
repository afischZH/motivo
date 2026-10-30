import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  CLIP_SHAPES,
  CLIP_SIDES,
  clipPathCss,
  clipPathD,
  clipPathSvg,
  clipPathSvgSnippet,
  clipShape,
  sampleCubicPath,
  type ClipShapeOptions,
} from "./index";

const base: Omit<ClipShapeOptions, "rng"> = {
  shape: "polygon",
  sides: 6,
  innerRadius: 50,
  rotation: 0,
  randomness: 40,
  waves: 3,
  depth: 15,
  side: "bottom",
};

const shapeOf = (o: Partial<ClipShapeOptions> = {}) =>
  clipShape({ ...base, rng: createRng(1), ...o });

describe("clip-path shapes", () => {
  it.each(CLIP_SHAPES)("keeps every point of %s inside the unit box", (shape) => {
    for (const side of CLIP_SIDES) {
      const s = shapeOf({ shape, side });
      expect(s.polygon.length).toBeGreaterThanOrEqual(3);
      for (const p of s.polygon) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("stretches polygons, stars and blobs to fill the box", () => {
    for (const shape of ["polygon", "star", "blob"] as const) {
      const { polygon } = shapeOf({ shape, sides: 5 });
      const xs = polygon.map((p) => p.x);
      const ys = polygon.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(0, 6);
      expect(Math.max(...xs)).toBeCloseTo(1, 6);
      expect(Math.min(...ys)).toBeCloseTo(0, 6);
      expect(Math.max(...ys)).toBeCloseTo(1, 6);
    }
  });

  it("writes a triangle as the classic polygon", () => {
    expect(clipPathCss(shapeOf({ sides: 3 }))).toBe("polygon(50% 0%, 100% 100%, 0% 100%)");
  });

  it("writes the ellipse with ellipse()", () => {
    expect(clipPathCss(shapeOf({ shape: "ellipse" }))).toBe("ellipse(50% 50% at 50% 50%)");
  });

  it("places the slant on the chosen side", () => {
    expect(clipPathCss(shapeOf({ shape: "slant", depth: 20 }))).toBe(
      "polygon(0% 0%, 100% 0%, 100% 80%, 0% 100%)",
    );
    expect(clipPathCss(shapeOf({ shape: "slant", depth: 20, side: "top" }))).toBe(
      "polygon(0% 100%, 100% 100%, 100% 20%, 0% 0%)",
    );
  });

  it("gives a plain rectangle for cut corners with depth 0", () => {
    expect(clipPathCss(shapeOf({ shape: "notch", depth: 0 }))).toBe(
      "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
    );
  });

  it("makes the blob depend on the rng only", () => {
    const a = clipPathCss(clipShape({ ...base, shape: "blob", rng: createRng(1) }));
    const b = clipPathCss(clipShape({ ...base, shape: "blob", rng: createRng(1) }));
    const c = clipPathCss(clipShape({ ...base, shape: "blob", rng: createRng(2) }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("keeps curves as cubic segments in the SVG path", () => {
    expect(clipPathD(shapeOf({ shape: "blob" }))).toContain("C");
    expect(clipPathD(shapeOf({ shape: "polygon" }))).not.toContain("C");
  });

  it("samples a closed cubic path without repeating the start", () => {
    const { curve } = shapeOf({ shape: "ellipse" });
    expect(curve).not.toBeNull();
    if (curve) expect(sampleCubicPath(curve, 4)).toHaveLength(16);
  });

  it("escapes the id of the SVG snippet", () => {
    const svg = clipPathSvgSnippet(shapeOf(), 'a"b');
    expect(svg).toContain('id="a&quot;b"');
    expect(svg).toContain('clipPathUnits="objectBoundingBox"');
  });
});

describe("clip-path svg", () => {
  const svgOf = (o: Partial<Parameters<typeof clipPathSvg>[0]> = {}) =>
    clipPathSvg({
      ...base,
      rng: createRng(1),
      width: 400,
      height: 300,
      colors: ["#111111", "#eeeeee"],
      gradientAngle: 90,
      background: "transparent",
      showBox: false,
      imageHref: null,
      ...o,
    });

  it("draws the shape in pixels with a gradient", () => {
    const svg = svgOf();
    expect(svg).toContain('width="400" height="300"');
    expect(svg).toContain("linearGradient");
    expect(svg).not.toContain("<image");
  });

  it("shows the uncut box faintly when asked", () => {
    expect(svgOf({ showBox: true })).toContain('opacity="0.14"');
  });

  it("clips the picture and escapes its address", () => {
    const svg = svgOf({ imageHref: 'data:image/png;base64,AA"' });
    expect(svg).toContain("<image");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("clip-path=");
  });
});
