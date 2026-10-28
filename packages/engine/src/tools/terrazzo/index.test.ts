import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  TERRAZZO_CHIPS_MAX,
  TERRAZZO_SPECKLES_MAX,
  terrazzoBody,
  terrazzoClasses,
  terrazzoLayout,
  terrazzoSvg,
  terrazzoTileSvg,
  terrazzoWeights,
  type TerrazzoLayoutOptions,
} from "./index";

const options = (patch: Partial<TerrazzoLayoutOptions> = {}): TerrazzoLayoutOptions => ({
  width: 400,
  height: 300,
  wrap: true,
  rng: createRng(1),
  colors: ["#e07a5f", "#3d405b", "#81b29a"],
  dominance: 0.3,
  shape: "mixed",
  chipSize: 30,
  sizeClasses: 3,
  sizeVariance: 0.4,
  density: 0.45,
  irregularity: 0.6,
  gap: 2,
  speckles: 0.5,
  ...patch,
});

describe("terrazzoWeights", () => {
  it("is even at 0 and favours the first colour with dominance", () => {
    expect(terrazzoWeights(4, 0)).toEqual([0.25, 0.5, 0.75, 1]);
    const w = terrazzoWeights(3, 0.5);
    expect(w[0]).toBeCloseTo(4 / 7);
    expect(w[2]).toBeCloseTo(1);
  });
});

describe("terrazzoClasses", () => {
  it("gives every class the same area share and respects the chip cap", () => {
    const classes = terrazzoClasses(options());
    expect(classes.map((c) => Math.round(c.radius * 1000) / 1000)).toEqual([30, 15, 7.2]);
    const [a, b] = classes;
    if (!a || !b) throw new Error("missing classes");
    expect(b.count / a.count).toBeCloseTo(4, 0);
    const huge = terrazzoClasses(options({ width: 8192, height: 8192, chipSize: 4 }));
    expect(huge.reduce((s, c) => s + c.count, 0)).toBeLessThanOrEqual(TERRAZZO_CHIPS_MAX);
    expect(huge[0]?.radius ?? 0).toBeGreaterThan(4);
    expect(terrazzoClasses(options({ sizeClasses: 2 })).map((c) => c.radius)).toEqual([30, 13.5]);
  });
});

describe("terrazzoLayout", () => {
  it.each([true, false])("places chips without overlap (wrap %s)", (wrap) => {
    for (let seed = 1; seed <= 4; seed++) {
      const o = options({ wrap, rng: createRng(seed) });
      const { chips } = terrazzoLayout(o);
      expect(chips.length).toBeGreaterThan(50);
      let overlaps = 0;
      for (let i = 0; i < chips.length; i++) {
        const a = chips[i];
        if (!a) continue;
        // Every vertex stays inside the bounding circle.
        for (const p of a.poly)
          expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThanOrEqual(a.r + 1e-9);
        for (let j = i + 1; j < chips.length; j++) {
          const b = chips[j];
          if (!b) continue;
          let dx = Math.abs(a.x - b.x);
          let dy = Math.abs(a.y - b.y);
          if (wrap) {
            dx = Math.min(dx, o.width - dx);
            dy = Math.min(dy, o.height - dy);
          }
          if (Math.hypot(dx, dy) < a.r + b.r + o.gap - 1e-9) overlaps++;
        }
      }
      expect(overlaps).toBe(0);
    }
  });

  it("uses palette colours, more of the first one with dominance", () => {
    const { chips } = terrazzoLayout(options({ dominance: 0.8, speckles: 0 }));
    const count = (c: string) => chips.filter((x) => x.color === c).length;
    expect(count("#e07a5f")).toBeGreaterThan(count("#3d405b"));
    expect(count("#3d405b")).toBeGreaterThan(count("#81b29a"));
    expect(chips.every((c) => ["#e07a5f", "#3d405b", "#81b29a"].includes(c.color))).toBe(true);
  });

  it("adds speckles as circles and caps them", () => {
    const none = terrazzoLayout(options({ speckles: 0 }));
    expect(none.chips.every((c) => c.poly.length > 0)).toBe(true);
    const many = terrazzoLayout(options({ width: 2000, height: 2000, speckles: 1 }));
    const speckles = many.chips.filter((c) => c.poly.length === 0);
    expect(speckles.length).toBeGreaterThan(100);
    expect(speckles.length).toBeLessThanOrEqual(TERRAZZO_SPECKLES_MAX);
  });

  it("keeps places and colours when the outline options change", () => {
    const a = terrazzoLayout(options({ irregularity: 0, shape: "angular" }));
    const b = terrazzoLayout(options({ irregularity: 1, shape: "pebble" }));
    expect(b.chips.map((c) => [c.x, c.y, c.r, c.color])).toEqual(
      a.chips.map((c) => [c.x, c.y, c.r, c.color]),
    );
    expect(b.chips.some((c) => c.smooth)).toBe(true);
    expect(a.chips.some((c) => c.smooth)).toBe(false);
  });
});

describe("terrazzo SVG", () => {
  it("draws wrap copies so the tile repeats without seams", () => {
    const layout = terrazzoLayout(options({ speckles: 0 }));
    const crossing = layout.chips.filter((c) => c.x - c.r < 0 || c.x + c.r > layout.width);
    expect(crossing.length).toBeGreaterThan(0);
    const subpaths = (terrazzoBody(layout).match(/M/g) ?? []).length;
    expect(subpaths).toBeGreaterThan(layout.chips.length);
    const flat = terrazzoBody({ ...layout, wrap: false });
    expect((flat.match(/M/g) ?? []).length).toBe(layout.chips.length);
  });

  it("renders one path per colour, a tile and a repeating pattern", () => {
    const layout = terrazzoLayout(options());
    const tile = terrazzoTileSvg({ layout, background: "#f2ede4", grain: null });
    expect(tile).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="400" height="300"/);
    expect((tile.match(/<path /g) ?? []).length).toBe(3);
    const full = terrazzoSvg({
      layout,
      background: "#f2ede4",
      grain: null,
      width: 1000,
      height: 700,
    });
    expect(full).toContain('patternUnits="userSpaceOnUse"');
    expect(full).toContain('width="1000" height="700"');
    const grain = {
      href: "data:image/png;base64,AAAA",
      edge: 128,
      opacity: 0.1,
      blend: "overlay" as const,
    };
    expect(
      terrazzoSvg({ layout, background: "#f2ede4", grain, width: 500, height: 500 }),
    ).toContain("mix-blend-mode:overlay");
    const plain = terrazzoLayout(options({ wrap: false }));
    expect(
      terrazzoSvg({ layout: plain, background: "#000000", grain: null, width: 400, height: 300 }),
    ).not.toContain("<pattern");
  });

  it("is deterministic and stays small at the caps", () => {
    const run = () =>
      terrazzoTileSvg({ layout: terrazzoLayout(options()), background: "#ffffff", grain: null });
    expect(run()).toBe(run());
    const big = terrazzoTileSvg({
      layout: terrazzoLayout(
        options({ width: 1600, height: 1600, chipSize: 4, speckles: 1, density: 0.7 }),
      ),
      background: "#ffffff",
      grain: null,
    });
    expect(big.length).toBeLessThan(1_500_000);
  });
});
