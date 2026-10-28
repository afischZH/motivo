import { describe, expect, it } from "vitest";
import { createRng } from "../../rng";
import { pathBounds } from "../../shapes";
import { GENERATOR_BUDGET_MS, fastest } from "../../testing/timing";
import {
  SEAMLESS_MAX_CELLS,
  SEAMLESS_MAX_ELEMENTS,
  SEAMLESS_MIN_CELL,
  SEAMLESS_SHAPES,
  SEAMLESS_TILINGS,
  type SeamlessLayout,
  type SeamlessLayoutOptions,
  type SeamlessPlacement,
  type SeamlessTiling,
  seamlessLayout,
  seamlessPatternSvg,
  seamlessShapePath,
  seamlessTileSvg,
  svgBase64DataUri,
} from "./index";

const opts = (o: Partial<SeamlessLayoutOptions> = {}): SeamlessLayoutOptions => ({
  tiling: "grid",
  size: 40,
  spacingX: 20,
  spacingY: 10,
  cells: 3,
  rotation: 15,
  rotationJitter: 40,
  sizeVariance: 0.3,
  jitter: 0.35,
  colorCount: 3,
  aspect: 1,
  rng: createRng(1),
  ...o,
});

const radius = (l: SeamlessLayout, p: SeamlessPlacement) =>
  (Math.hypot(l.boxWidth, l.boxHeight) / 2) * p.scale;

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * The infinite pattern is every base element repeated on the lattice
 * (i·tileWidth, j·tileHeight). The tile must draw exactly the lattice copies
 * that reach into it, each with the same transform: then the tile and its
 * neighbours line up without seams.
 */
function expectWrapsExactly(l: SeamlessLayout) {
  const expected: SeamlessPlacement[] = [];
  for (const b of l.base) {
    const r = radius(l, b);
    for (let j = -3; j <= 3; j++) {
      for (let i = -3; i <= 3; i++) {
        const x = b.x + i * l.tileWidth;
        const y = b.y + j * l.tileHeight;
        const inside =
          x + r > 1e-9 && x - r < l.tileWidth - 1e-9 && y + r > 1e-9 && y - r < l.tileHeight - 1e-9;
        if (inside) expected.push({ ...b, x, y });
      }
    }
  }
  const key = (p: SeamlessPlacement) =>
    [p.base, p.x.toFixed(6), p.y.toFixed(6), p.rotation, p.scale, p.flipX, p.flipY, p.color].join();
  expect(l.placements.map(key).sort()).toEqual(expected.map(key).sort());
}

/** Colours covering a point when every element is a disc of the circle shape (radius 48 %). */
function coverage(l: SeamlessLayout, x: number, y: number): string {
  const hits: number[] = [];
  for (const p of l.placements) {
    const r = 0.48 * l.boxWidth * p.scale;
    if (Math.hypot(p.x - x, p.y - y) < r - 1e-6) hits.push(p.base);
  }
  return hits.sort((a, b) => a - b).join(",");
}

