import type { ToolCategory } from "@musterli/tool-registry";

import type { CollectionKind } from "@/i18n/slugs";

/** Which curated collection belongs to a catalogue category. */
const COLLECTION_BY_CATEGORY: Partial<Record<ToolCategory, CollectionKind>> = {
  gradients: "gradients",
  colors: "palettes",
};

/**
 * Collections to point to from pages about these categories (a category
 * page, or a tool's landing page with all its categories), in category order.
 */
export function collectionsFor(categories: readonly ToolCategory[]): CollectionKind[] {
  const kinds = categories
    .map((category) => COLLECTION_BY_CATEGORY[category])
    .filter((kind): kind is CollectionKind => kind !== undefined);
  return [...new Set(kinds)];
}
