/**
 * The encoding step of a raster export: draw a decoded bitmap onto a canvas
 * (with an optional background) and encode it. Runs inside the raster
 * worker on an `OffscreenCanvas`; the canvas factory is injected so the
 * logic is testable without a browser.
 */
import { ExportError, type ExportErrorCode } from "./errors";
import { PngStreamEncoder, type DeflateFactory } from "./png-stream";
import { ZIP_MIME, createZip, type ZipEntry } from "./zip";

/** The subset of `CanvasRenderingContext2D` / `OffscreenCanvasRenderingContext2D` used here. */
export interface Context2dLike {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: ArrayLike<number> };
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
  /**
   * Pixels to read back after drawing (`[x, y]` pairs), returned as
   * `samples` so the caller can check that a large canvas really drew.
   */
  probe?: readonly (readonly [number, number])[];
}

/** Reply of the raster worker. */
export type EncodeResponse =
  | { id: number; ok: true; blob: Blob; samples?: number[] }
  | { id: number; ok: false; code: ExportErrorCode; message: string };

/** Straight RGBA of each probe pixel, 4 numbers per point. */
export function readProbe(
  ctx: Pick<Context2dLike, "getImageData">,
  probe: readonly (readonly [number, number])[],
): number[] {
  const out: number[] = [];
  for (const [x, y] of probe) {
    const d = ctx.getImageData(x, y, 1, 1).data;
    out.push(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0);
  }
  return out;
}

/** Draws and encodes; throws `ExportError`. */
export async function encodeBitmap(
  req: EncodeRequest,
  createCanvas: (width: number, height: number) => OffscreenCanvasLike,
): Promise<{ blob: Blob; samples?: number[] }> {
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
  let samples: number[] | undefined;
  if (req.probe?.length) {
    try {
      samples = readProbe(ctx, req.probe);
    } catch (cause) {
      throw new ExportError("too-large", "Could not read the canvas back", { cause });
    }
  }
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
  return samples ? { blob, samples } : { blob };
}

/** Turns a request into a reply; never throws. */
export async function handleEncodeRequest(
  req: EncodeRequest,
  createCanvas: (width: number, height: number) => OffscreenCanvasLike,
): Promise<EncodeResponse> {
  try {
    return { id: req.id, ok: true, ...(await encodeBitmap(req, createCanvas)) };
  } catch (error) {
    const code = error instanceof ExportError ? error.code : "encode-failed";
    const message = error instanceof Error ? error.message : String(error);
    return { id: req.id, ok: false, code, message };
  }
}

/**
 * Strip protocol of the raster worker (PNG larger than one canvas may be):
 * `strip-start`, then `strip-rows` top to bottom (each acknowledged with
 * `strip-ack` once encoded, for back pressure), then `strip-end`, answered
 * with an `EncodeResponse`. Any failure answers with an error response.
 */
export type StripMessage =
  | { kind: "strip-start"; id: number; width: number; height: number }
  | { kind: "strip-rows"; id: number; rows: number; data: Uint8ClampedArray }
  | { kind: "strip-end"; id: number };

export type StripReply = { id: number; kind: "strip-ack"; rows: number } | EncodeResponse;

/** Whether a worker message belongs to the strip protocol. */
export function isStripMessage(message: unknown): message is StripMessage {
  const kind = (message as { kind?: unknown } | null)?.kind;
  return kind === "strip-start" || kind === "strip-rows" || kind === "strip-end";
}

/** Whether a worker reply is a strip acknowledgement. */
export function isStripAck(
  reply: StripReply,
): reply is { id: number; kind: "strip-ack"; rows: number } {
  return (reply as { kind?: unknown }).kind === "strip-ack";
}

/**
 * Worker-side state of the strip protocol. Messages must be handled one
 * after another (`handle` resolves when the message is done).
 */
export function createStripSession(deflate?: DeflateFactory): {
  handle(message: StripMessage): Promise<StripReply>;
} {
  let encoder: PngStreamEncoder | undefined;
  return {
    async handle(message) {
      try {
        switch (message.kind) {
          case "strip-start":
            encoder = new PngStreamEncoder(message.width, message.height, deflate);
            return { id: message.id, kind: "strip-ack", rows: 0 };
          case "strip-rows":
            if (!encoder) throw new ExportError("encode-failed", "Strip rows before strip-start");
            await encoder.addRows(message.data, message.rows);
            return { id: message.id, kind: "strip-ack", rows: encoder.rows };
          case "strip-end": {
            if (!encoder) throw new ExportError("encode-failed", "Strip end before strip-start");
            const parts = await encoder.finish();
            encoder = undefined;
            return { id: message.id, ok: true, blob: new Blob(parts, { type: "image/png" }) };
          }
        }
      } catch (error) {
        encoder = undefined;
        const code = error instanceof ExportError ? error.code : "encode-failed";
        const text = error instanceof Error ? error.message : String(error);
        return { id: message.id, ok: false, code, message: text };
      }
    },
  };
}

/** Message to the raster worker: build a ZIP from these entries. */
export interface ZipMessage {
  kind: "zip";
  id: number;
  entries: ZipEntry[];
  /** Modification time in ms since the epoch. */
  modified: number;
}

export function isZipMessage(message: unknown): message is ZipMessage {
  return (message as { kind?: unknown } | null)?.kind === "zip";
}

/** Worker side of the `zip` message; never throws. */
export async function handleZipMessage(message: ZipMessage): Promise<EncodeResponse> {
  try {
    const parts = await createZip(message.entries, { modified: new Date(message.modified) });
    return { id: message.id, ok: true, blob: new Blob(parts, { type: ZIP_MIME }) };
  } catch (error) {
    const code = error instanceof ExportError ? error.code : "encode-failed";
    const text = error instanceof Error ? error.message : String(error);
    return { id: message.id, ok: false, code, message: text };
  }
}
