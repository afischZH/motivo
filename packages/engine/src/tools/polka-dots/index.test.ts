import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { distance } from "../../vec";
import {
  DOT_LAYOUTS,
  MAX_DOT_SITES,
  MIN_DOT_SPACING_PX,
  type PolkaDotsSvgOptions,
  dotSites,
  effectiveDotSpacing,
  polkaDotsSvg,
} from "./index";

// Wall-clock timing for performance budgets in tests only; product code stays deterministic.
const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
/** Runs `fn` three times and returns the fastest run in ms plus its result (ignores JIT warm-up and CI noise). */
function fastest<T>(fn: () => T): { ms: number; value: T } {
  let best = Infinity;
  let value = fn();
  for (let i = 0; i < 3; i++) {
    const start = clock.now();
    value = fn();
    best = Math.min(best, clock.now() - start);
  }
  return { ms: best, value };
}

describe("dotSites", () => {
  it("centres a square grid on the canvas and covers the edges", () => {
    const sites = dotSites({
      width: 100,
      height: 100,
      layout: "grid",
      spacing: 20,
      rng: createRng(1),
    });
    expect(sites).toContainEqual({ x: 50, y: 50, row: 0, col: 0 });
    expect(Math.min(...sites.map((s) => s.x))).toBeLessThanOrEqual(0);
    expect(Math.max(...sites.map((s) => s.y))).toBeGreaterThanOrEqual(100);
  });

  it("shifts odd rows and packs rows hexagonally in the offset layout", () => {
    const sites = dotSites({
      width: 100,
      height: 100,
      layout: "offset",
      spacing: 20,
      rng: createRng(1),
    });
    const row1 = sites.find((s) => s.row === 1 && s.col === 0);
    expect(row1?.x).toBe(60);
    expect(row1?.y).toBeCloseTo(50 + 10 * Math.sqrt(3), 9);
  });

  it("keeps scattered dots at least one spacing apart", () => {
    const sites = dotSites({
      width: 200,
      height: 200,
      layout: "scatter",
      spacing: 25,
      rng: createRng(1),
    });
    expect(sites.length).toBeGreaterThan(20);
    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        expect(distance(sites[i] as never, sites[j] as never)).toBeGreaterThanOrEqual(25 - 1e-9);
      }
    }
  });

  it("rejects a non-positive spacing", () => {
    expect(() =>
      dotSites({ width: 10, height: 10, layout: "grid", spacing: 0, rng: createRng(1) }),
    ).toThrow();
  });
});

describe("polkaDotsSvg", () => {
  const opts: PolkaDotsSvgOptions = {
    width: 120,
    height: 80,
    rng: createRng(1),
    background: "#fffaf0",
    colors: ["#e63946", "#1d3557", "#457b9d"],
    layout: "grid",
    shape: "circle",
    colorMode: "single",
    spacing: 20,
    size: 0.5,
    sizeVariance: 0,
    jitter: 0,
  };

  it("groups dots by colour", () => {
    const single = polkaDotsSvg({ ...opts, rng: createRng(1) });
    expect(single.match(/<g /g)).toHaveLength(1);
    expect(single).toContain('<g fill="#e63946">');
    const alternate = polkaDotsSvg({ ...opts, rng: createRng(1), colorMode: "alternate" });
    expect(alternate.match(/<g /g)).toHaveLength(3);
  });

  it("only draws dots that touch the canvas", () => {
    const svg = polkaDotsSvg({ ...opts, rng: createRng(1) });
    // 7 columns (x = 0..120) by 5 rows (y = 0..80) of radius-5 dots.
    expect(svg.match(/<circle /g)).toHaveLength(35);
    expect(svg).toContain('<circle cx="60" cy="40" r="5"/>');
  });

  it("renders rings and squares", () => {
    const rings = polkaDotsSvg({ ...opts, rng: createRng(1), shape: "ring" });
    expect(rings).toContain('<g fill="none" stroke="#e63946" stroke-width="1.5">');
    const squares = polkaDotsSvg({ ...opts, rng: createRng(1), shape: "square" });
    expect(squares).toContain('<rect x="55" y="35" width="10" height="10"/>');
  });

  it("keeps colours stable when size variance changes", () => {
    const colorsOf = (svg: string): string[] =>
      [...svg.matchAll(/<g fill="([^"]+)"/g)].map((m) => m[1] ?? "");
    const a = colorsOf(polkaDotsSvg({ ...opts, rng: createRng(3), colorMode: "random" }));
    const b = colorsOf(
      polkaDotsSvg({ ...opts, rng: createRng(3), colorMode: "random", sizeVariance: 0.5 }),
    );
    expect(a).toEqual(b);
  });

  it("is deterministic for scatter with variance and jitter", () => {
    const o = {
      ...opts,
      layout: "scatter",
      sizeVariance: 0.6,
      jitter: 0.3,
      colorMode: "random",
    } as const;
    expect(polkaDotsSvg({ ...o, rng: createRng(8) })).toBe(
      polkaDotsSvg({ ...o, rng: createRng(8) }),
    );
  });
});

describe("effectiveDotSpacing", () => {
  it("keeps regular spacings unchanged", () => {
    for (const layout of DOT_LAYOUTS) {
      expect(effectiveDotSpacing({ width: 1080, height: 1080, layout, spacing: 21.6 })).toBe(21.6);
      expect(effectiveDotSpacing({ width: 8192, height: 8192, layout, spacing: 163.84 })).toBe(
        163.84,
      );
    }
  });

  it("raises tiny spacings to the pixel floor", () => {
    expect(effectiveDotSpacing({ width: 100, height: 100, layout: "grid", spacing: 0.5 })).toBe(
      MIN_DOT_SPACING_PX,
    );
  });

  it("widens the spacing until the site count is under the cap", () => {
    for (const layout of DOT_LAYOUTS) {
      const s = effectiveDotSpacing({ width: 8192, height: 8192, layout, spacing: 4 });
      expect(s).toBeGreaterThan(4);
      const sites = dotSites({ width: 8192, height: 8192, layout, spacing: 4, rng: createRng(1) });
      expect(sites.length).toBeLessThanOrEqual(MAX_DOT_SITES);
    }
  });
});

describe("polkaDotsSvg size guard", () => {
  // 8192 x 16 with spacing 2 % of the short edge (0.32 px) used to yield about 1.4M dots.
  for (const layout of DOT_LAYOUTS) {
    it(`renders an extreme strip quickly (${layout})`, () => {
      const o: PolkaDotsSvgOptions = {
        width: 8192,
        height: 16,
        rng: createRng(1),
        background: "#ffffff",
        colors: ["#000000"],
        layout,
        shape: "circle",
        colorMode: "single",
        spacing: 0.32,
        size: 0.5,
        sizeVariance: 0,
        jitter: 0,
      };
      expect(dotSites({ ...o, rng: createRng(1) }).length).toBeLessThanOrEqual(MAX_DOT_SITES);
      const { ms, value: svg } = fastest(() => polkaDotsSvg({ ...o, rng: createRng(1) }));
      expect(ms).toBeLessThan(200);
      expect((svg.match(/<circle /g) ?? []).length).toBeLessThanOrEqual(MAX_DOT_SITES);
      expect(svg.length).toBeLessThan(1_000_000);
    });
  }
});
