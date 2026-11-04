import { registry, type AnyToolDefinition } from "@musterli/tool-registry";

/**
 * Musterli generators offered as wallpaper styles (T1, docs/WALLPAPERS.md).
 * All render SVG, so preview and export share one render path and the
 * raster export scales to any device size. WebGL tools (shader gradient)
 * follow once the shader worker is wired in.
 */
export const WALLPAPER_TOOL_IDS = [
  "mesh-gradient",
  "blurry-gradient",
  "holographic-gradient",
  "blob-composition",
  "svg-waves",
  "low-poly",
  "topo-lines",
  "flow-field",
] as const;

export type WallpaperToolId = (typeof WALLPAPER_TOOL_IDS)[number];

export function isWallpaperToolId(id: string): id is WallpaperToolId {
  return (WALLPAPER_TOOL_IDS as readonly string[]).includes(id);
}

export function wallpaperTool(id: WallpaperToolId): AnyToolDefinition {
  const tool = registry.get(id);
  if (!tool) throw new Error(`Unknown tool ${id}`);
  return tool;
}
