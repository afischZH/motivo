import { TOOL_CATEGORIES, registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import {
  MIN_RELATED_TOOLS,
  NEARBY_CATEGORIES,
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

  it("relates tools that share a category first, never the tool itself, each once", () => {
    for (const tool of registry.list()) {
      const related = relatedTools(tool);
      const ids = related.map((t) => t.id);
      expect(related.length).toBeLessThanOrEqual(RELATED_TOOL_COUNT);
      expect(ids).not.toContain(tool.id);
      expect(new Set(ids).size).toBe(ids.length);
      const shares = related.map((other) => other.category.some((c) => tool.category.includes(c)));
      // Tools sharing a category come before any top-up.
      expect(shares).toEqual([...shares].sort((a, b) => Number(b) - Number(a)));
    }
  });

  it(`relates at least ${MIN_RELATED_TOOLS} tools to every tool, even a category's only tool`, () => {
    for (const tool of registry.list()) {
      expect(relatedTools(tool).length, tool.id).toBeGreaterThanOrEqual(MIN_RELATED_TOOLS);
    }
  });

  it("tops up a category's only tool from nearby categories, taking turns", () => {
    const lonely = registry
      .list()
      .find((tool) => tool.category.every((c) => categoryTools(c).length === 1));
    if (!lonely) throw new Error("expected a tool that is alone in its categories");
    const nearby = [...new Set(lonely.category.flatMap((c) => NEARBY_CATEGORIES[c]))];
    const related = relatedTools(lonely);
    expect(related).toHaveLength(RELATED_TOOL_COUNT);
    for (const other of related) {
      expect(
        other.category.some((c) => nearby.includes(c)),
        other.id,
      ).toBe(true);
    }
    // The first round takes one tool from each nearby category, nearest first.
    nearby.slice(0, RELATED_TOOL_COUNT).forEach((category, i) => {
      expect(related[i]?.category, category).toContain(category);
    });
  });

  it("tops up with nearby categories only when too few tools share one", () => {
    for (const tool of registry.list()) {
      const related = relatedTools(tool);
      const direct = registry
        .list()
        .filter((o) => o.id !== tool.id && o.category.some((c) => tool.category.includes(c)));
      expect(related.slice(0, Math.min(direct.length, RELATED_TOOL_COUNT))).toEqual(
        relatedTools(tool, Math.min(direct.length, RELATED_TOOL_COUNT)),
      );
    }
  });

  it("falls back to the registry order when nearby categories run out", () => {
    const tool = registry.get("favicon-generator");
    if (!tool) throw new Error("favicon-generator missing");
    const all = registry.list().filter((t) => t.id !== tool.id);
    const related = relatedTools(tool, all.length);
    expect(related.map((t) => t.id).sort()).toEqual(all.map((t) => t.id).sort());
  });

  it("gives every category nearby categories other than itself", () => {
    for (const category of TOOL_CATEGORIES) {
      expect(NEARBY_CATEGORIES[category].length).toBeGreaterThan(0);
      expect(NEARBY_CATEGORIES[category]).not.toContain(category);
    }
  });

  it("puts tools with the same primary category first", () => {
    const tool = registry.get("tints-shades");
    if (!tool) throw new Error("tints-shades missing");
    const related = relatedTools(tool);
    expect(related.slice(0, 2).every((t) => primaryCategory(t) === "colors")).toBe(true);
  });
});
