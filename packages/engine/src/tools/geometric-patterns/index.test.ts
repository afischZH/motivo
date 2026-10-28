import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { shapeLayers } from "../../shapes";
import {
  GEOMETRIC_CELL_ID_PATTERN,
  GEOMETRIC_MAX_TILES,
  GEOMETRIC_MIN_TILE,
  geometricGrid,
  geometricInnerBox,
  geometricPatternSvg,
  geometricSeed,
  geometricTiles,
  type GeometricCell,
  type GeometricGridOptions,
  type GeometricTilesOptions,
} from "./index";

const base: GeometricGridOptions = {
  width: 800,
  height: 600,
  gridMode: "uniform",
  columns: 8,
  depth: 2,
  splitChance: 0.5,
  seed: 1,
};

/**
 * Rasterises the cells onto a 1 px grid of the canvas and checks that every
 * pixel centre is covered exactly once (no gaps, no overlaps).
 */
function expectExactCover(cells: readonly GeometricCell[], width: number, height: number) {
  const step = 1;
  const counts = new Uint16Array(Math.ceil(width / step) * Math.ceil(height / step));
  const cols = Math.ceil(width / step);
  for (const c of cells) {
    const x0 = Math.ceil(c.x / step - 0.5);
    const x1 = Math.ceil((c.x + c.width) / step - 0.5);
    const y0 = Math.ceil(c.y / step - 0.5);
    const y1 = Math.ceil((c.y + c.height) / step - 0.5);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) counts[y * cols + x] = (counts[y * cols + x] ?? 0) + 1;
    }
  }
  let bad = 0;
  for (const v of counts) if (v !== 1) bad++;
  expect(bad).toBe(0);
  const area = cells.reduce((sum, c) => sum + c.width * c.height, 0);
  expect(area).toBeCloseTo(width * height, 3);
}

describe("geometricGrid", () => {
  it("covers the canvas exactly in uniform mode", () => {
    const grid = geometricGrid(base);
    expect(grid.columns).toBe(8);
    expect(grid.rows).toBe(6);
    expect(grid.cells).toHaveLength(48);
    expectExactCover(grid.cells, 800, 600);
  });

  it("covers the canvas exactly in dynamic mode, for many seeds and sizes", () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const [w, h] of [
        [800, 600],
        [333, 517],
        [1200, 630],
      ] as const) {
        const grid = geometricGrid({
          ...base,
          width: w,
          height: h,
          gridMode: "dynamic",
          columns: 5,
          depth: 3,
          seed,
        });
        expectExactCover(grid.cells, w, h);
      }
    }
  });

  it("stretches cells only slightly so whole cells fill odd sizes", () => {
    const grid = geometricGrid({ ...base, width: 1000, height: 640, columns: 7 });
    expect(grid.rows).toBe(Math.round(640 / (1000 / 7)));
    const ratio = grid.cellWidth / grid.cellHeight;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.18);
  });

  it("splits only in dynamic mode, at most `depth` levels, never below the minimum size", () => {
    expect(geometricGrid({ ...base, splitChance: 1 }).cells.every((c) => c.level === 0)).toBe(true);
    const all = geometricGrid({ ...base, gridMode: "dynamic", depth: 2, splitChance: 1 });
    expect(all.cells).toHaveLength(48 * 16);
    expect(all.cells.every((c) => c.level === 2)).toBe(true);
    const none = geometricGrid({ ...base, gridMode: "dynamic", depth: 3, splitChance: 0 });
    expect(none.cells).toHaveLength(48);
    const tiny = geometricGrid({
      ...base,
      width: 64,
      height: 64,
      columns: 2,
      gridMode: "dynamic",
      depth: 4,
      splitChance: 1,
    });
    expect(Math.min(...tiny.cells.map((c) => c.width))).toBeGreaterThanOrEqual(GEOMETRIC_MIN_TILE);
  });

  it("mixes sizes for a medium split chance", () => {
    const grid = geometricGrid({ ...base, gridMode: "dynamic", depth: 2, splitChance: 0.5 });
    const levels = new Set(grid.cells.map((c) => c.level));
    expect(levels.size).toBeGreaterThan(1);
  });

  it("is deterministic per seed and varies across seeds", () => {
    const opts = { ...base, gridMode: "dynamic" as const, depth: 3 };
    expect(geometricGrid(opts)).toEqual(geometricGrid(opts));
    const layouts = new Set(
      Array.from({ length: 10 }, (_, seed) =>
        geometricGrid({ ...opts, seed })
          .cells.map((c) => c.id)
          .join(","),
      ),
    );
    expect(layouts.size).toBeGreaterThan(5);
  });

  it("caps the tile count for extreme params", () => {
    const tall = geometricGrid({ ...base, width: 400, height: 8000, columns: 40 });
    expect(tall.cells.length).toBeLessThanOrEqual(GEOMETRIC_MAX_TILES);
    const deep = geometricGrid({
      ...base,
      width: 8000,
      height: 8000,
      columns: 40,
      gridMode: "dynamic",
      depth: 4,
      splitChance: 1,
    });
    expect(deep.cells.length).toBeLessThanOrEqual(GEOMETRIC_MAX_TILES);
    const silly = geometricGrid({
      ...base,
      columns: Number.NaN,
      depth: Number.POSITIVE_INFINITY,
      splitChance: -1,
    });
    expect(silly.cells.length).toBeGreaterThan(0);
    expectExactCover(silly.cells, 800, 600);
  });

  it("names cells by grid position and quadrant path", () => {
    const grid = geometricGrid({ ...base, gridMode: "dynamic", depth: 2, splitChance: 0.6 });
    for (const c of grid.cells) {
      expect(c.id).toMatch(GEOMETRIC_CELL_ID_PATTERN);
      expect(c.id.startsWith(`${c.row}-${c.col}`)).toBe(true);
      expect(c.id.split(".").length - 1).toBe(c.level);
    }
    expect(new Set(grid.cells.map((c) => c.id)).size).toBe(grid.cells.length);
    expect(geometricGrid(base).cells[9]?.id).toBe("1-1");
  });

  it("keeps cell ids when only the size changes the cell size", () => {
    const a = geometricGrid(base).cells.map((c) => c.id);
    const b = geometricGrid({ ...base, width: 1600, height: 1200 }).cells.map((c) => c.id);
    expect(b).toEqual(a);
    const dynA = geometricGrid({ ...base, gridMode: "dynamic" }).cells.map((c) => c.id);
    const dynB = geometricGrid({ ...base, gridMode: "dynamic", width: 1600, height: 1200 }).cells;
    expect(dynB.map((c) => c.id)).toEqual(dynA);
  });
});

