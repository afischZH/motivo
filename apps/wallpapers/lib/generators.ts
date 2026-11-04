import { registry, type AnyToolDefinition } from "@musterli/tool-registry";

/**
 * Musterli generators offered as wallpaper styles (docs/WALLPAPERS.md), in
 * two groups for the style picker. All render SVG, so preview and export
 * share one render path and the raster export scales to any device size.
 * WebGL tools (shader gradient) follow once the shader worker is wired in.
 */
export const WALLPAPER_STYLE_GROUPS = {
  soft: [
    "mesh-gradient",
    "blurry-gradient",
    "holographic-gradient",
    "striped-gradient",
    "blob-composition",
    "svg-waves",
    "starry-sky",
  ],
  graphic: [
    "bauhaus-pattern",
    "geometric-patterns",
    "neon-shapes",
    "glitch-background",
    "perspective-grid",
    "low-poly",
    "topo-lines",
    "flow-field",
    "guilloche",
    "terrazzo",
    "dieter-dots",
  ],
} as const;

export type WallpaperStyleGroup = keyof typeof WALLPAPER_STYLE_GROUPS;

export const WALLPAPER_TOOL_IDS = [
  ...WALLPAPER_STYLE_GROUPS.soft,
  ...WALLPAPER_STYLE_GROUPS.graphic,
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