describe("seamlessLayout", () => {
  it.each(SEAMLESS_TILINGS)("%s: the tile contains exactly the wrapped copies", (tiling) => {
    for (const seed of [1, 2, 3]) {
      for (const cells of [1, 2, 3]) {
        expectWrapsExactly(seamlessLayout(opts({ tiling, cells, rng: createRng(seed) })));
      }
    }
    // Large elements with small gaps cross several edges at once.
    expectWrapsExactly(
      seamlessLayout(
        opts({ tiling, size: 80, spacingX: 0, spacingY: 0, sizeVariance: 1, jitter: 0.5 }),
      ),
    );
  });

  it.each(SEAMLESS_TILINGS)(
    "%s: opposite tile edges are covered alike (wraps seamlessly)",
    (tiling) => {
      const l = seamlessLayout(opts({ tiling, size: 60, spacingX: 6, spacingY: 4, jitter: 0.5 }));
      let covered = 0;
      for (let t = 0; t <= 400; t++) {
        const y = (l.tileHeight * t) / 400;
        const x = (l.tileWidth * t) / 400;
        const left = coverage(l, 0, y);
        expect(left).toBe(coverage(l, l.tileWidth, y));
        expect(coverage(l, x, 0)).toBe(coverage(l, x, l.tileHeight));
        if (left !== "") covered++;
      }
      // The check means something: the edge does cross elements.
      expect(covered).toBeGreaterThan(20);
    },
  );

  it("uses whole cells: brick doubles odd rows, half-drop odd columns, mirror both", () => {
    const sizes = (tiling: SeamlessTiling, cells: number) => {
      const l = seamlessLayout(opts({ tiling, cells }));
      return [l.cols, l.rows];
    };
    expect(sizes("grid", 3)).toEqual([3, 3]);
    expect(sizes("brick", 3)).toEqual([3, 6]);
    expect(sizes("brick", 2)).toEqual([2, 2]);
    expect(sizes("halfDrop", 3)).toEqual([6, 3]);
    expect(sizes("mirror", 1)).toEqual([2, 2]);
    expect(sizes("mirror", 3)).toEqual([6, 6]);
  });

  it("offsets brick rows and half-drop columns by half a cell", () => {
    const flat = { jitter: 0, rotationJitter: 0, sizeVariance: 0, cells: 2 };
    const brick = seamlessLayout(opts({ ...flat, tiling: "brick" }));
    const b = (r: number, c: number) => brick.base[r * brick.cols + c] as SeamlessPlacement;
    expect(b(1, 0).x - b(0, 0).x).toBeCloseTo(brick.cellWidth / 2);
    expect(b(1, 0).y - b(0, 0).y).toBeCloseTo(brick.cellHeight);
    const drop = seamlessLayout(opts({ ...flat, tiling: "halfDrop" }));
    const d = (r: number, c: number) => drop.base[r * drop.cols + c] as SeamlessPlacement;
    expect(d(0, 1).y - d(0, 0).y).toBeCloseTo(drop.cellHeight / 2);
  });

  it("mirrors the cell block with flipped elements", () => {
    const l = seamlessLayout(opts({ tiling: "mirror", cells: 2 }));
    const at = (r: number, c: number) => l.base[r * l.cols + c] as SeamlessPlacement;
    for (let r = 0; r < l.rows; r++) {
      for (let c = 0; c < l.cols; c++) {
        const p = at(r, c);
        const mx = at(r, l.cols - 1 - c);
        const my = at(l.rows - 1 - r, c);
        expect(near(p.x + mx.x, l.tileWidth)).toBe(true);
        expect(near(p.y + my.y, l.tileHeight)).toBe(true);
        expect(p.rotation).toBe(mx.rotation);
        expect(p.flipX).toBe(c >= l.cols / 2);
        expect(p.flipY).toBe(r >= l.rows / 2);
      }
    }
  });

  it("is deterministic, and options do not reshuffle the random stream", () => {
    const a = seamlessLayout(opts());
    expect(seamlessLayout(opts())).toEqual(a);
    const b = seamlessLayout(opts({ rotation: 90, sizeVariance: 0 }));
    expect(b.base.map((p) => p.color)).toEqual(a.base.map((p) => p.color));
  });

  it("keeps colour 0 for a single colour and spreads colours otherwise", () => {
    expect(new Set(seamlessLayout(opts({ colorCount: 1 })).base.map((p) => p.color))).toEqual(
      new Set([0]),
    );
    const many = seamlessLayout(opts({ colorCount: 4, cells: 6 }));
    expect(new Set(many.base.map((p) => p.color)).size).toBeGreaterThan(1);
    expect(many.base.every((p) => p.color >= 0 && p.color < 4)).toBe(true);
  });

  it("fits non-square motifs into the size box", () => {
    const wide = seamlessLayout(opts({ aspect: 2 }));
    expect([wide.boxWidth, wide.boxHeight]).toEqual([40, 20]);
    const tall = seamlessLayout(opts({ aspect: 0.5 }));
    expect([tall.boxWidth, tall.boxHeight]).toEqual([20, 40]);
  });

  it("guards extreme params from share links", () => {
    const tiny = seamlessLayout(opts({ size: 0, spacingX: -5, spacingY: 0, cells: 99 }));
    expect(tiny.cellWidth).toBeGreaterThanOrEqual(SEAMLESS_MIN_CELL);
    expect(tiny.cols).toBeLessThanOrEqual(SEAMLESS_MAX_CELLS);
    const { ms, value } = fastest(() =>
      seamlessLayout(
        opts({
          tiling: "mirror",
          cells: 99,
          size: 400,
          spacingX: 0,
          spacingY: 0,
          sizeVariance: 1,
          jitter: 0.5,
        }),
      ),
    );
    expect(value.placements.length).toBeLessThanOrEqual(SEAMLESS_MAX_ELEMENTS);
    expect(ms).toBeLessThan(GENERATOR_BUDGET_MS);
  });
});

