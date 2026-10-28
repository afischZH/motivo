/**
 * Turning a user file into an `ImageAsset` for params of `kind: "image"`
 * (uploads in Seamless Patterns). Everything happens in the browser; the
 * file is never sent anywhere and the asset never enters a share link.
 *
 *  1. `readAsset`: size limit, type by magic bytes (name and declared type
 *     are ignored), pixel count from the header; SVG is sanitised right away
 *     by the whitelist sanitizer (`@musterli/svg-sanitizer`) in the sanitize
 *     worker (sanitize-client.ts).
 *  2. The crop dialog picks a part (`CropRect`, fractions of the source).
 *  3. `finishAsset`: SVG is cropped by the sanitizer (new viewBox) in the
 *     same worker, which also prepares it for rendering (`primeSvgAsset`, so
 *     renders never sanitise it on the main thread); raster pictures are
 *     cropped, downsampled and re-encoded in the image worker.
 */
import type { SvgRect } from "@musterli/svg-sanitizer";
import {
  IMAGE_ASSET_MAX_SVG_LENGTH,
  IMAGE_ASSET_RASTER_MAX_EDGE,
  imageAssetSchema,
  primeSvgAsset,
  type ImageAsset,
} from "@musterli/tool-registry";
import { checkImageBytes, checkImageSize, type ImageInputError } from "../image-input/check";
import type { ImageInputServices } from "../image-input/services";
import { cropToSource, type CropRect } from "./crop";
import { createSvgSanitizer, type SvgSanitizer } from "./sanitize-client";

/** Every way an upload can fail; keys of `Editor.asset.errors`. */
export type AssetError = ImageInputError | "svg-too-large" | "svg-invalid" | "svg-timeout";

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

/** `aborted`: the caller cancelled (a newer file, unmount); not shown. */
export type AssetReadResult =
  { ok: true; source: AssetSource } | { ok: false; error: AssetError | "aborted" };
export type AssetFinishResult =
  { ok: true; asset: ImageAsset } | { ok: false; error: AssetError | "aborted" };

/** Sanitizer on the main thread, for callers without a worker (tests, scripts). */
let fallbackSanitizer: SvgSanitizer | null = null;
const mainThreadSanitizer = (): SvgSanitizer =>
  (fallbackSanitizer ??= createSvgSanitizer({
    createWorker: async () => null,
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  }));

export interface ReadAssetOptions {
  /** Sanitizer to use (the browser one runs in a worker). Default: main thread. */
  svg?: SvgSanitizer | undefined;
  signal?: AbortSignal | undefined;
}

const fileName = (file: { name?: string }): string => (file.name ?? "").slice(0, 200);

/** Lets the browser run other tasks (input, paint) before continuing. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Size of the source in its own units (pixels or viewBox units). */
export function sourceSize(source: AssetSource): { width: number; height: number } {
  return source.kind === "svg"
    ? { width: source.viewBox.width, height: source.viewBox.height }
    : { width: source.width, height: source.height };
}

/** Reads and checks a file. Never throws. */
export async function readAsset(
  file: Blob & { name?: string },
  options: ReadAssetOptions = {},
): Promise<AssetReadResult> {
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
    const sanitizer = options.svg ?? mainThreadSanitizer();
    const clean = await sanitizer.read(bytes, IMAGE_ASSET_MAX_SVG_LENGTH, options.signal);
    if (!clean.ok) return clean;
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

/** How a finished upload is encoded and checked (`ImageHint` of the field). */
export interface AssetOutputOptions {
  /** Longest raster edge. Default `IMAGE_ASSET_RASTER_MAX_EDGE`. */
  maxEdge?: number;
  /** Re-encode rasters as JPEG. */
  photo?: boolean;
  /** Schema that must accept the asset. Default `imageAssetSchema`. */
  schema?: { safeParse(value: unknown): { success: boolean; data?: unknown } };
}

/** Applies the crop and builds the asset. Never throws. */
export async function finishAsset(
  source: AssetSource,
  crop: CropRect,
  services: Pick<ImageInputServices, "crop"> & { svg?: SvgSanitizer | undefined },
  signal?: AbortSignal,
  output: AssetOutputOptions = {},
): Promise<AssetFinishResult> {
  let asset: ImageAsset;
  if (source.kind === "svg") {
    const rect = cropToSource(crop, source.viewBox);
    const sanitizer = services.svg ?? mainThreadSanitizer();
    const clean = await sanitizer.crop(source.svg, rect, IMAGE_ASSET_MAX_SVG_LENGTH, signal);
    if (!clean.ok) return clean;
    // Renders find the sanitizer pass and the recolour template ready (cache by content).
    if (clean.prepared) primeSvgAsset({ ...clean.prepared, input: clean.svg, svg: clean.svg });
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
      const rect = cropToSource(crop, source);
      const maxEdge = output.maxEdge ?? IMAGE_ASSET_RASTER_MAX_EDGE;
      result =
        output.photo === true
          ? await services.crop(source.bytes, source.mime, rect, maxEdge, true)
          : await services.crop(source.bytes, source.mime, rect, maxEdge);
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
  // The schema is the final judge (size limits, data URI shape). Checking a
  // multi-megabyte data URI takes about 20 ms: in a task of its own, apart
  // from the worker reply and from the render that follows.
  await nextTask();
  const parsed = (output.schema ?? imageAssetSchema).safeParse(asset);
  await nextTask();
  return parsed.success && parsed.data
    ? { ok: true, asset: parsed.data as ImageAsset }
    : { ok: false, error: "too-large" };
}
