/**
 * Backgrounds of the social editor: any tool that renders a picture by
 * itself (PNG export, no photo or live capture needed) can be the bottom
 * layer. The background keeps the tool reference (id, params, seed); the
 * picture comes from the tool's render path (resources.ts).
 */
import { RANDOMIZE_SALT } from "@musterli/editor-ui";
import { createRng } from "@musterli/engine";
import type { AnyToolDefinition } from "@musterli/tool-registry";
import type { BackgroundLayer } from "@musterli/scene";

export const DEFAULT_BACKGROUND_TOOL = "mesh-gradient";

/** Catalogue categories whose tools make backgrounds (not palettes, icons or code). */
const BACKGROUND_CATEGORIES: ReadonlySet<string> = new Set([
  "backgrounds",
  "patterns",
  "gradients",
]);

/** Whether a tool can be a social background. */
export function isBackgroundTool(tool: AnyToolDefinition): boolean {
  return (
    tool.category.some((c) => BACKGROUND_CATEGORIES.has(c)) &&
    tool.exports.includes("png") &&
    !tool.photoSource &&
    !tool.imageInput &&
    !tool.needsImageInput &&
    !tool.liveView
  );
}

/** Param keys a new variant keeps: the tool's uploads and own content, plus `locks`. */
function keptKeys(tool: AnyToolDefinition, locks: ReadonlySet<string>): Set<string> {
  return new Set([...(tool.localParams ?? []), ...(tool.contentParams ?? []), ...locks]);
}

/**
 * A new variant of the background, like Space in the tool editor: a new
 * seed and `tool.randomize` from it, keeping uploads and locked params.
 */
export function backgroundVariant(
  tool: AnyToolDefinition,
  layer: BackgroundLayer,
  seed: number,
  locks: ReadonlySet<string> = new Set(),
): Pick<BackgroundLayer, "params" | "seed"> {
  const kept = keptKeys(tool, locks);
  const rng = createRng((seed ^ RANDOMIZE_SALT) >>> 0);
  const randomized = tool.randomize(rng, layer.params as never, kept) as Record<string, unknown>;
  const params: Record<string, unknown> = { ...randomized };
  for (const key of kept) {
    if (Object.hasOwn(layer.params, key)) params[key] = layer.params[key];
  }
  return { params, seed };
}
