import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import {
  bentoHtml,
  bentoLayout,
  bentoSvg,
  bentoTailwind,
  normalizeBentoOptions,
  paintTiles,
  tileRect,
  type BentoLayoutOptions,
  type BentoTile,
} from "./index";

/** Cell owner map (-1 = gap); throws on overlap or tiles outside the grid. Plain checks: it runs thousands of times. */
function coverage(tiles: readonly BentoTile[], columns: number, rows: number): number[] {
  const owner = new Array<number>(columns * rows).fill(-1);
  tiles.forEach((t, i) => {
    if (t.colSpan < 1 || t.rowSpan < 1) throw new Error(`empty tile ${JSON.stringify(t)}`);
    if (t.col < 0 || t.row < 0 || t.col + t.colSpan > columns || t.row + t.rowSpan > rows) {
      throw new Error(`tile outside the grid ${JSON.stringify(t)}`);
    }
    for (let y = t.row; y < t.row + t.rowSpan; y++) {
      for (let x = t.col; x < t.col + t.colSpan; x++) {
        if (owner[y * columns + x] !== -1) throw new Error(`overlap at ${x},${y}`);
        owner[y * columns + x] = i;
      }
    }
  });
  return owner;
}

const base: BentoLayoutOptions = { columns: 4, rows: 3, tiles: 6, minSpan: 1, maxSpan: 3 };

