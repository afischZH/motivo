import { renderDesignSvg } from "@musterli/exporters";
import { createRenderContext } from "@musterli/tool-registry";

import { composeWallpaper, type Finish } from "./finish";
import { wallpaperTool, type WallpaperToolId } from "./generators";
import type { ResolvedTarget } from "./target";

/** What one wallpaper image is made of. */
export interface WallpaperLook {
  readonly toolId: WallpaperToolId;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: number;
  readonly finish: Finish;
}

/**
 * The one render path of the app: generator SVG at the design size plus the
 * finish layers. Preview, single download, light/dark pair and ZIP sets all
 * call this, the raster export only scales the result to native pixels.
 */
export function wallpaperSvg(look: WallpaperLook, target: ResolvedTarget): string {
  const tool = wallpaperTool(look.toolId);
  const base = renderDesignSvg(
    tool,
    look.params as Record<string, unknown>,
    createRenderContext(look.seed, target.design),
  );
  return composeWallpaper(
    base,
    target.design,
    look.seed,
    look.finish,
    target.device?.safeZones ?? [],
  );
}

/** Whether the target has a lock-screen clock the calm-clock layer can sit behind. */
export function hasClockZone(target: ResolvedTarget | undefined): boolean {
  return target?.device?.safeZones.some((zone) => zone.kind === "clock") ?? false;
}
