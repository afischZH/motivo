import { createRng } from "@motivo/engine";
import { DEFAULT_CANVAS_SIZE } from "@motivo/tool-registry";
import { beforeEach, describe, expect, it } from "vitest";
import { createFixtureRegistry, fixtureDefaults, fixtureTool } from "../test/fixture-tool";
import {
  DEFAULT_SEED,
  RANDOMIZE_SALT,
  createEditorStore,
  findMatchingPresetId,
  isLockable,
  selectCanRedo,
  selectCanUndo,
  selectDesign,
  type EditorStoreApi,
  type EditorStoreOptions,
} from "./editor-store";

let clock = 0;
let seeds: number[] = [];

function setup(options: Partial<EditorStoreOptions> = {}): EditorStoreApi {
  return createEditorStore({
    toolId: "test-fixture",
    registry: createFixtureRegistry(),
    now: () => clock,
    randomSeed: () => {
      const s = seeds.shift();
      if (s === undefined) throw new Error("test ran out of seeds");
      return s;
    },
    ...options,
  });
}

beforeEach(() => {
  clock = 1000;
  seeds = [11, 22, 33, 44, 55, 66, 77, 88, 99];
});

describe("createEditorStore", () => {
  it("starts with tool defaults, default seed and size, one variant, empty history", () => {
    const s = setup().getState();
    expect(s.toolId).toBe("test-fixture");
    expect(s.tool).toBe(fixtureTool);
    expect(s.params).toEqual(fixtureDefaults);
    expect(s.seed).toBe(DEFAULT_SEED);
    expect(s.size).toEqual(DEFAULT_CANVAS_SIZE);
    expect(s.locks.size).toBe(0);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.variants).toHaveLength(1);
    expect(s.activeVariantId).toBe(s.variants[0]?.id);
  });

  it("accepts initial params, seed and size", () => {
    const params = { ...fixtureDefaults, count: 3 };
    const s = setup({ params, seed: -1, size: { width: 200, height: 100 } }).getState();
    expect(s.params).toBe(params);
    expect(s.seed).toBe(0xffffffff);
    expect(s.size).toEqual({ width: 200, height: 100 });
  });

  it("uses the tool's default size", () => {
    expect(setup({ toolId: "test-other" }).getState().size).toEqual({ width: 1920, height: 1080 });
  });

  it("throws for an unknown tool", () => {
    expect(() => setup({ toolId: "nope" })).toThrow(/Unknown tool "nope"/);
  });
});

describe("setParam", () => {
  it("updates the param immutably and records an undo step", () => {
    const store = setup();
    const before = store.getState().params;
    store.getState().setParam("count", 20);
    const s = store.getState();
    expect(s.params.count).toBe(20);
    expect(before.count).toBe(10);
    expect(s.past).toHaveLength(1);
    expect(s.past[0]?.params).toBe(before);
    expect(selectCanUndo(s)).toBe(true);
  });

  it("ignores unknown keys and unchanged values", () => {
    const store = setup();
    store.getState().setParam("nope", 1);
    store.getState().setParam("count", 10);
    store.getState().setParam("palette", [...fixtureDefaults.palette]);
    expect(store.getState().past).toHaveLength(0);
    expect(store.getState().params).toBe(fixtureDefaults);
  });

  it("coalesces rapid changes of the same key into one step", () => {
    const store = setup();
    for (let v = 11; v <= 20; v++) {
      clock += 50;
      store.getState().setParam("count", v);
    }
    expect(store.getState().past).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().params.count).toBe(10);
  });

  it("extends the window with every change (a long drag stays one step)", () => {
    const store = setup({ coalesceMs: 100 });
    for (let v = 11; v <= 30; v++) {
      clock += 90;
      store.getState().setParam("count", v);
    }
    expect(store.getState().past).toHaveLength(1);
  });

  it("starts a new step after the window, for another key, or after commit", () => {
    const store = setup({ coalesceMs: 100 });
    store.getState().setParam("count", 11);
    clock += 101;
    store.getState().setParam("count", 12);
    expect(store.getState().past).toHaveLength(2);

    store.getState().setParam("opacity", 0.5);
    expect(store.getState().past).toHaveLength(3);

    store.getState().commit();
    store.getState().setParam("opacity", 0.6);
    expect(store.getState().past).toHaveLength(4);
  });

  it("clears the redo stack", () => {
    const store = setup();
    store.getState().setParam("count", 11);
    store.getState().undo();
    expect(selectCanRedo(store.getState())).toBe(true);
    store.getState().setParam("count", 12);
    expect(store.getState().future).toEqual([]);
  });

  it("does not coalesce across an undo", () => {
    const store = setup();
    store.getState().setParam("count", 11);
    store.getState().setParam("opacity", 0.1);
    store.getState().undo();
    store.getState().setParam("opacity", 0.2);
    expect(store.getState().past).toHaveLength(2);
    store.getState().undo();
    expect(store.getState().params.opacity).toBe(fixtureDefaults.opacity);
  });
});

