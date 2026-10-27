import { describe, expect, it } from "vitest";
import { cssPatternsTool } from "./tools";
import {
  isItemLocked,
  itemLockKey,
  keepLocked,
  parseItemLockKey,
  parseToolParams,
} from "./randomize";

describe("keepLocked", () => {
  const current = { a: 1, b: "x", c: [1, 2] };
  const next = { a: 2, b: "y", c: [3] };

  it("returns next unchanged without locks", () => {
    expect(keepLocked(next, current, new Set())).toBe(next);
  });

  it("copies locked keys from current without mutating inputs", () => {
    const out = keepLocked(next, current, new Set(["a", "c"] as const));
    expect(out).toEqual({ a: 1, b: "y", c: [1, 2] });
    expect(next).toEqual({ a: 2, b: "y", c: [3] });
  });
});

describe("keepLocked with list item locks", () => {
  const current = {
    bg: "#fff",
    layers: [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
    ],
  };
  const next = {
    bg: "#000",
    layers: [
      { a: 10, b: 20 },
      { a: 30, b: 40 },
    ],
  };

  it("copies a locked item field into the item at the same index", () => {
    const out = keepLocked(next, current, new Set(["layers.1.a", "layers.0.b"]));
    expect(out.layers).toEqual([
      { a: 10, b: 2 },
      { a: 3, b: 40 },
    ]);
    expect(next.layers).toEqual([
      { a: 10, b: 20 },
      { a: 30, b: 40 },
    ]);
  });

  it("ignores item locks beyond the list, unknown fields and unknown keys", () => {
    const out = keepLocked(next, current, new Set(["layers.5.a", "layers.0.zz", "nope", "x.0.a"]));
    expect(out).toEqual(next);
    expect(out).not.toHaveProperty("nope");
  });

  it("lets a whole-list lock win", () => {
    const out = keepLocked(next, current, new Set(["layers", "layers.0.a"]));
    expect(out.layers).toBe(current.layers);
  });
});

describe("item lock keys", () => {
  it("round-trips and rejects anything else", () => {
    expect(itemLockKey("layers", 2, "color")).toBe("layers.2.color");
    expect(parseItemLockKey("layers.2.color")).toEqual({
      list: "layers",
      index: 2,
      field: "color",
    });
    for (const key of ["layers", "layers.x.color", "layers.01.color", "a.1.b.c", ".1.a"]) {
      expect(parseItemLockKey(key)).toBeNull();
    }
  });

  it("isItemLocked sees the whole list and single fields", () => {
    expect(isItemLocked(new Set(["layers"]), "layers", 3, "a")).toBe(true);
    expect(isItemLocked(new Set(["layers.3.a"]), "layers", 3, "a")).toBe(true);
    expect(isItemLocked(new Set(["layers.3.a"]), "layers", 2, "a")).toBe(false);
  });
});

describe("parseToolParams", () => {
  it("never throws, even when a migration does", () => {
    const tool = {
      ...cssPatternsTool,
      migrateParams: () => {
        throw new Error("boom");
      },
    };
    expect(parseToolParams(tool, cssPatternsTool.defaults).success).toBe(true);
    for (const raw of [null, 1, "x", [], { pattern: { toString: null } }]) {
      expect(parseToolParams(cssPatternsTool, raw).success).toBe(false);
    }
  });
});
