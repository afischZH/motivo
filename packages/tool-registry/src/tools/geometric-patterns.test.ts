import { createRng, shapesInPacks } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { planAnimationFrames } from "../animation";
import { applyBrandPalette } from "../brand-palette";
import { createRenderContext } from "../render";
import { parseToolParams } from "../randomize";
import {
  TILE_OVERRIDES_MAX,
  geometricPatternsTool as tool,
  geometricShapesOf,
  type GeometricPatternsParams,
} from "./geometric-patterns";

const size = { width: 800, height: 600 };
const ctx = (seed = 1) => createRenderContext(seed, size);
const editor = (() => {
  if (!tool.regionEditor) throw new Error("region editor expected");
  return tool.regionEditor;
})();
const d = tool.defaults;
const render = (p: GeometricPatternsParams, seed = 1): string => {
  if (tool.render.kind !== "svg") throw new Error("svg tool expected");
  return tool.render.render(p, ctx(seed));
};

describe("geometric-patterns params", () => {
  it("picks shapes from the pack or the hand-picked list", () => {
    expect(geometricShapesOf(d)).toEqual(shapesInPacks(["bauhaus"]));
    expect(geometricShapesOf({ ...d, pack: "custom", shapes: ["heart", "star", "heart"] })).toEqual(
      ["heart", "star"],
    );
  });

  it("validates tile overrides strictly", () => {
    const ok = tool.schema.safeParse({
      ...d,
      tileOverrides: { "0-0": { shape: "star" }, "2-3.1.0": { color: "#abcdef", rotation: 90 } },
    });
    expect(ok.success).toBe(true);
    const bad = [
      { "0-0": { shape: "not-a-shape" } },
      { "0-0": { color: "red" } },
      { "0-0": { color: "url(#x)" } },
      { "0-0": { rotation: 360 } },
      { "0-0": { rotation: 1.5 } },
      { "0-0": { shape: "star", extra: 1 } },
      { "0-0.4": { shape: "star" } },
      { "0-0.1.1.1.1.1": { shape: "star" } },
      { "a-b": { shape: "star" } },
      { "1-1": "star" },
    ];
    for (const tileOverrides of bad) {
      expect(
        tool.schema.safeParse({ ...d, tileOverrides }).success,
        JSON.stringify(tileOverrides),
      ).toBe(false);
    }
  });

  it("drops an own __proto__ key instead of using it", () => {
    const tileOverrides = JSON.parse('{"__proto__": {"shape": "star"}}') as unknown;
    const parsed = tool.schema.safeParse({ ...d, tileOverrides });
    expect(parsed.success && Object.keys(parsed.data.tileOverrides)).toEqual([]);
    expect(parsed.success && Object.getPrototypeOf(parsed.data.tileOverrides)).toBe(
      Object.prototype,
    );
  });

  it("caps the number of overrides", () => {
    const many = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`${i}-0`, { rotation: 90 }]));
    expect(tool.schema.safeParse({ ...d, tileOverrides: many(TILE_OVERRIDES_MAX) }).success).toBe(
      true,
    );
    expect(
      tool.schema.safeParse({ ...d, tileOverrides: many(TILE_OVERRIDES_MAX + 1) }).success,
    ).toBe(false);
  });
});

