import { describe, expect, it } from "vitest";
import legacy from "./__fixtures__/legacy-paths.json";
import {
  SHAPE_IDS,
  SHAPE_PACK_IDS,
  flattenPath,
  getShape,
  isShapeId,
  listShapePacks,
  parsePathData,
  pathBounds,
  shapeLayers,
  shapePackOf,
  shapePath,
  shapesInPacks,
  tileShapeIds,
  windingNumber,
} from "./index";

/** Share of a grid of sample points inside the shape (nonzero rule). */
function coverage(d: string, grid = 40, lo = -50, hi = 50): number {
  const polys = flattenPath(d, 24);
  let inside = 0;
  for (let j = 0; j < grid; j++) {
    for (let i = 0; i < grid; i++) {
      const x = lo + ((i + 0.5) / grid) * (hi - lo);
      const y = lo + ((j + 0.5) / grid) * (hi - lo);
      if (windingNumber(polys, x, y) !== 0) inside++;
    }
  }
  return inside / (grid * grid);
}

const EPS = 0.02;

describe("shape library", () => {
  it("has 12 packs and at least 150 shapes", () => {
    expect(SHAPE_PACK_IDS).toHaveLength(12);
    expect(listShapePacks().map((p) => p.id)).toEqual(SHAPE_PACK_IDS);
    expect(SHAPE_IDS.length).toBeGreaterThanOrEqual(150);
    for (const pack of listShapePacks()) expect(pack.shapes.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique, kebab-case ids in pack order", () => {
    expect(new Set(SHAPE_IDS).size).toBe(SHAPE_IDS.length);
    for (const id of SHAPE_IDS) expect(id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    expect(listShapePacks().flatMap((p) => p.shapes)).toEqual(SHAPE_IDS);
  });

  it("keeps the 24 Seamless Patterns shapes byte for byte (ids and path data)", () => {
    const entries = Object.entries(legacy as Record<string, string>);
    expect(entries).toHaveLength(24);
    for (const [id, d] of entries) {
      expect(isShapeId(id)).toBe(true);
      expect(shapePath(id)).toBe(d);
    }
  });

  it.each(SHAPE_IDS)("%s parses, stays in the box and has visible area", (id) => {
    const def = getShape(id);
    expect(def?.id).toBe(id);
    if (!def) return;
    for (const d of [def.primary, def.accent].filter((v) => v !== undefined)) {
      expect(() => parsePathData(d)).not.toThrow();
      expect(d).not.toMatch(/[a-z]/);
      const b = pathBounds(d);
      expect(b.minX).toBeGreaterThanOrEqual(-50 - EPS);
      expect(b.minY).toBeGreaterThanOrEqual(-50 - EPS);
      expect(b.maxX).toBeLessThanOrEqual(50 + EPS);
      expect(b.maxY).toBeLessThanOrEqual(50 + EPS);
      expect(coverage(d)).toBeGreaterThan(0.02);
    }
    const box = pathBounds(shapePath(id, "box"));
    expect(box.minX).toBeGreaterThanOrEqual(-EPS);
    expect(box.minY).toBeGreaterThanOrEqual(-EPS);
    expect(box.maxX).toBeLessThanOrEqual(100 + EPS);
    expect(box.maxY).toBeLessThanOrEqual(100 + EPS);
    // The whole box filled would mean a hole ran the wrong way somewhere.
    expect(coverage(def.path)).toBeLessThan(0.999);
  });

  it("keeps accent layers off the primary layer", () => {
    const layered = SHAPE_IDS.filter((id) => getShape(id)?.accent !== undefined);
    expect(layered.length).toBeGreaterThanOrEqual(10);
    for (const id of layered) {
      const { primary, accent } = shapeLayers(id);
      const a = flattenPath(primary, 24);
      const b = flattenPath(accent ?? "", 24);
      let both = 0;
      for (let y = -49.5; y < 50; y += 2.5) {
        for (let x = -49.5; x < 50; x += 2.5) {
          if (windingNumber(a, x, y) !== 0 && windingNumber(b, x, y) !== 0) both++;
        }
      }
      expect(both, id).toBe(0);
      expect(getShape(id)?.path).toBe(`${primary}${accent ?? ""}`);
    }
  });

  it("marks tile shapes, which reach at least two edges of the box", () => {
    const tiles = tileShapeIds();
    expect(tiles.length).toBeGreaterThanOrEqual(12);
    expect(tiles).toEqual(shapesInPacks(["tiles"]));
    for (const id of tiles) {
      const b = pathBounds(shapePath(id));
      const edges = [b.minX <= -49.9, b.minY <= -49.9, b.maxX >= 49.9, b.maxY >= 49.9];
      expect(edges.filter(Boolean).length, id).toBeGreaterThanOrEqual(2);
    }
    expect(getShape("circle")?.tile).toBe(false);
  });

  it("moves shapes into the 0..100 box by (50, 50)", () => {
    expect(shapePath("circle", "box")).toBe("M2 50A48 48 0 1 0 98 50A48 48 0 1 0 2 50Z");
    const layers = shapeLayers("cube", "box");
    expect(layers.accent).toBeDefined();
    expect(pathBounds(layers.primary).minX).toBeGreaterThanOrEqual(0);
    expect(shapeLayers("circle", "box")).toEqual({ primary: shapePath("circle", "box") });
  });

  it("answers unknown ids safely", () => {
    expect(getShape("nope")).toBeUndefined();
    expect(getShape("toString")).toBeUndefined();
    expect(isShapeId(42)).toBe(false);
    expect(shapePackOf("heart")).toBe("symbols");
    expect(shapePackOf("nope")).toBeUndefined();
    expect(shapePath("nope")).toBe(shapePath("circle"));
    expect(shapeLayers("nope")).toEqual({ primary: shapePath("circle") });
    expect(shapesInPacks(["nope"])).toEqual([]);
  });

  it("is deterministic and cached", () => {
    expect(getShape("blob-3")).toBe(getShape("blob-3"));
    expect(shapePath("blob-11")).toMatchSnapshot();
  });

  it("draws holes against their outline (nonzero)", () => {
    const ring = flattenPath(shapePath("ring"), 24);
    expect(windingNumber(ring, 0, 0)).toBe(0);
    expect(windingNumber(ring, 38, 0)).not.toBe(0);
    const record = flattenPath(shapeLayers("record").primary, 24);
    expect(windingNumber(record, 0, 0)).toBe(0);
    expect(windingNumber(record, 0, 37.5)).toBe(0);
    expect(windingNumber(record, 0, 20)).not.toBe(0);
    const zellige = flattenPath(shapeLayers("zellige").primary, 24);
    expect(windingNumber(zellige, 0, 0)).toBe(0);
  });
});