describe("seamless SVG", () => {
  const layout = seamlessLayout(opts());

  it("draws the tile as a pattern on the full canvas", () => {
    const svg = seamlessPatternSvg({
      layout,
      motif: { kind: "path", d: seamlessShapePath("star") },
      colors: ["#111111", "#222222", "#333333"],
      background: "#ffffff",
      width: 500,
      height: 300,
    });
    expect(svg).toMatch(/^<svg [^>]*width="500" height="300"/);
    expect(svg).toContain(`patternUnits="userSpaceOnUse"`);
    expect(svg).toContain(`width="${layout.tileWidth}" height="${layout.tileHeight}"`);
    expect(svg.match(/<use /g)?.length).toBe(layout.placements.length);
  });

  it("builds the standalone tile from the same markup", () => {
    const common = {
      layout,
      motif: { kind: "path", d: seamlessShapePath("heart") } as const,
      colors: ["#111111"],
      background: "transparent",
    };
    const tile = seamlessTileSvg(common);
    const full = seamlessPatternSvg({ ...common, width: 100, height: 100 });
    const body = /<pattern [^>]*>([\s\S]*)<\/pattern>/.exec(full)?.[1] ?? "";
    expect(body.length).toBeGreaterThan(0);
    expect(tile).toContain(body);
    expect(tile).not.toContain("<rect"); // transparent background
  });

  it("embeds image motifs once and tints them per colour group", () => {
    const href = "data:image/png;base64,AAAA";
    const svg = seamlessTileSvg({
      layout,
      motif: { kind: "image", hrefs: [href], tint: true },
      colors: ["#ff0000", "#00ff00", "#ff0000"],
      background: "#000000",
    });
    expect(svg.split(href).length - 1).toBe(1);
    expect(svg).toContain('<feFlood flood-color="#ff0000"/>');
    // Duplicate palette colours still get unique filter ids.
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses one source per colour for recoloured images", () => {
    const hrefs = ["data:image/svg+xml;base64,QQ==", "data:image/svg+xml;base64,Qg=="];
    const svg = seamlessTileSvg({
      layout,
      motif: { kind: "image", hrefs, tint: false },
      colors: ["#111111", "#222222"],
      background: "transparent",
    });
    for (const href of hrefs) expect(svg).toContain(href);
    expect(svg).not.toContain("<filter");
  });

  it("encodes SVG data URIs as UTF-8 base64", () => {
    expect(svgBase64DataUri("<svg>é</svg>")).toBe("data:image/svg+xml;base64,PHN2Zz7DqTwvc3ZnPg==");
  });
});

describe("seamless shapes", () => {
  it("draws from the whole shape library, unique well-formed paths inside the box", () => {
    expect(SEAMLESS_SHAPES.length).toBeGreaterThanOrEqual(150);
    const paths = SEAMLESS_SHAPES.map(seamlessShapePath);
    expect(new Set(paths).size).toBe(SEAMLESS_SHAPES.length);
    for (const d of paths) {
      expect(d).toMatch(/^M[-\d. MLHVCQAZ]+$/);
      expect(d).not.toMatch(/NaN|Infinity/);
      const b = pathBounds(d);
      expect(Math.max(-b.minX, -b.minY, b.maxX, b.maxY)).toBeLessThanOrEqual(50.02);
    }
  });
});
