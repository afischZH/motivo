/**
 * Catalogue structure derived from the registry: nothing here lists tools or
 * categories by hand, so a newly registered tool shows up in the catalogue,
 * on its category pages, as a related tool and in the sitemap by itself.
 */
import {
  TOOL_CATEGORIES,
  registry,
  type AnyToolDefinition,
  type ToolCategory,
} from "@musterli/tool-registry";

/** How many related tools a landing page links to. */
export const RELATED_TOOL_COUNT = 6;

export function primaryCategory(tool: AnyToolDefinition): ToolCategory {
  return tool.category[0];
}

/** Catalogue sections: each tool once, under its primary category, in category order. */
export function catalogueGroups(): { category: ToolCategory; tools: AnyToolDefinition[] }[] {
  const tools = registry.list();
  return TOOL_CATEGORIES.map((category) => ({
    category,
    tools: tools.filter((tool) => primaryCategory(tool) === category),
  })).filter((group) => group.tools.length > 0);
}

/** Every tool that lists the category, primary or not. */
export function categoryTools(category: ToolCategory): readonly AnyToolDefinition[] {
  return registry.listByCategory(category);
}

/** Categories that have a page: at least one registered tool lists them. */
export function populatedCategories(): ToolCategory[] {
  return TOOL_CATEGORIES.filter((category) => categoryTools(category).length > 0);
}

/**
 * Tools sharing a category with `tool`: same primary category first, then
 * the others by number of shared categories, registry order as tie-break.
 */
export function relatedTools(
  tool: AnyToolDefinition,
  max: number = RELATED_TOOL_COUNT,
): AnyToolDefinition[] {
  const score = (other: AnyToolDefinition) =>
    (primaryCategory(other) === primaryCategory(tool) ? 10 : 0) +
    other.category.filter((c) => tool.category.includes(c)).length;
  return registry
    .list()
    .filter((other) => other.id !== tool.id && score(other) > 0)
    .map((other, index) => ({ other, index, s: score(other) }))
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .slice(0, max)
    .map(({ other }) => other);
}