describe("setParams, resetParam, resetParams", () => {
  it("setParams changes several keys in one step and skips unknown or equal ones", () => {
    const store = setup();
    store.getState().setParams({ count: 2, shape: "square", nope: 1, opacity: 0.8 });
    const s = store.getState();
    expect(s.params).toMatchObject({ count: 2, shape: "square", opacity: 0.8 });
    expect("nope" in s.params).toBe(false);
    expect(s.past).toHaveLength(1);
    store.getState().setParams({ count: 2 });
    expect(store.getState().past).toHaveLength(1);
  });

  it("resetParam restores the default as its own step", () => {
    const store = setup();
    store.getState().setParam("count", 30);
    store.getState().resetParam("count");
    expect(store.getState().params.count).toBe(10);
    expect(store.getState().past).toHaveLength(2);
    store.getState().resetParam("count");
    store.getState().resetParam("nope");
    expect(store.getState().past).toHaveLength(2);
  });

  it("applyDerived merges image-derived params into the design and variant, without an undo step", () => {
    const store = setup();
    store.getState().setParam("count", 3);
    store.getState().applyDerived({ count: 4, opacity: 0.2, nope: 1 });
    const s = store.getState();
    expect(s.params).toMatchObject({ count: 4, opacity: 0.2 });
    expect("nope" in s.params).toBe(false);
    expect(s.past).toHaveLength(1);
    expect(s.variants.find((v) => v.id === s.activeVariantId)?.params).toBe(s.params);
    const before = s.params;
    store.getState().applyDerived({ count: 4 });
    expect(store.getState().params).toBe(before);
    store.getState().undo();
    expect(store.getState().params).toEqual(fixtureDefaults);
  });

  it("resetParams restores all defaults and is a no-op on defaults", () => {
    const store = setup();
    store.getState().resetParams();
    expect(store.getState().past).toHaveLength(0);
    store.getState().setParams({ count: 1, shape: "triangle" });
    store.getState().resetParams();
    expect(store.getState().params).toEqual(fixtureDefaults);
    expect(store.getState().past).toHaveLength(2);
  });
});

describe("seed and size", () => {
  it("setSeed coerces to uint32 and is undoable", () => {
    const store = setup();
    store.getState().setSeed(2 ** 32 + 5);
    expect(store.getState().seed).toBe(5);
    store.getState().undo();
    expect(store.getState().seed).toBe(DEFAULT_SEED);
  });

  it("setSize validates, coalesces and is undoable", () => {
    const store = setup();
    store.getState().setSize({ width: 1, height: 100 });
    store.getState().setSize({ width: 100.5, height: 100 });
    expect(store.getState().past).toHaveLength(0);
    store.getState().setSize({ width: 800, height: 600 });
    store.getState().setSize({ width: 801, height: 600 });
    expect(store.getState().size).toEqual({ width: 801, height: 600 });
    expect(store.getState().past).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().size).toEqual(DEFAULT_CANVAS_SIZE);
  });

  it("setSize with the same size is a no-op", () => {
    const store = setup();
    store.getState().setSize({ ...DEFAULT_CANVAS_SIZE });
    expect(store.getState().past).toHaveLength(0);
  });
});

