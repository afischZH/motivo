/**
 * Pictures for the stage and the export:
 *  - Background: the tool design behind the background layer, rendered by
 *    the tool's own render path (`renderDesignImage`: SVG rasterised and
 *    encoded in the raster worker, WebGL in the shader worker, image effects
 *    in the raster-effect worker), then decoded off the main thread with
 *    `createImageBitmap`. Preview and export use the same function; the
 *    export asks for its own output size, so it stays sharp at 2x.
 *  - Image and logo layers: sanitised SVG or re-encoded raster from the
 *    upload pipeline, decoded as `<img>` (SVG only ever as an image, never
 *    as markup), cached per picture object.
 */
import { svgDataUrl } from "@musterli/editor-ui/brand-kit";
import { renderDesignImage } from "@musterli/editor-ui/render-image";
import type { BackgroundLayer, SceneFormat, SceneImage } from "@musterli/scene";
import { parseToolParams, registry } from "@musterli/tool-registry";

export type Picture = CanvasImageSource & { width: number; height: number };

/** The background design as a bitmap of `out` pixels; `null` if the tool cannot draw. */
export async function renderBackground(
  layer: BackgroundLayer,
  format: Pick<SceneFormat, "width" | "height">,
  out: { width: number; height: number },
  signal?: AbortSignal,
): Promise<ImageBitmap | null> {
  const tool = registry.get(layer.toolId);
  if (!tool) return null;
  const parsed = parseToolParams(tool, layer.params);
  if (!parsed.success) return null;
  const blob = await renderDesignImage(
    tool,
    parsed.data as Record<string, unknown>,
    layer.seed,
    { width: format.width, height: format.height },
    { out, format: "png", ...(signal ? { signal } : {}) },
  );
  if (signal?.aborted) return null;
  return createImageBitmap(blob);
}

const decoded = new WeakMap<SceneImage, Promise<HTMLImageElement>>();

/** The picture of an image or logo layer, decoded once per picture. */
export function decodePicture(image: SceneImage): Promise<HTMLImageElement> {
  let pending = decoded.get(image);
  if (!pending) {
    const img = new Image();
    img.decoding = "async";
    img.src = image.kind === "svg" ? svgDataUrl(image.svg) : image.href;
    if (image.kind === "svg") {
      img.width = image.width;
      img.height = image.height;
    }
    pending = img.decode().then(() => img);
    decoded.set(image, pending);
    pending.catch(() => decoded.delete(image));
  }
  return pending;
}
