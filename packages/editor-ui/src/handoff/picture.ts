/**
 * Both ends of a picture hand-over (docs/ARCHITECTURE.md 4.18):
 *
 *  - `renderHandoffPicture` (source): the current design through the
 *    export dialog's raster service (one render path: SVG rasteriser,
 *    raster-effect worker or shader worker), as PNG at the largest size the
 *    target param keeps (never enlarged). Over the upload limit it tries a
 *    JPEG for photo targets (they are re-encoded as JPEG anyway), then
 *    smaller sizes.
 *  - `prepareHandoffAsset` (target): the picture runs through the upload
 *    pipeline of the target field (`readAsset`: size, magic bytes, pixel
 *    count; `finishAsset`: decode, downsample and re-encode in the image
 *    worker, then the param schema), without the crop dialog (whole
 *    picture). So a hand-over is checked exactly like a file from disk.
 */
import {
  createRenderContext,
  type AnyToolDefinition,
  type CanvasSize,
} from "@musterli/tool-registry";
import { finishAsset, readAsset, type AssetFinishResult } from "../asset-input/prepare";
import type { SvgSanitizer } from "../asset-input/sanitize-client";
import type { ImageControl } from "../controls/resolve";
import type { ExportServices } from "../export/export-dialog";
import { IMAGE_INPUT_MAX_BYTES } from "../image-input/check";
import type { ImageInputServices } from "../image-input/services";
import type { ParamValues } from "../store/editor-store";

/** What the target field keeps; from its `ImageControl` (or the `imageInput` limit). */
export interface HandoffTargetLimits {
  /** Longest edge the target keeps. */
  maxEdge: number;
  /** The target re-encodes as JPEG (`ImageHint.photo`). */
  photo: boolean;
}

/** Smallest edge of a hand-over picture. */
export const HANDOFF_MIN_EDGE = 16;
/** Size steps tried when a picture is over the upload limit. */
const SCALE_STEPS = [1, 0.7, 0.5, 0.35] as const;
const JPEG_QUALITY = 0.92;

export class HandoffError extends Error {
  constructor(readonly code: "too-large" | "unsupported") {
    super(`Hand-over failed: ${code}`);
    this.name = "HandoffError";
  }
}

/**
 * Output size for a design: the design size fitted into `maxEdge` (never
 * enlarged), times `factor`, at least `HANDOFF_MIN_EDGE` per side.
 */
export function handoffSize(design: CanvasSize, maxEdge: number, factor = 1): CanvasSize {
  const fit = Math.min(1, maxEdge / Math.max(design.width, design.height)) * factor;
  return {
    width: Math.max(HANDOFF_MIN_EDGE, Math.round(design.width * fit)),
    height: Math.max(HANDOFF_MIN_EDGE, Math.round(design.height * fit)),
  };
}

export interface HandoffPicture {
  blob: Blob;
  width: number;
  height: number;
}

/** Renders the design for the target. Throws `HandoffError` or the export error. */
export async function renderHandoffPicture(
  exportRaster: ExportServices["exportRaster"],
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
  target: HandoffTargetLimits,
  signal?: AbortSignal,
): Promise<HandoffPicture> {
  const ctx = createRenderContext(seed, size);
  const formats = target.photo ? (["png", "jpg"] as const) : (["png"] as const);
  for (const factor of SCALE_STEPS) {
    const out = handoffSize(size, target.maxEdge, factor);
    for (const format of formats) {
      const result = await exportRaster(tool, params as never, ctx, {
        format,
        size: out,
        ...(format === "jpg" ? { quality: JPEG_QUALITY } : {}),
        ...(signal ? { signal } : {}),
      });
      if (result.blob.size <= IMAGE_INPUT_MAX_BYTES) {
        return { blob: result.blob, width: result.width, height: result.height };
      }
    }
  }
  throw new HandoffError("too-large");
}

/** The whole picture: hand-overs skip the crop dialog. */
const WHOLE = { x: 0, y: 0, w: 1, h: 1 } as const;

/** Checks and encodes a handed-over picture for `control`. Never throws. */
export async function prepareHandoffAsset(
  blob: Blob,
  name: string,
  control: Pick<ImageControl, "maxEdge" | "photo" | "rasterOnly" | "schema">,
  services: Pick<ImageInputServices, "crop"> & { svg?: SvgSanitizer | undefined },
  signal?: AbortSignal,
): Promise<AssetFinishResult> {
  const file = Object.assign(blob.slice(0, blob.size, blob.type), { name });
  const read = await readAsset(file, {
    svg: services.svg,
    signal,
    rasterOnly: control.rasterOnly,
  });
  if (!read.ok) return read;
  if (signal?.aborted) return { ok: false, error: "aborted" };
  return finishAsset(read.source, WHOLE, services, signal, {
    maxEdge: control.maxEdge,
    photo: control.photo,
    rasterOnly: control.rasterOnly,
    schema: control.schema,
  });
}
