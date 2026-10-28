/**
 * Turns a file the user adds to the brand kit into a stored image, through
 * exactly the pipeline of upload params (asset-input/prepare.ts): size
 * limit, type by magic bytes, pixel count from the header; SVG sanitised in
 * the sanitize worker, raster images decoded, downsampled to at most
 * 1024 px and re-encoded (PNG, or JPEG for photos) in the image worker. The
 * whole picture is kept (no crop dialog here; tools crop when they use it).
 *
 * Own shapes must be SVG: the tools recolour them.
 */
import type { BrandAssetKind, BrandImage } from "@musterli/storage";
import { finishAsset, readAsset, type AssetError } from "../asset-input/prepare";
import type { SvgSanitizer } from "../asset-input/sanitize-client";
import type { ImageInputServices } from "../image-input/services";

export type BrandImageError = AssetError | "shape-not-svg";

export type BrandImageResult =
  | { ok: true; image: BrandImage; removed: number }
  | { ok: false; error: BrandImageError | "aborted" };

const WHOLE = { x: 0, y: 0, w: 1, h: 1 } as const;

export interface BrandImageServices {
  crop: ImageInputServices["crop"];
  svg?: SvgSanitizer | undefined;
}

export async function prepareBrandImage(
  file: Blob & { name?: string },
  kind: BrandAssetKind,
  services: BrandImageServices,
  signal?: AbortSignal,
): Promise<BrandImageResult> {
  const read = await readAsset(file, { svg: services.svg, signal });
  if (!read.ok) return read;
  if (kind === "shape" && read.source.kind !== "svg") return { ok: false, error: "shape-not-svg" };
  const removed = read.source.kind === "svg" ? read.source.removed : 0;
  const done = await finishAsset(read.source, WHOLE, services, signal);
  if (!done.ok) return done;
  return { ok: true, image: done.asset, removed };
}

/** A stored image as a file again, e.g. to pass it to an upload field. */
export function brandImageToFile(image: BrandImage, name: string): File {
  if (image.kind === "svg") {
    return new File([image.svg], name || "brand.svg", { type: "image/svg+xml" });
  }
  const comma = image.href.indexOf(",");
  const type = image.href.slice(5, image.href.indexOf(";"));
  const binary = atob(image.href.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name || "brand", { type });
}
