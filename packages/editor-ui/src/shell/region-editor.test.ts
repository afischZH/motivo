import { SHAPE_IDS } from "@musterli/engine";
import {
  TILE_OVERRIDES_MAX,
  createRenderContext,
  geometricPatternsTool,
  type PreviewRegion,
} from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { toggleChoice } from "../controls/thumbnail-field";
import { decodeDesign, encodeDesign, SHARE_MAX_ENCODED_LENGTH } from "../share/share-codec";
import { createEditorStore, type ParamValues } from "../store/editor-store";
import { regionAt, regionEditorOf, regionKeyTarget } from "./region-editor";

const cell = (id: string, x: number, y: number, w = 10, h = 10): PreviewRegion => ({
  id,
  x,
  y,
  width: w,
  height: h,
  labelKey: "k",
  edited: false,
});

// 3 × 2 grid, plus the right column split into a big and two small cells.
const grid = [
  cell("a", 0, 0),
  cell("b", 10, 0),
  cell("c", 20, 0, 10, 5),
  cell("c2", 20, 5, 10, 5),
  cell("d", 0, 10),
  cell("e", 10, 10),
  cell("f", 20, 10),
];

describe("regionAt", () => {
  it("finds the region under a point, edges belong to the right/lower cell", () => {
    expect(regionAt(grid, 5, 5)).toBe(0);
    expect(regionAt(grid, 10, 0)).toBe(1);
    expect(regionAt(grid, 25, 7)).toBe(3);
    expect(regionAt(grid, 31, 5)).toBe(-1);
  });
});

describe("regionKeyTarget", () => {
  it("moves to the nearest region in the arrow direction", () => {
    expect(regionKeyTarget(grid, 0, "ArrowRight")).toBe(1);
    expect(regionKeyTarget(grid, 1, "ArrowRight")).toBe(2);
    expect(regionKeyTarget(grid, 0, "ArrowDown")).toBe(4);
    expect(regionKeyTarget(grid, 2, "ArrowDown")).toBe(3);
    expect(regionKeyTarget(grid, 3, "ArrowDown")).toBe(6);
    expect(regionKeyTarget(grid, 5, "ArrowUp")).toBe(1);
    expect(regionKeyTarget(grid, 6, "ArrowLeft")).toBe(5);
  });

  it("stays at the edge, jumps with Home/End and ignores other keys", () => {
    expect(regionKeyTarget(grid, 0, "ArrowLeft")).toBe(0);
    expect(regionKeyTarget(grid, 0, "ArrowUp")).toBe(0);
    expect(regionKeyTarget(grid, 3, "Home")).toBe(0);
    expect(regionKeyTarget(grid, 0, "End")).toBe(6);
    expect(regionKeyTarget(grid, 0, "Enter")).toBeNull();
    expect(regionKeyTarget([], 0, "ArrowRight")).toBeNull();
  });
});

describe("toggleChoice", () => {
  it("adds and removes within the bounds", () => {
    expect(toggleChoice(["a"], "b", { min: 1, max: 2 })).toEqual(["a", "b"]);
    expect(toggleChoice(["a", "b"], "c", { min: 1, max: 2 })).toBeNull();
    expect(toggleChoice(["a", "b"], "a", { min: 1, max: 2 })).toEqual(["b"]);
    expect(toggleChoice(["a"], "a", { min: 1, max: 2 })).toBeNull();
  });
});

describe("tile editing in the store", () => {
  const tool = geometricPatternsTool;
  const size = { width: 800, height: 600 };
  const editor = regionEditorOf(tool);
  if (!editor) throw new Error("region editor expected");

  it("is one undo step per edit, coalescing drags of one field", () => {
    let now = 0;
    const store = createEditorStore({ toolId: tool.id, size, now: () => now });
    const apply = (patch: ParamValues, key: string) => {
      const s = store.getState();
      const next = editor.set(s.params, "1-1", patch, createRenderContext(s.seed, s.size));
      s.setParams(next, { coalesceKey: `region:1-1:${key}` });
    };
    apply({ color: "#111111" }, "color");
    now += 100;
    apply({ color: "#222222" }, "color");
    now += 100;
    apply({ shape: "heart" }, "shape");
    expect(store.getState().params.tileOverrides).toEqual({
      "1-1": { color: "#222222", shape: "heart" },
    });
    store.getState().undo();
    expect(store.getState().params.tileOverrides).toEqual({ "1-1": { color: "#222222" } });
    store.getState().undo();
    expect(store.getState().params.tileOverrides).toEqual({});
    store.getState().redo();
    store.getState().redo();
    const s = store.getState();
    s.setParams(editor.reset(s.params, null));
    expect(store.getState().params.tileOverrides).toEqual({});
    store.getState().undo();
    expect(Object.keys(store.getState().params.tileOverrides as object)).toEqual(["1-1"]);
  });

  it("keeps the edits on a new variant", () => {
    const store = createEditorStore({ toolId: tool.id, size, randomSeed: () => 42 });
    const s = store.getState();
    s.setParams(editor.set(s.params, "0-0", { shape: "heart" }, createRenderContext(s.seed, size)));
    store.getState().newVariant();
    expect(store.getState().params.tileOverrides).toEqual({ "0-0": { shape: "heart" } });
  });

  it("fits the largest allowed set of edits into a share link", () => {
    const ids = SHAPE_IDS;
    const tileOverrides = Object.fromEntries(
      Array.from({ length: TILE_OVERRIDES_MAX }, (_, i) => [
        `${100 + i}-${999 - i}.3.2.1.0`,
        {
          shape: ids[(i * 37) % ids.length],
          color: `#${((i * 2654435761) >>> 8).toString(16).padStart(6, "0").slice(0, 6)}`,
          rotation: (i * 97) % 360,
        },
      ]),
    );
    const design = {
      toolId: tool.id,
      params: { ...tool.defaults, tileOverrides } as ParamValues,
      seed: 4294967295,
      size: { width: 8192, height: 8192 },
    };
    const encoded = encodeDesign(design);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.value.length).toBeLessThan(SHARE_MAX_ENCODED_LENGTH);
    const decoded = decodeDesign(encoded.value);
    expect(decoded.ok && decoded.design.params.tileOverrides).toEqual(tileOverrides);
  });

  it("rejects links with too many or malformed edits", () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: TILE_OVERRIDES_MAX + 1 }, (_, i) => [`${i}-0`, { rotation: 90 }]),
    );
    const bad = encodeDesign({
      toolId: tool.id,
      params: { ...tool.defaults, tileOverrides: tooMany } as ParamValues,
      seed: 1,
      size,
    });
    expect(bad).toEqual({ ok: false, error: "invalid-params" });
  });
});
