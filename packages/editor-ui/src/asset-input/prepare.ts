/**
 * Turning a user file into an `ImageAsset` for params of `kind: "image"`
 * (uploads in Seamless Patterns). Everything happens in the browser; the
 * file is never sent anywhere and the asset never enters a share link.
 *
 *  1. `readAsset`: size limit, type by magic bytes (name and declared type
 *     are ignored), pixel count from the header; SVG is sanitised right away
 *     by the whitelist sanitizer (`@motivo/svg-sanitizer`).
 *  2. The crop dialog picks a part (`CropRect`, fractions of the source).
 *  3. `finishAsset`: SVG is cropped by the sanitizer (new viewBox); raster
 *     pictures are cropped, downsampled and re-encoded in the image worker.
 */
import { sanitizeSvg, type SvgRect } from "@motivo/svg-sanitizer";
import {
  IMAGE_ASSET_MAX_SVG_LENGTH,
  IMAGE_ASSET_RASTER_MAX_EDGE,
  imageAssetSchema,
  type ImageAsset,
} from "@motivo/tool-registry";
import { checkImageBytes, checkImageSize, type ImageInputError } from "../image-input/check";
import type { ImageInputServices } from "../image-input/services";
import { cropToSource, type CropRect } from "./crop";

/** Every way an upload can fail; keys of `Editor.asset.errors`. */
export type AssetError = ImageInputError | "svg-too-large" | "svg-invalid";

/** `accept` of the file input (a hint only; the bytes decide). */
export const ASSET_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.svg";

export type AssetSource =
  | {
      kind: "svg";
      name: string;
      /** Sanitised, not yet cropped. */
      svg: string;
      viewBox: SvgRect;
      /** Unsafe or unsupported parts the sanitizer removed. */
      removed: number;
    }
  | {
      kind: "raster";
      name: string;
      bytes: Uint8Array;
      mime: "image/png" | "image/jpeg" | "image/webp";
      width: number;
      height: number;
    };

export type AssetReadResult = { ok: true; source: AssetSource } | { ok: false; error: AssetError };
export type AssetFinishResult = { ok: true; asset: ImageAsset } | { ok: false; error: AssetError };

const fileName = (file: { name?: string }): string => (file.name ?? "").slice(0, 200);

/** Size of the source in its own units (pixels or viewBox units). */
export function sourceSize(source: AssetSource): { width: number; height: number } {
  return source.kind === "svg"
    ? { width: source.viewBox.width, height: source.viewBox.height }
    : { width: source.width, height: source.height };
}

/** Reads and checks a file. Never throws. */
export async function readAsset(file: Blob & { name?: string }): Promise<AssetReadResult> {
  const sizeError = checkImageSize(file.size);
  if (sizeError) return { ok: false, error: sizeError };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "read-failed" };
  }
  const checked = checkImageBytes(bytes);
  if (!checked.ok) return checked;
  const name = fileName(file);

  if (checked.mime === "image/svg+xml") {
    if (bytes.length > IMAGE_ASSET_MAX_SVG_LENGTH) return { ok: false, error: "svg-too-large" };
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { ok: false, error: "svg-invalid" };
    }
    const clean = sanitizeSvg(text, { maxLength: IMAGE_ASSET_MAX_SVG_LENGTH });
    if (!clean.ok) {
      return { ok: false, error: clean.error === "too-large" ? "svg-too-large" : "svg-invalid" };
    }
    return {
      ok: true,
      source: { kind: "svg", name, svg: clean.svg, viewBox: clean.viewBox, removed: clean.removed },
    };
  }
  // Animated GIFs would show one frame only: not offered.
  if (checked.mime === "image/gif" || checked.dimensions === null) {
    return { ok: false, error: "unsupported-type" };
  }
  return {
    ok: true,
    source: {
      kind: "raster",
      name,
      bytes,
      mime: checked.mime,
      width: checked.dimensions.width,
      height: checked.dimensions.height,
    },
  };
}

/** Applies the crop and builds the asset. Never throws. */
export async function finishAsset(
  source: AssetSource,
  crop: CropRect,
  services: Pick<ImageInputServices, "crop">,
): Promise<AssetFinishResult> {
  let asset: ImageAsset;
  if (source.kind === "svg") {
    const rect = cropToSource(crop, source.viewBox);
    const clean = sanitizeSvg(source.svg, { crop: rect, maxLength: IMAGE_ASSET_MAX_SVG_LENGTH });
    if (!clean.ok) return { ok: false, error: "svg-invalid" };
    asset = {
      kind: "svg",
      svg: clean.svg,
      width: clean.width,
      height: clean.height,
      name: source.name,
    };
  } else {
    let result: Awaited<ReturnType<ImageInputServices["crop"]>>;
    try {
      result = await services.crop(
        source.bytes,
        source.mime,
        cropToSource(crop, source),
        IMAGE_ASSET_RASTER_MAX_EDGE,
      );
    } catch {
      return { ok: false, error: "decode-failed" };
    }
    if (!result.ok) return result;
    asset = {
      kind: "raster",
      href: result.href,
      width: result.width,
      height: result.height,
      name: source.name,
    };
  }
  // The schema is the final judge (size limits, data URI shape).
  const parsed = imageAssetSchema.safeParse(asset);
  return parsed.success ? { ok: true, asset: parsed.data } : { ok: false, error: "too-large" };
}
