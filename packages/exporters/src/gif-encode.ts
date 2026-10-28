/**
 * The encoding side of a GIF export (M4-AP04): colour quantisation and
 * LZW encoding with `gifenc`, frame by frame. Runs in the GIF worker
 * (`gif.worker.ts`); without a worker the same session runs on the main
 * thread. `gifenc` is loaded with a dynamic import when the first export
 * starts, so it never lands in a page bundle.
 *
 * Protocol: `gif-start`, then one `gif-frame` per frame (RGBA rows of the
 * whole frame, top to bottom; each acknowledged with `gif-ack` once
 * encoded, for back pressure), then `gif-end`, answered with the file.
 * Any failure answers with an error reply.
 */
// A reference (not an import) because the file only declares the untyped
// `gifenc` module and must be visible to every package compiling this source.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./gifenc.d.ts" />
import type { GifencFormat, GifencPalette } from "gifenc";
import { ExportError, type ExportErrorCode } from "./errors";

/** The part of `gifenc` used here. */
export type GifencModule = Pick<
  typeof import("gifenc"),
  "GIFEncoder" | "quantize" | "applyPalette"
>;

/** Loads `gifenc`. Injected in tests. */
export type GifencLoader = () => Promise<GifencModule>;

const loadGifenc: GifencLoader = () => import("gifenc");

export type GifMessage =
  | {
      kind: "gif-start";
      id: number;
      width: number;
      height: number;
      /** Frame delay in milliseconds (stored in hundredths of a second). */
      delay: number;
      /** Endless loop; false plays once. */
      loop: boolean;
    }
  /** RGBA rows of the whole frame, top to bottom. */
  | { kind: "gif-frame"; id: number; data: Uint8ClampedArray }
  /**
   * A decoded frame of the output size (transferred, closed after use). The
   * worker draws it on an `OffscreenCanvas` and reads the pixels there, so
   * the main thread never rasterises or reads back the frame.
   */
  | { kind: "gif-frame"; id: number; bitmap: ImageBitmap }
  | { kind: "gif-end"; id: number };

/** The subset of an `OffscreenCanvas` 2D context used to read a bitmap back. */
export interface FrameContextLike {
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
}

/** Creates the worker's frame canvas context; `null` when none is available. */
export type FrameCanvasFactory = (width: number, height: number) => FrameContextLike | null;

const offscreenFrameCanvas: FrameCanvasFactory = (width, height) => {
  if (typeof OffscreenCanvas !== "function") return null;
  return new OffscreenCanvas(width, height).getContext("2d", {
    willReadFrequently: true,
  }) as FrameContextLike | null;
};

export type GifReply =
  | { id: number; kind: "gif-ack"; frames: number }
  | { id: number; kind: "gif-done"; ok: true; blob: Blob }
  | { id: number; kind: "gif-done"; ok: false; code: ExportErrorCode; message: string };

/** Whether a worker message belongs to the GIF protocol. */
export function isGifMessage(message: unknown): message is GifMessage {
  const kind = (message as { kind?: unknown } | null)?.kind;
  return kind === "gif-start" || kind === "gif-frame" || kind === "gif-end";
}

/** Alpha at or below this is fully transparent in the GIF (one-bit alpha). */
const ALPHA_THRESHOLD = 127;

/** Whether any pixel would be transparent in the GIF. */
export function hasTransparency(rgba: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if ((rgba[i] ?? 255) <= ALPHA_THRESHOLD) return true;
  }
  return false;
}

/**
 * Palette and index bitmap of one frame: up to 256 colours per frame
 * (local palettes, so colour cycles keep their quality). Transparent
 * pixels get one palette entry, marked as the transparent index.
 */