describe("locks", () => {
  it("toggles lockable params only", () => {
    const store = setup();
    store.getState().toggleLock("count");
    expect([...store.getState().locks]).toEqual(["count"]);
    store.getState().toggleLock("count");
    expect(store.getState().locks.size).toBe(0);

    store.getState().toggleLock("fixed"); // lockable: false
    store.getState().toggleLock("nope");
    expect(store.getState().locks.size).toBe(0);
  });

  it("setLocked is idempotent and replaces the set", () => {
    const store = setup();
    store.getState().setLocked("shape", true);
    const locks = store.getState().locks;
    store.getState().setLocked("shape", true);
    expect(store.getState().locks).toBe(locks);
    store.getState().setLocked("opacity", true);
    expect(store.getState().locks).not.toBe(locks);
    expect(locks.has("opacity")).toBe(false);
  });

  it("clearLocks empties the set; locks are not part of the history", () => {
    const store = setup();
    store.getState().setLocked("shape", true);
    store.getState().setLocked("count", true);
    expect(store.getState().past).toHaveLength(0);
    store.getState().clearLocks();
    expect(store.getState().locks.size).toBe(0);
  });

  it("isLockable checks schema membership and the lockable hint", () => {
    expect(isLockable(fixtureTool, "count")).toBe(true);
    expect(isLockable(fixtureTool, "fixed")).toBe(false);
    expect(isLockable(fixtureTool, "nope")).toBe(false);
  });
});

describe("newVariant", () => {
  it("uses a new seed and the tool's randomize with a salted rng", () => {
    const store = setup();
    store.getState().newVariant();
    const s = store.getState();
    expect(s.seed).toBe(11);
    const expected = fixtureTool.randomize(
      createRng((11 ^ RANDOMIZE_SALT) >>> 0),
      fixtureDefaults,
      new Set(),
    );
    expect(s.params).toEqual(expected);
    expect(s.variants).toHaveLength(2);
    expect(s.activeVariantId).toBe(s.variants[1]?.id);
    expect(s.past).toHaveLength(1);
  });

  it("keeps locked params unchanged", () => {
    const store = setup();
    store.getState().setParams({ count: 7, shape: "triangle", opacity: 0.33 });
    store.getState().setLocked("count", true);
    store.getState().setLocked("shape", true);
    store.getState().setLocked("opacity", true);
    for (let i = 0; i < 5; i++) {
      store.getState().newVariant();
      expect(store.getState().params).toMatchObject({ count: 7, shape: "triangle", opacity: 0.33 });
    }
  });

  it("enforces locks even when a tool ignores them", () => {
    const registry = createFixtureRegistry();
    const sloppy = {
      ...fixtureTool,
      id: "sloppy",
      randomize: () => ({ ...fixtureDefaults, count: 49 }),
    };
    registry.register(sloppy);
    const store = setup({ toolId: "sloppy", registry });
    store.getState().setLocked("count", true);
    store.getState().newVariant();
    expect(store.getState().params.count).toBe(10);
  });

  it("is deterministic for a given seed source", () => {
    const a = setup({ randomSeed: () => 1234 });
    const b = setup({ randomSeed: () => 1234 });
    a.getState().newVariant();
    b.getState().newVariant();
    expect(a.getState().params).toEqual(b.getState().params);
  });

  it("keeps only the last N variants", () => {
    seeds = Array.from({ length: 10 }, (_, i) => i + 100);
    const store = setup({ variantLimit: 3 });
    for (let i = 0; i < 5; i++) store.getState().newVariant();
    const s = store.getState();
    expect(s.variants.map((v) => v.seed)).toEqual([102, 103, 104]);
    expect(s.activeVariantId).toBe(s.variants[2]?.id);
  });

  it("undo returns to the previous variant, redo forward; the filmstrip stays", () => {
    const store = setup();
    store.getState().newVariant();
    const v1 = store.getState().activeVariantId;
    store.getState().undo();
    expect(store.getState().params).toEqual(fixtureDefaults);
    expect(store.getState().seed).toBe(DEFAULT_SEED);
    expect(store.getState().activeVariantId).toBe(0);
    expect(store.getState().variants).toHaveLength(2);
    store.getState().redo();
    expect(store.getState().activeVariantId).toBe(v1);
    expect(store.getState().seed).toBe(11);
  });
});

