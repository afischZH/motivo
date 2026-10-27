import { TOOL_CATEGORIES, registry } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";

import {
  RELATED_TOOL_COUNT,
  catalogueGroups,
  categoryTools,
  populatedCategories,
  primaryCategory,
  relatedTools,
} from "./catalogue";

describe("catalogue", () => {
  it("lists every registered tool exactly once, under its primary category", () => {
    const listed = catalogueGroups().flatMap((g) => g.tools.map((t) => t.id));
    expect([...listed].sort()).toEqual(
      registry
        .list()
        .map((t) => t.id)
        .sort(),
    );
    for (const group of catalogueGroups()) {
      for (const tool of group.tools) expect(primaryCategory(tool)).toBe(group.category);
    }
  });

  it("keeps the registry's category order and skips empty categories", () => {
    const order = catalogueGroups().map((g) => TOOL_CATEGORIES.indexOf(g.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const category of populatedCategories()) {
      expect(categoryTools(category).length).toBeGreaterThan(0);
    }
  });

  it("relates tools that share a category, never the tool itself", () => {
    for (const tool of registry.list()) {
      const related = relatedTools(tool);
      expect(related.length).toBeLessThanOrEqual(RELATED_TOOL_COUNT);
      expect(related.map((t) => t.id)).not.toContain(tool.id);
      for (const other of related) {
        expect(other.category.some((c) => tool.category.includes(c))).toBe(true);
      }
    }
  });

  it("puts tools with the same primary category first", () => {
    const tool = registry.get("tints-shades");
    if (!tool) throw new Error("tints-shades missing");
    const related = relatedTools(tool);
    expect(related.slice(0, 2).every((t) => primaryCategory(t) === "colors")).toBe(true);
  });
});
