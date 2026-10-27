/**
 * The encoding step of a raster export: draw a decoded bitmap onto a canvas
 * (with an optional background) and encode it. Runs inside the raster
 * worker on an `OffscreenCanvas`; the canvas factory is injected so the
 * logic is testable without a browser.
 */
import { ExportError, type ExportErrorCode } from "./errors";

/** The subset of `CanvasRenderingContext2D` / `OffscreenCanvasRenderingContext2D` used here. */
export interface Context2dLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
}

/** The subset of `OffscreenCanvas` used here. */
export interface OffscreenCanvasLike {
  getContext(type: "2d"): Context2dLike | null;
  convertToBlob(options?: ImageEncodeOptions): Promise<Blob>;
}

/** Message from the main thread to the raster worker. */
export interface EncodeRequest {
  id: number;
  /** Transferred; closed after drawing. */
  bitmap: ImageBitmap;
  width: number;
  height: number;
  mime: string;
  quality?: number;
  background?: string;
}

/** Reply of the raster worker. */
export type EncodeResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; code: ExportErrorCode; message: string };

/** Draws and encodes; throws `ExportError`. */
export async function encodeBitmap(
  req: EncodeRequest,
  createCanvas: (width: number, height: number) => OffscreenCanvasLike,
): Promise<Blob> {
  let canvas: OffscreenCanvasLike;
  let ctx: Context2dLike | null;
  try {
    canvas = createCanvas(req.width, req.height);
    ctx = canvas.getContext("2d");
  } catch (cause) {
    req.bitmap.close();
    throw new ExportError("encode-failed", "Could not create the canvas", { cause });
  }
  if (!ctx) {
    req.bitmap.close();
    throw new ExportError("encode-failed", `No 2D context for ${req.width}x${req.height}`);
  }
  if (req.background !== undefined) {
    ctx.fillStyle = req.background;
    ctx.fillRect(0, 0, req.width, req.height);
  }
  ctx.drawImage(req.bitmap, 0, 0, req.width, req.height);
  req.bitmap.close();
  const options: ImageEncodeOptions = { type: req.mime };
  if (req.quality !== undefined) options.quality = req.quality;
  let blob: Blob;
  try {
    blob = await canvas.convertToBlob(options);
  } catch (cause) {
    throw new ExportError("encode-failed", "Encoding failed", { cause });
  }
  // Browsers fall back to PNG for types they cannot encode.
  if (blob.type !== req.mime) {
    throw new ExportError("encode-unsupported", `This browser cannot encode ${req.mime}`);
  }
  return blob;
}

/** Turns a request into a reply; never throws. */
export async function handleEncodeRequest(
  req: EncodeRequest,
  createCanvas: (width: number, height: number) => OffscreenCanvasLike,
): Promise<EncodeResponse> {
  try {
    return { id: req.id, ok: true, blob: await encodeBitmap(req, createCanvas) };
  } catch (error) {
    const code = error instanceof ExportError ? error.code : "encode-failed";
    const message = error instanceof Error ? error.message : String(error);
    return { id: req.id, ok: false, code, message };
  }
}