describe("filmstrip", () => {
  function withThreeVariants(): EditorStoreApi {
    const store = setup();
    store.getState().newVariant();
    store.getState().newVariant();
    return store;
  }

  it("selectVariant restores the variant's params and seed as an undo step", () => {
    const store = withThreeVariants();
    const first = store.getState().variants[0];
    store.getState().selectVariant(0);
    expect(store.getState().params).toBe(first?.params);
    expect(store.getState().seed).toBe(first?.seed);
    expect(store.getState().past).toHaveLength(3);
    store.getState().undo();
    expect(store.getState().activeVariantId).toBe(2);
  });

  it("ignores unknown ids and the active id", () => {
    const store = withThreeVariants();
    store.getState().selectVariant(99);
    store.getState().selectVariant(2);
    expect(store.getState().past).toHaveLength(2);
  });

  it("previous/next move through the strip without wrapping", () => {
    const store = withThreeVariants();
    store.getState().nextVariant();
    expect(store.getState().activeVariantId).toBe(2);
    store.getState().previousVariant();
    store.getState().previousVariant();
    expect(store.getState().activeVariantId).toBe(0);
    store.getState().previousVariant();
    expect(store.getState().activeVariantId).toBe(0);
    store.getState().nextVariant();
    expect(store.getState().activeVariantId).toBe(1);
  });

  it("edits are written into the active variant, so browsing keeps them", () => {
    const store = withThreeVariants();
    store.getState().selectVariant(1);
    store.getState().setParam("count", 42);
    store.getState().selectVariant(2);
    store.getState().selectVariant(1);
    expect(store.getState().params.count).toBe(42);
    expect(store.getState().variants[1]?.params.count).toBe(42);
  });

  it("undo of an edit also restores the variant entry", () => {
    const store = setup();
    store.getState().setParam("count", 42);
    store.getState().undo();
    expect(store.getState().variants[0]?.params.count).toBe(10);
  });

  it("history entries of evicted variants restore with no active variant", () => {
    seeds = [1, 2, 3, 4];
    const store = setup({ variantLimit: 2 });
    store.getState().newVariant();
    store.getState().newVariant(); // variant 0 is evicted
    store.getState().undo();
    store.getState().undo();
    const s = store.getState();
    expect(s.params).toEqual(fixtureDefaults);
    expect(s.activeVariantId).toBeNull();
    // Edits without an active variant leave the strip alone.
    store.getState().setParam("count", 3);
    expect(store.getState().variants).toBe(s.variants);
    // Arrow keys jump back into the strip at the newest variant.
    store.getState().nextVariant();
    expect(store.getState().activeVariantId).toBe(2);
  });
});

describe("applyPreset", () => {
  it("applies preset params as a new variant and keeps the seed", () => {
    const store = setup();
    store.getState().applyPreset("square");
    const s = store.getState();
    expect(s.params.shape).toBe("square");
    expect(s.seed).toBe(DEFAULT_SEED);
    expect(s.variants).toHaveLength(2);
    expect(findMatchingPresetId(s.tool, s.params)).toBe("square");
  });

  it("uses the preset seed when it has one", () => {
    const store = setup();
    store.getState().applyPreset("dense");
    expect(store.getState().seed).toBe(99);
    store.getState().undo();
    expect(store.getState().seed).toBe(DEFAULT_SEED);
    expect(store.getState().params).toEqual(fixtureDefaults);
  });

  it("ignores unknown presets", () => {
    const store = setup();
    store.getState().applyPreset("nope");
    expect(store.getState().past).toHaveLength(0);
  });

  it("findMatchingPresetId returns undefined after an edit", () => {
    const store = setup();
    store.getState().applyPreset("square");
    store.getState().setParam("count", 1);
    expect(findMatchingPresetId(fixtureTool, store.getState().params)).toBeUndefined();
  });
});

