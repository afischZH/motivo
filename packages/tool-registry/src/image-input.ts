/**
 * Helpers around `ToolDefinition.imageInput`, shared by the editor (main
 * thread and worker), share links and tests, so every caller derives params
 * from an image the same way.
 */
import { createRng, deriveSeed } from "@musterli/engine";
import type { AnyToolDefinition, PixelBuffer } from "./types";

/** Salt of the rng stream handed to `imageInput.derive`. */
export const IMAGE_INPUT_SALT = "image-input";

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

/**
 * Runs `tool.imageInput.derive` with the rng for `seed` and returns the
 * patch of derived params, or `null` when the tool takes no image, found
 * nothing in it, or the result does not pass the schema. Pure: safe in a worker and in tests.
 */
export function deriveFromImage(
  tool: AnyToolDefinition,
  pixels: PixelBuffer,
  params: Values,
  seed: number,
): Values | null {
  const input = tool.imageInput;
  if (!input) return null;
  const parsed = tool.schema.safeParse(params);
  if (!parsed.success) return null;
  const rng = createRng(deriveSeed(seed, IMAGE_INPUT_SALT));
  const patch = input.derive(pixels, parsed.data, rng) as Values;
  // A tool signals "nothing found" (e.g. a fully transparent image) by leaving keys out.
  if (!input.derivedKeys.every((key) => Object.prototype.hasOwnProperty.call(patch, key))) {
    return null;
  }
  const merged = tool.schema.safeParse({ ...parsed.data, ...patch });
  if (!merged.success) return null;
  const out: Record<string, unknown> = {};
  for (const key of input.derivedKeys) out[key] = (merged.data as Values)[key];
  return out;
}

/** Keys that never leave the device: image-derived params and local files (uploads). */
export function privateParamKeys(tool: AnyToolDefinition): readonly string[] {
  return [...(tool.imageInput?.derivedKeys ?? []), ...(tool.localParams ?? [])];
}

/**
 * The params with every image-derived key and every local file param
 * (`localParams`) reset to the tool default. Share links use it in both
 * directions, so no trace of a user image or upload travels in a URL.
 * Returns `params` itself for tools without either.
 */
export function withoutDerivedParams<T extends Values>(tool: AnyToolDefinition, params: T): T {
  const keys = privateParamKeys(tool);
  if (keys.length === 0) return params;
  const defaults = tool.defaults as Values;
  const out: Record<string, unknown> = { ...params };
  for (const key of keys) out[key] = defaults[key];
  return out as T;
}

/**
 * Whether `params` hold a local file (a `localParams` key away from its
 * default), which a share link would leave out.
 */
export function hasLocalContent(tool: AnyToolDefinition, params: Values): boolean {
  const defaults = tool.defaults as Values;
  return (tool.localParams ?? []).some((key) => params[key] !== defaults[key]);
}