describe("geometricSeed", () => {
  it("takes one draw from the render rng", () => {
    const rng = createRng(7);
    const seed = geometricSeed(rng);
    expect(seed).toBe(geometricSeed(createRng(7)));
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
  });
});

const tilesBase = (cells: readonly GeometricCell[]): GeometricTilesOptions => ({
  cells,
  seed: 3,
  shapes: ["circle", "square", "quarter-circle", "cube"],
  palette: ["#111111", "#222222", "#333333"],
  colorMode: "tile",
  rotationMode: "quarter",
  tileFill: true,
});

describe("geometricTiles", () => {
  const cells = geometricGrid(base).cells;

  it("is deterministic and uses only the given shapes and colours", () => {
    const a = geometricTiles(tilesBase(cells));
    expect(a).toEqual(geometricTiles(tilesBase(cells)));
    for (const t of a) {
      expect(["circle", "square", "quarter-circle", "cube"]).toContain(t.shape);
      expect(["#111111", "#222222", "#333333"]).toContain(t.color);
      expect(t.fill).not.toBe(t.color);
      expect(t.rotation % 90).toBe(0);
      expect(t.edited).toBe(false);
    }
    expect(new Set(a.map((t) => t.shape)).size).toBeGreaterThan(1);
  });

  it("keeps every other tile when one option or one cell changes", () => {
    const a = geometricTiles(tilesBase(cells));
    const b = geometricTiles({ ...tilesBase(cells), overrides: { "2-3": { shape: "heart" } } });
    const differ = a.filter((t, i) => JSON.stringify(t) !== JSON.stringify(b[i]));
    expect(differ.map((t) => t.id)).toEqual(["2-3"]);
    // Rotation mode does not change shapes or colours.
    const c = geometricTiles({ ...tilesBase(cells), rotationMode: "none" });
    expect(c.map((t) => t.shape + t.color)).toEqual(a.map((t) => t.shape + t.color));
  });

  it("rotates per mode", () => {
    const none = geometricTiles({ ...tilesBase(cells), rotationMode: "none" });
    expect(none.every((t) => t.rotation === 0)).toBe(true);
    const free = geometricTiles({ ...tilesBase(cells), rotationMode: "free" });
    expect(free.some((t) => t.rotation % 90 !== 0)).toBe(true);
    expect(free.every((t) => t.rotation >= 0 && t.rotation < 360)).toBe(true);
  });

  it("colours per layer: the same colours on every tile, fill from the last colour", () => {
    const tiles = geometricTiles({ ...tilesBase(cells), colorMode: "layer" });
    for (const t of tiles) {
      expect(t.color).toBe("#111111");
      expect(t.accent).toBe("#222222");
      expect(t.fill).toBe("#333333");
    }
    const two = geometricTiles({
      ...tilesBase(cells),
      colorMode: "layer",
      palette: ["#111111", "#222222"],
    });
    expect(two[0]?.fill).toBe("#222222");
    expect(two[0]?.color).toBe("#111111");
  });

  it("applies overrides and marks the tile as edited; unknown cells are ignored", () => {
    const tiles = geometricTiles({
      ...tilesBase(cells),
      overrides: {
        "0-0": { shape: "star", color: "#abcdef", rotation: 450 },
        "99-99": { shape: "heart" },
      },
    });
    const t = tiles.find((x) => x.id === "0-0");
    expect(t).toMatchObject({ shape: "star", color: "#abcdef", accent: "#abcdef", rotation: 90 });
    expect(t?.edited).toBe(true);
    expect(tiles.filter((x) => x.edited)).toHaveLength(1);
  });

  it("ignores inherited keys of the override object", () => {
    const overrides = Object.create({ "0-0": { shape: "heart" } }) as Record<string, never>;
    const tiles = geometricTiles({ ...tilesBase(cells), overrides });
    expect(tiles.some((t) => t.edited)).toBe(false);
  });
});