describe("undo/redo", () => {
  it("is a no-op on empty stacks", () => {
    const store = setup();
    const before = store.getState();
    store.getState().undo();
    store.getState().redo();
    expect(store.getState()).toBe(before);
  });

  it("walks back and forth through several steps", () => {
    const store = setup();
    store.getState().setParam("count", 1);
    store.getState().setParam("shape", "square");
    store.getState().setSeed(5);
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().params).toMatchObject({ count: 1, shape: "circle" });
    store.getState().redo();
    store.getState().redo();
    expect(store.getState()).toMatchObject({ seed: 5, params: { count: 1, shape: "square" } });
    expect(selectCanRedo(store.getState())).toBe(false);
    store.getState().redo();
    expect(store.getState().seed).toBe(5);
  });

  it("caps the history at the limit, dropping the oldest steps", () => {
    const store = setup({ historyLimit: 3 });
    for (let v = 1; v <= 5; v++) {
      store.getState().commit();
      store.getState().setParam("count", v);
    }
    expect(store.getState().past).toHaveLength(3);
    for (let i = 0; i < 10; i++) store.getState().undo();
    expect(store.getState().params.count).toBe(2);
    expect(store.getState().future).toHaveLength(3);
  });

  it("defaults to 100 steps", () => {
    const store = setup();
    for (let v = 0; v < 120; v++) {
      store.getState().commit();
      store.getState().setSeed(v + 10);
    }
    expect(store.getState().past).toHaveLength(100);
  });

  it("closes the coalescing window, so the next change is its own step", () => {
    const store = setup();
    store.getState().setParam("count", 11);
    store.getState().undo();
    store.getState().redo();
    store.getState().setParam("count", 12);
    expect(store.getState().past).toHaveLength(2);
  });
});

describe("setTool and loadDesign", () => {
  it("setTool starts fresh with the new tool's defaults and keeps the seed", () => {
    const store = setup();
    store.getState().setSeed(77);
    store.getState().setLocked("count", true);
    store.getState().setTool("test-other");
    const s = store.getState();
    expect(s.toolId).toBe("test-other");
    expect(s.params).toEqual({
      background: "transparent",
      palette: ["#000000", "#ffffff"],
      size: 5,
    });
    expect(s.seed).toBe(77);
    expect(s.size).toEqual({ width: 1920, height: 1080 });
    expect(s.locks.size).toBe(0);
    expect(s.past).toEqual([]);
    expect(s.variants).toHaveLength(1);
  });

  it("setTool to the current tool is a no-op; unknown tools throw", () => {
    const store = setup();
    store.getState().setParam("count", 3);
    store.getState().setTool("test-fixture");
    expect(store.getState().params.count).toBe(3);
    expect(() => store.getState().setTool("nope")).toThrow();
  });

  it("loadDesign validates and replaces the design with a fresh history", () => {
    const store = setup();
    store.getState().setParam("count", 3);
    store.getState().setLocked("shape", true);
    const params = { ...fixtureDefaults, count: 25 };
    const result = store
      .getState()
      .loadDesign({ params, seed: 9, size: { width: 300, height: 200 } });
    expect(result).toEqual({ ok: true });
    const s = store.getState();
    expect(selectDesign(s)).toEqual({
      toolId: "test-fixture",
      params,
      seed: 9,
      size: { width: 300, height: 200 },
    });
    expect(s.past).toEqual([]);
    expect(s.locks.has("shape")).toBe(true);
  });

  it("loadDesign can switch tools and rejects invalid input without changes", () => {
    const store = setup();
    const before = store.getState();
    expect(store.getState().loadDesign({ params: { ...fixtureDefaults, count: 999 } }).ok).toBe(
      false,
    );
    expect(store.getState().loadDesign({ params: fixtureDefaults, seed: -1 }).ok).toBe(false);
    expect(
      store.getState().loadDesign({ params: fixtureDefaults, size: { width: 0, height: 1 } }).ok,
    ).toBe(false);
    expect(store.getState().loadDesign({ toolId: "nope", params: {} })).toEqual({
      ok: false,
      error: 'Unknown tool "nope"',
    });
    expect(store.getState()).toBe(before);

    const ok = store.getState().loadDesign({
      toolId: "test-other",
      params: { background: "#000000", palette: ["#111111", "#222222"], size: 2 },
    });
    expect(ok.ok).toBe(true);
    expect(store.getState().toolId).toBe("test-other");
    expect(store.getState().size).toEqual({ width: 1920, height: 1080 });
  });
});
