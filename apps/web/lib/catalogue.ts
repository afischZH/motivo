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

/** Fewest related tools a landing page shows (checked for every tool in tests). */
export const MIN_RELATED_TOOLS = 3;

/**
 * Categories whose tools suit a visitor of another category, nearest first.
 * Only used to top up related tools when too few tools share a category
 * (a category with a single tool, such as icons, would show none).
 */
export const NEARBY_CATEGORIES: Readonly<Record<ToolCategory, readonly ToolCategory[]>> = {
  patterns: ["backgrounds", "css-patterns"],
  "css-patterns": ["patterns", "css-effects", "backgrounds"],
  gradients: ["backgrounds", "css-effects", "colors"],
  backgrounds: ["patterns", "gradients"],
  "image-effects": ["social", "backgrounds"],
  colors: ["gradients", "css-effects"],
  converters: ["colors", "css-effects"],
  social: ["backgrounds", "image-effects", "icons"],
  composer: ["backgrounds", "social"],
  "css-effects": ["gradients", "css-patterns", "colors"],
  icons: ["social", "backgrounds", "colors"],
};

/** Up to `max` tools, taking the lists in turns (first of each, then second, ...), skipping ids already taken. */
function roundRobin(
  lists: readonly (readonly AnyToolDefinition[])[],
  taken: Set<string>,
  max: number,
): AnyToolDefinition[] {
  const out: AnyToolDefinition[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let round = 0; round < longest && out.length < max; round++) {
    for (const list of lists) {
      const next = list[round];
      if (out.length >= max || next === undefined || taken.has(next.id)) continue;
      taken.add(next.id);
      out.push(next);
    }
  }
  return out;
}

/**
 * Tools sharing a category with `tool`: same primary category first, then
 * the others by number of shared categories, registry order as tie-break.
 * Fewer than `max` of those are topped up from `NEARBY_CATEGORIES` (taking
 * turns between the nearby categories, registry order within each), then
 * from the registry order (the first tools are the best known).
 */
export function relatedTools(
  tool: AnyToolDefinition,
  max: number = RELATED_TOOL_COUNT,
): AnyToolDefinition[] {
  const score = (other: AnyToolDefinition) =>
    (primaryCategory(other) === primaryCategory(tool) ? 10 : 0) +
    other.category.filter((c) => tool.category.includes(c)).length;
  const direct = registry
    .list()
    .filter((other) => other.id !== tool.id && score(other) > 0)
    .map((other, index) => ({ other, index, s: score(other) }))
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .slice(0, max)
    .map(({ other }) => other);
  if (direct.length >= max) return direct;

  const taken = new Set([tool.id, ...direct.map((t) => t.id)]);
  const nearby = [...new Set(tool.category.flatMap((c) => NEARBY_CATEGORIES[c]))].filter(
    (c) => !tool.category.includes(c),
  );
  const topUp = roundRobin(
    nearby.map((c) => categoryTools(c)),
    taken,
    max - direct.length,
  );
  const rest = roundRobin([registry.list()], taken, max - direct.length - topUp.length);
  return [...direct, ...topUp, ...rest];
}
