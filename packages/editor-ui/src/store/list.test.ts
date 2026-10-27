import { cssPatternsTool } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";
import { fixtureTool } from "../test/fixture-tool";
import {
  applyListOp,
  isItemLockable,
  listSpec,
  newListItem,
  pruneItemLocks,
  remapLocks,
  selectionAfter,
  type ListOp,
} from "./list";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
const limits = { minItems: 1, maxItems: 4 };
const ids = (list: readonly { id?: unknown }[] | null) => list?.map((i) => i.id).join("");

describe("applyListOp", () => {
  it("adds, duplicates, removes and moves", () => {
    expect(ids(applyListOp(items, { type: "add" }, limits, { id: "x" }))).toBe("abcx");
    expect(ids(applyListOp(items, { type: "add", at: 0 }, limits, { id: "x" }))).toBe("xabc");
    expect(ids(applyListOp(items, { type: "duplicate", index: 1 }, limits))).toBe("abbc");
    expect(ids(applyListOp(items, { type: "remove", index: 0 }, limits))).toBe("bc");
    expect(ids(applyListOp(items, { type: "move", from: 0, to: 2 }, limits))).toBe("bca");
    expect(ids(applyListOp(items, { type: "move", from: 2, to: 0 }, limits))).toBe("cab");
  });

  it("sets one field of one item without touching the others", () => {
    const out = applyListOp(items, { type: "set", index: 1, field: "id", value: "z" }, limits);
    expect(ids(out)).toBe("azc");
    expect(out?.[0]).toBe(items[0]);
    expect(items[1]).toEqual({ id: "b" });
  });

  it("refuses ops beyond the limits, out of range or without effect", () => {
    const full = [...items, { id: "d" }];
    const refused: [readonly { id: string }[], ListOp][] = [
      [full, { type: "add" }],
      [full, { type: "duplicate", index: 0 }],
      [[{ id: "a" }], { type: "remove", index: 0 }],
      [items, { type: "remove", index: 3 }],
      [items, { type: "remove", index: -1 }],
      [items, { type: "move", from: 0, to: 0 }],
      [items, { type: "move", from: 0, to: 3 }],
      [items, { type: "add", at: 9 }],
      [items, { type: "add", at: 1.5 }],
      [items, { type: "set", index: 0, field: "id", value: "a" }],
      [items, { type: "set", index: 0, field: "nope", value: 1 }],
    ];
    for (const [list, op] of refused) {
      expect(applyListOp(list, op, limits, { id: "x" }), JSON.stringify(op)).toBeNull();
    }
    expect(applyListOp(items, { type: "add" }, limits)).toBeNull();
  });
});

describe("selectionAfter", () => {
  it("selects the new, moved or neighbouring item", () => {
    expect(selectionAfter({ type: "add" }, 3)).toBe(3);
    expect(selectionAfter({ type: "add", at: 0 }, 3)).toBe(0);
    expect(selectionAfter({ type: "duplicate", index: 1 }, 3)).toBe(2);
    expect(selectionAfter({ type: "remove", index: 2 }, 3)).toBe(1);
    expect(selectionAfter({ type: "remove", index: 0 }, 3)).toBe(0);
    expect(selectionAfter({ type: "move", from: 0, to: 2 }, 3)).toBe(2);
    expect(selectionAfter({ type: "set", index: 1, field: "x", value: 1 }, 3)).toBe(1);
  });
});

describe("remapLocks", () => {
  const locks = new Set(["bg", "layers.0.color", "layers.1.size", "layers.2.color", "other.0.x"]);
  const sorted = (s: ReadonlySet<string>) => [...s].sort();

  it("lets item locks follow their item on moves", () => {
    expect(sorted(remapLocks(locks, "layers", { type: "move", from: 0, to: 2 }))).toEqual(
      ["bg", "layers.0.size", "layers.1.color", "layers.2.color", "other.0.x"].sort(),
    );
  });

  it("drops the locks of a removed item and shifts the rest", () => {
    expect(sorted(remapLocks(locks, "layers", { type: "remove", index: 1 }))).toEqual(
      ["bg", "layers.0.color", "layers.1.color", "other.0.x"].sort(),
    );
  });

  it("shifts on insert and copies the locks of a duplicated item", () => {
    expect(sorted(remapLocks(locks, "layers", { type: "add", at: 0 }))).toEqual(
      ["bg", "layers.1.color", "layers.2.size", "layers.3.color", "other.0.x"].sort(),
    );
    expect(sorted(remapLocks(locks, "layers", { type: "duplicate", index: 0 }))).toEqual(
      [
        "bg",
        "layers.0.color",
        "layers.1.color",
        "layers.2.size",
        "layers.3.color",
        "other.0.x",
      ].sort(),
    );
  });

  it("returns the same set when nothing moves", () => {
    expect(remapLocks(locks, "layers", { type: "set", index: 0, field: "x", value: 1 })).toBe(
      locks,
    );
    expect(remapLocks(locks, "layers", { type: "add" })).toBe(locks);
  });
});

describe("pruneItemLocks", () => {
  it("drops locks of items that no longer exist", () => {
    const locks = new Set(["bg", "layers.0.color", "layers.3.color"]);
    expect([...pruneItemLocks(locks, { layers: [{}, {}] })]).toEqual(["bg", "layers.0.color"]);
    const kept = new Set(["layers.1.color"]);
    expect(pruneItemLocks(kept, { layers: [{}, {}] })).toBe(kept);
  });
});

describe("list params of a tool", () => {
  it("reads limits, item schema and hints from the schema", () => {
    const spec = listSpec(cssPatternsTool, "layers");
    expect(spec?.minItems).toBe(1);
    expect(spec?.maxItems).toBe(5);
    expect(Object.keys(spec?.item.shape ?? {})).toContain("pattern");
    expect(spec?.hint.visibilityField).toBe("visible");
    expect(listSpec(cssPatternsTool, "background")).toBeNull();
    expect(listSpec(fixtureTool, "palette")).toBeNull();
  });

  it("creates new items through the hint", () => {
    const spec = listSpec(cssPatternsTool, "layers");
    if (!spec) throw new Error("no spec");
    const added = newListItem(cssPatternsTool, spec, "layers", cssPatternsTool.defaults.layers);
    expect(spec.item.safeParse(added).success).toBe(true);
  });

  it("only allows locks on existing, lockable item fields", () => {
    expect(isItemLockable(cssPatternsTool, "layers.0.color")).toBe(true);
    expect(isItemLockable(cssPatternsTool, "layers.4.pattern")).toBe(true);
    expect(isItemLockable(cssPatternsTool, "layers.5.pattern")).toBe(false);
    expect(isItemLockable(cssPatternsTool, "layers.0.visible")).toBe(false);
    expect(isItemLockable(cssPatternsTool, "layers.0.nope")).toBe(false);
    expect(isItemLockable(cssPatternsTool, "background.0.x")).toBe(false);
    expect(isItemLockable(cssPatternsTool, "layers")).toBe(false);
  });
});
