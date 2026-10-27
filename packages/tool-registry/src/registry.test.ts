import { describe, expect, it } from "vitest";
import { circleTool } from "./__fixtures__/circle-tool";
import { createRegistry, defineTool, registry } from "./registry";

const withId = (id: string, category: typeof circleTool.category = circleTool.category) =>
  defineTool({ ...circleTool, id, category });

describe("createRegistry", () => {
  it("registers, gets and lists tools in registration order", () => {
    const reg = createRegistry();
    expect(reg.register(circleTool)).toBe(circleTool);
    reg.register(withId("other-tool", ["gradients"]));
    expect(reg.get("test-circle")).toBe(circleTool);
    expect(reg.has("other-tool")).toBe(true);
    expect(reg.get("missing")).toBeUndefined();
    expect(reg.has("missing")).toBe(false);
    expect(reg.list().map((t) => t.id)).toEqual(["test-circle", "other-tool"]);
  });

  it("rejects duplicate ids", () => {
    const reg = createRegistry();
    reg.register(circleTool);
    expect(() => reg.register(withId("test-circle"))).toThrow(/Duplicate tool id/);
  });

  it("rejects ids that are not kebab-case", () => {
    const reg = createRegistry();
    for (const id of ["", "Blob", "blob_gen", "-blob", "blob-", "blob--gen", "blob gen"]) {
      expect(() => reg.register(withId(id))).toThrow(/Invalid tool id/);
    }
  });

  it("lists by any of a tool's categories", () => {
    const reg = createRegistry();
    reg.register(circleTool); // backgrounds, patterns
    reg.register(withId("grad", ["gradients", "backgrounds"]));
    expect(reg.listByCategory("backgrounds").map((t) => t.id)).toEqual(["test-circle", "grad"]);
    expect(reg.listByCategory("patterns").map((t) => t.id)).toEqual(["test-circle"]);
    expect(reg.listByCategory("colors")).toEqual([]);
  });

  it("returns snapshots from list, not the internal store", () => {
    const reg = createRegistry();
    reg.register(circleTool);
    const list = reg.list() as unknown[];
    list.length = 0;
    expect(reg.list()).toHaveLength(1);
  });

  it("keeps separate registries independent", () => {
    const a = createRegistry();
    const b = createRegistry();
    a.register(circleTool);
    expect(b.has("test-circle")).toBe(false);
  });
});

describe("default registry", () => {
  it("starts empty", () => {
    expect(registry.list()).toEqual([]);
  });
});
