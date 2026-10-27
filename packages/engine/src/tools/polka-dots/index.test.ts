import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { distance } from "../../vec";
import { type PolkaDotsSvgOptions, dotSites, polkaDotsSvg } from "./index";

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