describe("geometricPatternSvg", () => {
  const cells = geometricGrid(base).cells;
  const svgOf = (extra: Partial<Parameters<typeof geometricPatternSvg>[0]> = {}) =>
    geometricPatternSvg({
      width: 800,
      height: 600,
      tiles: geometricTiles(tilesBase(cells)),
      background: "#ffffff",
      padding: 0.1,
      gap: 4,
      duotoneOpacity: 0.5,
      strokeOnly: false,
      strokeWidth: 4,
      ...extra,
    });

  it("draws one use per shape layer and defines each layer once", () => {
    const svg = svgOf();
    expect(svg.startsWith("<svg")).toBe(true);
    const defs = [...svg.matchAll(/<path id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(defs).size).toBe(defs.length);
    const uses = svg.match(/<use /g)?.length ?? 0;
    const tiles = geometricTiles(tilesBase(cells));
    const expected = tiles.reduce((n, t) => n + (shapeLayers(t.shape).accent ? 2 : 1), 0);
    expect(uses).toBe(expected);
    expect(svg).toContain('fill-opacity="0.5"');
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("draws outlines in stroke mode and no fills on shapes", () => {
    const svg = svgOf({ strokeOnly: true });
    expect(svg).toContain('fill="none" stroke="');
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('stroke-opacity="0.5"');
  });

  it("leaves out accent layers at opacity 0 and the background when transparent", () => {
    const svg = svgOf({ duotoneOpacity: 0, background: "transparent" });
    expect(svg).not.toContain('-a"');
    expect(svg).not.toContain('<rect width="800"');
  });

  it("shrinks freely rotated shapes so they stay inside the tile", () => {
    const tiles = geometricTiles({ ...tilesBase(cells), rotationMode: "free" });
    const svg = geometricPatternSvg({
      width: 800,
      height: 600,
      tiles,
      background: "#fff",
      padding: 0,
      gap: 0,
      duotoneOpacity: 1,
      strokeOnly: false,
      strokeWidth: 4,
    });
    expect(svg).toContain("scale(0.7071)");
  });

  it("keeps the inner box inside the cell", () => {
    const box = geometricInnerBox({ x: 10, y: 20, width: 100, height: 80 }, 10, 0.1);
    expect(box.x).toBeGreaterThanOrEqual(10);
    expect(box.y).toBeGreaterThanOrEqual(20);
    expect(box.x + box.width).toBeLessThanOrEqual(110);
    expect(box.y + box.height).toBeLessThanOrEqual(100);
    expect(box.width).toBeCloseTo(90 * 0.8);
  });

  it("draws the largest grid with one use per tile layer", () => {
    const big = geometricGrid({ ...base, width: 1600, height: 1600, columns: 40 });
    expect(big.cells).toHaveLength(GEOMETRIC_MAX_TILES);
    const svg = geometricPatternSvg({
      width: 1600,
      height: 1600,
      tiles: geometricTiles({ ...tilesBase(big.cells), shapes: ["circle"] }),
      background: "#fff",
      padding: 0.1,
      gap: 2,
      duotoneOpacity: 0.5,
      strokeOnly: false,
      strokeWidth: 4,
    });
    expect(svg.match(/<use /g)?.length).toBe(GEOMETRIC_MAX_TILES);
  });
});