export function quantizeFrame(
  gifenc: GifencModule,
  rgba: Uint8ClampedArray,
): { palette: GifencPalette; index: Uint8Array; transparentIndex: number } {
  const transparent = hasTransparency(rgba);
  const format: GifencFormat = transparent ? "rgba4444" : "rgb565";
  const palette = transparent
    ? gifenc.quantize(rgba, 256, { format, oneBitAlpha: ALPHA_THRESHOLD })
    : gifenc.quantize(rgba, 256, { format });
  const index = gifenc.applyPalette(rgba, palette, format);
  const transparentIndex = transparent ? palette.findIndex((c) => (c[3] ?? 255) === 0) : -1;
  return { palette, index, transparentIndex };
}

/**
 * Worker-side state of the GIF protocol. Messages must be handled one after
 * another (`handle` resolves when the message is done).
 */
export function createGifSession(
  load: GifencLoader = loadGifenc,
  createFrameCanvas: FrameCanvasFactory = offscreenFrameCanvas,
): {
  handle(message: GifMessage): Promise<GifReply>;
} {
  let state:
    | {
        gifenc: GifencModule;
        stream: ReturnType<GifencModule["GIFEncoder"]>;
        width: number;
        height: number;
        delay: number;
        repeat: number;
        frames: number;
        canvas?: FrameContextLike | undefined;
      }
    | undefined;

  /** Pixels of a bitmap frame, drawn on the (reused) worker canvas. */
  const readBitmap = (bitmap: ImageBitmap): Uint8ClampedArray => {
    if (!state) throw new ExportError("encode-failed", "GIF frame before gif-start");
    const { width, height } = state;
    try {
      state.canvas ??= createFrameCanvas(width, height) ?? undefined;
      if (!state.canvas) throw new ExportError("unavailable", "No canvas in the GIF worker");
      state.canvas.clearRect(0, 0, width, height);
      state.canvas.drawImage(bitmap, 0, 0, width, height);
      return state.canvas.getImageData(0, 0, width, height).data;
    } finally {
      bitmap.close();
    }
  };

  return {
    async handle(message) {
      try {
        switch (message.kind) {
          case "gif-start": {
            let gifenc: GifencModule;
            try {
              gifenc = await load();
            } catch (cause) {
              throw new ExportError("unavailable", "Could not load the GIF encoder", { cause });
            }
            state = {
              gifenc,
              stream: gifenc.GIFEncoder(),
              width: message.width,
              height: message.height,
              delay: message.delay,
              repeat: message.loop ? 0 : -1,
              frames: 0,
            };
            return { id: message.id, kind: "gif-ack", frames: 0 };
          }
          case "gif-frame": {
            if (!state) {
              if ("bitmap" in message) message.bitmap.close();
              throw new ExportError("encode-failed", "GIF frame before gif-start");
            }
            const data = "bitmap" in message ? readBitmap(message.bitmap) : message.data;
            if (data.length !== state.width * state.height * 4) {
              throw new ExportError("encode-failed", "GIF frame has the wrong size");
            }
            const { palette, index, transparentIndex } = quantizeFrame(state.gifenc, data);
            state.stream.writeFrame(index, state.width, state.height, {
              palette,
              delay: state.delay,
              repeat: state.repeat,
              transparent: transparentIndex >= 0,
              transparentIndex: Math.max(0, transparentIndex),
              // Restore to background: a transparent pixel never shows the previous frame.
              dispose: 2,
            });
            state.frames++;
            return { id: message.id, kind: "gif-ack", frames: state.frames };
          }
          case "gif-end": {
            if (!state || state.frames === 0) {
              throw new ExportError("encode-failed", "GIF end without frames");
            }
            state.stream.finish();
            const bytes = state.stream.bytes();
            state = undefined;
            return {
              id: message.id,
              kind: "gif-done",
              ok: true,
              blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/gif" }),
            };
          }
        }
      } catch (error) {
        state = undefined;
        const code = error instanceof ExportError ? error.code : "encode-failed";
        const text = error instanceof Error ? error.message : String(error);
        return { id: message.id, kind: "gif-done", ok: false, code, message: text };
      }
    },
  };
}