describe("geometric-patterns region editor", () => {
  it("lists one region per tile, covering the canvas", () => {
    const regions = editor.regions(d, ctx());
    expect(regions).toHaveLength(8 * 6);
    const area = regions.reduce((s, r) => s + r.width * r.height, 0);
    expect(area).toBeCloseTo(800 * 600, 3);
    expect(regions[0]).toMatchObject({
      id: "0-0",
      labelKey: "tools.geometric-patterns.tile.cell",
      labelValues: { row: 1, col: 1 },
      edited: false,
    });
    const nested = editor.regions({ ...d, gridMode: "dynamic", splitChance: 1, depth: 1 }, ctx());
    expect(nested[0]).toMatchObject({
      id: "0-0.0",
      labelKey: "tools.geometric-patterns.tile.cellPart",
      labelValues: { row: 1, col: 1, part: "1" },
    });
  });

  it("sets one field per edit, merges fields and marks the region", () => {
    const before = editor.values(d, "1-2", ctx());
    expect(before).toBeDefined();
    const a = editor.set(d, "1-2", { shape: "heart" }, ctx()) as GeometricPatternsParams;
    expect(a.tileOverrides).toEqual({ "1-2": { shape: "heart" } });
    const b = editor.set(a, "1-2", { rotation: 270 }, ctx()) as GeometricPatternsParams;
    expect(b.tileOverrides).toEqual({ "1-2": { shape: "heart", rotation: 270 } });
    expect(editor.values(b, "1-2", ctx())).toEqual({ ...before, shape: "heart", rotation: 270 });
    expect(editor.regions(b, ctx()).find((r) => r.id === "1-2")?.edited).toBe(true);
    expect(editor.editedCount(b)).toBe(1);
    expect(tool.schema.safeParse(b).success).toBe(true);
  });

  it("changes exactly one tile of the rendered design", () => {
    const a = editor.set(d, "1-2", { shape: "heart" }, ctx()) as GeometricPatternsParams;
    const svgA = render(a);
    expect(svgA).not.toBe(render(d));
    expect(svgA).toContain('href="#gp-heart-p"');
    expect(svgA.match(/gp-heart-p"/g)?.length).toBe(2); // definition plus one use
  });

  it("ignores invalid edits and unknown regions", () => {
    expect(editor.set(d, "99-99", { shape: "heart" }, ctx())).toBe(d);
    expect(editor.set(d, "0-0", { shape: "nope" } as never, ctx())).toBe(d);
    expect(editor.set(d, "0-0", { color: "javascript:1" }, ctx())).toBe(d);
    expect(editor.set(d, "0-0", {}, ctx())).toBe(d);
    expect(editor.values(d, "99-99", ctx())).toBeUndefined();
  });

  it("refuses a new edited tile at the limit but still edits existing ones", () => {
    const full = {
      ...d,
      tileOverrides: Object.fromEntries(
        Array.from({ length: TILE_OVERRIDES_MAX }, (_, i) => [`${i}-9`, { rotation: 90 }]),
      ),
    };
    expect(editor.editedCount(full)).toBe(TILE_OVERRIDES_MAX);
    expect(editor.set(full, "0-0", { shape: "heart" }, ctx())).toBe(full);
    // "0-9" is not in the current 8 × 6 grid: stored edits outside the grid are kept but not editable.
    const inside = { ...d, tileOverrides: { ...full.tileOverrides } };
    delete (inside.tileOverrides as Record<string, unknown>)["127-9"];
    const edited = editor.set(inside, "0-0", { shape: "heart" }, ctx()) as GeometricPatternsParams;
    expect(editor.editedCount(edited)).toBe(TILE_OVERRIDES_MAX);
  });

  it("resets one tile or all tiles", () => {
    const a = editor.set(d, "0-0", { shape: "heart" }, ctx()) as GeometricPatternsParams;
    const b = editor.set(a, "1-1", { color: "#123456" }, ctx()) as GeometricPatternsParams;
    expect(editor.reset(b, "0-0")).toEqual({
      ...b,
      tileOverrides: { "1-1": { color: "#123456" } },
    });
    expect(editor.reset(b, null)).toEqual({ ...b, tileOverrides: {} });
    expect(editor.reset(d, null)).toBe(d);
    expect(editor.reset(d, "0-0")).toBe(d);
    expect(render(editor.reset(b, null) as GeometricPatternsParams)).toBe(render(d));
  });

  it("keeps overrides on the same tile across unrelated changes", () => {
    const a = editor.set(d, "2-3", { shape: "heart" }, ctx()) as GeometricPatternsParams;
    const changes: Partial<GeometricPatternsParams>[] = [
      { palette: ["#000000", "#ffffff"] },
      { background: "#123456" },
      { pack: "stars" },
      { rotationMode: "free" },
      { padding: 0.2, gap: 6 },
      { strokeOnly: true },
      { colorMode: "layer", tileFill: false },
    ];
    const rect = (p: GeometricPatternsParams, seed = 1) =>
      editor.regions(p, ctx(seed)).find((r) => r.id === "2-3");
    for (const change of changes) {
      const next = { ...a, ...change };
      expect(rect(next)).toMatchObject({ ...rect(a), edited: true });
      expect(editor.values(next, "2-3", ctx())?.shape).toBe("heart");
    }
    // Uniform grids keep their cells for every seed, so a new variant keeps the edit in place.
    expect(rect(a, 99)).toEqual(rect(a));
  });

  it("is deterministic: same params and seed give the same regions", () => {
    const p = { ...d, gridMode: "dynamic" as const, depth: 3 };
    expect(editor.regions(p, ctx(5))).toEqual(editor.regions({ ...p }, ctx(5)));
  });
});

describe("geometric-patterns randomize and brand palette", () => {
  const edited = editor.set(d, "0-0", { shape: "heart" }, ctx()) as GeometricPatternsParams;

  it("keeps edited tiles and a hand-picked shape list on a new variant", () => {
    for (let seed = 0; seed < 20; seed++) {
      const next = tool.randomize(createRng(seed), edited, new Set());
      expect(next.tileOverrides).toBe(edited.tileOverrides);
    }
    const custom = { ...edited, pack: "custom" as const, shapes: ["heart" as const] };
    const next = tool.randomize(createRng(3), custom, new Set());
    expect(next.pack).toBe("custom");
    expect(next.shapes).toEqual(["heart"]);
  });

  it("applies a brand palette to the palette and keeps the edits", () => {
    const result = applyBrandPalette(tool, edited, ["#ff0000", "#00ff00", "#0000ff"], new Set());
    expect(result?.params.palette).toEqual(["#ff0000", "#00ff00", "#0000ff"]);
    expect(result?.params.tileOverrides).toEqual(edited.tileOverrides);
  });

  it("survives a parse round trip (share links, saved designs)", () => {
    const json = JSON.parse(JSON.stringify(edited)) as unknown;
    const parsed = parseToolParams(tool, json);
    expect(parsed.success && parsed.data).toEqual(edited);
  });
});

describe("geometric-patterns tile", () => {
  it("is the whole design (whole cells fill the canvas)", () => {
    const tile = tool.tile?.render(d, ctx());
    expect(tile).toEqual({ svg: render(d), width: 800, height: 600 });
  });
});

describe("geometric-patterns animation", () => {
  it("cycles the palette and keeps edited tiles", () => {
    const params: GeometricPatternsParams = {
      ...d,
      tileOverrides: { "0-0": { shape: "heart", color: "#123456" } },
    };
    const frames = planAnimationFrames(tool, params, 1, "colors", 4);
    expect(frames).toHaveLength(4);
    expect(frames[1]?.params.palette).not.toEqual(params.palette);
    for (const frame of frames) {
      expect(frame.params.tileOverrides).toEqual(params.tileOverrides);
      expect(render(frame.params, frame.seed)).toContain("#123456");
    }
    const seeds = planAnimationFrames(tool, params, 1, "seeds", 3);
    expect(seeds.map((f) => f.seed)).toEqual([1, 2, 3]);
  });
});
