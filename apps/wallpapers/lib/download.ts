import {
  createZip,
  defaultRasterEnv,
  downloadBlob,
  exportRaster,
  ZIP_MIME,
  type ZipEntry,
} from "@musterli/exporters";
import { createRenderContext } from "@musterli/tool-registry";

import { wallpaperTool } from "./generators";
import { wallpaperSvg, type WallpaperLook } from "./render";
import type { SetItem } from "./sets";
import type { ResolvedTarget } from "./target";

/** One wallpaper at native size, through the shared render path. Browser only. */
export async function rasterWallpaper(
  look: WallpaperLook,
  target: ResolvedTarget,
  format: "png" | "jpg",
): Promise<Blob> {
  const result = await exportRaster(
    wallpaperTool(look.toolId),
    look.params as Record<string, unknown>,
    createRenderContext(look.seed, target.design),
    {
      format,
      size: { width: target.width, height: target.height },
      svg: wallpaperSvg(look, target),
    },
    await defaultRasterEnv(),
  );
  return result.blob;
}

/**
 * Renders the items one after the other (memory stays at one large bitmap)
 * and downloads them as one ZIP. PNGs are already compressed, so the ZIP
 * writer stores them as they are.
 */
export async function downloadSet(
  look: WallpaperLook,
  items: readonly SetItem[],
  filename: string,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const entries: ZipEntry[] = [];
  onProgress(0, items.length);
  for (const item of items) {
    const blob = await rasterWallpaper({ ...look, finish: item.finish }, item.target, "png");
    entries.push({ path: item.path, data: new Uint8Array(await blob.arrayBuffer()) });
    onProgress(entries.length, items.length);
  }
  const parts = await createZip(entries, { modified: new Date() });
  downloadBlob(new Blob(parts, { type: ZIP_MIME }), filename);
}
