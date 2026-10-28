import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  STRIPES_MAX,
  STRIPES_MIN,
  type StripedGradientOptions,
  stripedBands,
  stripedGradientSvg,
} from "./index";

const opts = (o: Partial<StripedGradientOptions> = {}): StripedGradientOptions => ({
  width: 600,
  height: 400,
  colors: ["#ff0000", "#00ff00", "#0000ff"],
  stripes: 6,
  offset: 0.3,
  variance: 0,
  shading: 0,
  alternate: false,
  rng: createRng(1),
  ...o,
});

describe("stripedBands", () => {
  it("clamps the count and tiles the width without gaps", () => {
    expect(stripedBands(opts({ stripes: 1 }))).toHaveLength(STRIPES_MIN);
    expect(stripedBands(opts({ stripes: 500 }))).toHaveLength(STRIPES_MAX);
    const bands = stripedBands(opts({ variance: 1 }));
    let x = 0;
    for (const b of bands) {
      expect(b.x).toBeCloseTo(x, 9);
      x += b.width;
    }
    expect(x).toBeCloseTo(600, 9);
  });

  it("has equal widths without variance and varied widths with it", () => {
    const even = stripedBands(opts()).map((b) => b.width);
    for (const w of even) expect(w).toBeCloseTo(100, 9);
    const varied = stripedBands(opts({ variance: 1 })).map((b) => b.width);
    expect(Math.max(...varied) - Math.min(...varied)).toBeGreaterThan(20);
  });

  it("shifts each gradient within the offset and always covers the canvas", () => {
    for (const b of stripedBands(opts({ offset: 0.5, stripes: 12 }))) {
      expect(b.y1).toBeLessThanOrEqual(0);
      expect(b.y1).toBeGreaterThanOrEqual(-200);
      expect(b.y2).toBeGreaterThanOrEqual(400);
      expect(b.y2 - b.y1).toBeCloseTo(600, 9);
    }
    for (const b of stripedBands(opts({ offset: 0 }))) expect([b.y1, b.y2]).toEqual([0, 400]);
  });

  it("keeps the shifts when the width variance changes", () => {
    const a = stripedBands(opts({ variance: 0 })).map((b) => b.y1);
    expect(stripedBands(opts({ variance: 0.8 })).map((b) => b.y1)).toEqual(a);
  });
});

describe("stripedGradientSvg", () => {
  it("draws one rect and one vertical gradient per band", () => {
    const svg = stripedGradientSvg(opts());
    expect(svg.match(/<rect /g)).toHaveLength(6);
    expect(svg.match(/<linearGradient /g)).toHaveLength(6);
    expect(svg).toContain('x1="0" y1="');
    expect(svg).toContain('<stop offset="0.5" stop-color="#00ff00"/>');
    expect(svg).not.toContain("<filter");
  });

  it("overlaps neighbouring bands by one unit, except the last", () => {
    const svg = stripedGradientSvg(opts());
    expect(svg).toContain('<rect x="0" width="101" height="400"');
    expect(svg).toContain('<rect x="500" width="100" height="400"');
  });

  it("mirrors every second band when alternating", () => {
    const svg = stripedGradientSvg(opts({ alternate: true }));
    expect(svg).toContain('<stop offset="0" stop-color="#0000ff"/>');
    expect(svg).toContain('<stop offset="0" stop-color="#ff0000"/>');
  });

  it("adds one shared shading gradient and a shading rect per band", () => {
    const svg = stripedGradientSvg(opts({ shading: 1 }));
    const id = /<linearGradient id="(s\w+)" x1="0" y1="0" x2="1" y2="0">/.exec(svg)?.[1];
    expect(id).toBeDefined();
    expect(svg.match(new RegExp(`fill="url\\(#${id ?? "?"}\\)"`, "g"))).toHaveLength(6);
    expect(svg).toContain('<stop offset="0" stop-color="#fff" stop-opacity="0.45"/>');
  });

  it("puts the grain on top", () => {
    const svg = stripedGradientSvg(
      opts({
        grain: { href: "data:image/png;base64,AAAA", edge: 128, opacity: 0.1, blend: "overlay" },
      }),
    );
    expect(svg.endsWith('style="mix-blend-mode:overlay"/></svg>')).toBe(true);
  });
});
