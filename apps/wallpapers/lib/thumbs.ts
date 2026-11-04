import { renderDesignSvg, svgToDataUri } from "@musterli/exporters";
import { createRenderContext } from "@musterli/tool-registry";

import { wallpaperTool, type WallpaperToolId } from "./generators";

/**
 * Small previews for the style and look pickers, rendered through the same
 * generator as the wallpaper (no stored images). Cached per tool, look and
 * size, so switching styles back and forth costs nothing.
 */
const cache = new Map<string, string>();

export function thumbnail(
  toolId: WallpaperToolId,
  presetIndex: number,
  size: { width: number; height: number },
): string {
  const key = `${toolId}:${presetIndex}:${size.width}x${size.height}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const tool = wallpaperTool(toolId);
  const preset = tool.presets[presetIndex] ?? tool.presets[0];
  const params = (preset?.params ?? tool.defaults) as Record<string, unknown>;
  const uri = svgToDataUri(
    renderDesignSvg(tool, params, createRenderContext(preset?.seed ?? 1, size)),
  );
  cache.set(key, uri);
  return uri;
}