describe("bentoLayout", () => {
  it("covers the grid without gaps or overlaps", () => {
    const { tiles } = bentoLayout(createRng(1), base);
    expect(coverage(tiles, 4, 3)).not.toContain(-1);
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(bentoLayout(createRng(5), base)).toEqual(bentoLayout(createRng(5), base));
    const layouts = new Set(
      Array.from({ length: 20 }, (_, s) => JSON.stringify(bentoLayout(createRng(s), base).tiles)),
    );
    expect(layouts.size).toBeGreaterThan(5);
  });

  it("returns tiles in reading order", () => {
    const { tiles } = bentoLayout(createRng(9), { ...base, columns: 6, rows: 5, tiles: 10 });
    const keys = tiles.map((t) => t.row * 100 + t.col);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it("hits the target count when the spans allow it", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { tiles, method } = bentoLayout(createRng(seed), base);
      expect(method).toBe("guillotine");
      expect(tiles).toHaveLength(6);
    }
  });

  it("splits oversized tiles even past the target count", () => {
    const { tiles } = bentoLayout(createRng(2), {
      ...base,
      columns: 8,
      rows: 8,
      tiles: 1,
      maxSpan: 2,
    });
    for (const t of tiles) expect(Math.max(t.colSpan, t.rowSpan)).toBeLessThanOrEqual(2);
    expect(tiles.length).toBeGreaterThanOrEqual(16);
  });

  it("falls back to largest-first plus 1 × 1 when cuts cannot meet the spans", () => {
    // 3 columns, every tile 2 wide: impossible with cuts.
    const o = { columns: 3, rows: 4, tiles: 4, minSpan: 2, maxSpan: 2 };
    const { tiles, method } = bentoLayout(createRng(1), o);
    expect(method).toBe("fallback");
    expect(coverage(tiles, 3, 4)).not.toContain(-1);
    for (const t of tiles) expect(Math.max(t.colSpan, t.rowSpan)).toBeLessThanOrEqual(2);
  });

  it("clamps invalid options", () => {
    expect(
      normalizeBentoOptions({ columns: 0, rows: 99, tiles: 1e9, minSpan: 5, maxSpan: 2 }),
    ).toEqual({ columns: 1, rows: 12, tiles: 12, minSpan: 5, maxSpan: 5 });
    expect(normalizeBentoOptions({ ...base, columns: Number.NaN }).columns).toBe(1);
  });

  // Property test over many seeds and grid shapes.
  it("keeps every invariant over 2000 random configurations", () => {
    const meta = createRng(2026);
    const failures: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const columns = meta.int(2, 8);
      const rows = meta.int(2, 8);
      const o = normalizeBentoOptions({
        columns,
        rows,
        tiles: meta.int(1, 64),
        minSpan: meta.int(1, 4),
        maxSpan: meta.int(1, 8),
      });
      const seed = meta.int(0, 1_000_000);
      const a = bentoLayout(createRng(seed), o);
      const fail = (why: string) => failures.push(`${why}: ${JSON.stringify({ o, seed })}`);
      if (JSON.stringify(bentoLayout(createRng(seed), o)) !== JSON.stringify(a))
        fail("not deterministic");
      if (coverage(a.tiles, columns, rows).includes(-1)) fail("gap");
      for (const t of a.tiles) {
        // maxSpan always holds.
        if (t.colSpan > o.maxSpan || t.rowSpan > o.maxSpan) fail("maxSpan");
        // minSpan holds for guillotine layouts wherever the grid itself is large enough.
        if (
          a.method === "guillotine" &&
          (t.colSpan < Math.min(o.minSpan, columns) || t.rowSpan < Math.min(o.minSpan, rows))
        ) {
          fail("minSpan");
        }
      }
      // More tiles than asked only when maxSpan forced the cuts.
      if (a.method === "guillotine" && a.tiles.length > o.tiles) {
        const forced = Math.ceil(columns / o.maxSpan) * Math.ceil(rows / o.maxSpan);
        if (a.tiles.length < forced) fail("overshoot");
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("bento output", () => {
  const style = {
    width: 1000,
    height: 600,
    columns: 4,
    rows: 3,
    gap: 20,
    padding: 40,
    radius: 16,
    background: "#ffffff",
  };
  const layout = bentoLayout(createRng(3), base).tiles;
  const tiles = paintTiles(createRng(1), layout, ["#111111", "#eeeeee"], "palette-order", "lines");

  it("places tiles on CSS grid tracks", () => {
    // Cell width (1000 - 80 - 60) / 4 = 215, height (600 - 80 - 40) / 3 = 160.
    expect(tileRect({ col: 1, row: 2, colSpan: 2, rowSpan: 1 }, style)).toEqual({
      x: 40 + 235,
      y: 40 + 360,
      width: 450,
      height: 160,
    });
  });

  it("paints in palette order with contrasting ink", () => {
    expect(tiles.map((t) => t.color)).toEqual(
      tiles.map((_, i) => (i % 2 === 0 ? "#111111" : "#eeeeee")),
    );
    expect(tiles[0]?.ink).toBe("#ffffff");
    expect(tiles[1]?.ink).toBe("#000000");
  });

  it("never repeats a colour twice in a row in random mode", () => {
    const many = bentoLayout(createRng(4), {
      columns: 8,
      rows: 8,
      tiles: 40,
      minSpan: 1,
      maxSpan: 3,
    });
    const random = paintTiles(
      createRng(8),
      many.tiles,
      ["#000000", "#ffffff", "#ff0000"],
      "palette-random",
      "empty",
    );
    for (let i = 1; i < random.length; i++) expect(random[i]?.color).not.toBe(random[i - 1]?.color);
  });

  it("draws one rounded rect per tile in SVG", () => {
    const svg = bentoSvg(tiles, style);
    expect(svg.match(/<rect [^>]*rx="16"/g)).toHaveLength(tiles.length);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("writes CSS grid code with explicit areas and a narrow layout", () => {
    const html = bentoHtml(tiles, { ...style, breakpointColumns: 2, breakpoint: 768 });
    expect(html).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(html).toContain("grid-template-rows: repeat(3, minmax(0, 1fr));");
    expect(html).toContain("@media (max-width: 767.98px)");
    expect(html).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(html.match(/<div style="--col: /g)).toHaveLength(tiles.length);
    for (const t of tiles) {
      expect(html).toContain(
        `--col: ${t.col + 1}; --row: ${t.row + 1}; --col-span: ${t.colSpan}; --row-span: ${t.rowSpan}; --narrow-span: ${Math.min(t.colSpan, 2)};`,
      );
    }
  });

  it("writes Tailwind classes with md: areas", () => {
    const html = bentoTailwind(tiles, { ...style, breakpointColumns: 1, breakpoint: 768 });
    expect(html).toContain("md:grid-cols-[repeat(4,minmax(0,1fr))]");
    expect(html).toContain("md:aspect-[1000/600]");
    for (const t of tiles) {
      expect(html).toContain(
        `col-span-1 md:col-[${t.col + 1}/span_${t.colSpan}] md:row-[${t.row + 1}/span_${t.rowSpan}]`,
      );
    }
  });
});
