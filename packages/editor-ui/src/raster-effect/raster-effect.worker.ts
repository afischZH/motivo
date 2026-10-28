/**
 * Raster-effect worker: decodes the user's photo (or generates the tool's
 * sample), crops it to the output size and runs the tool's image-effect
 * `render`, off the main thread. Started by `createRasterEffectWorker`
 * (worker.ts); the protocol and the handler live in protocol.ts.
 */
import { registry, type CanvasSize, type PixelBuffer } from "@musterli/tool-registry";
import {
  createEffectHandler,
  type EffectBitmap,
  type EffectEncodeOptions,
  type EffectRenderRequest,
  type EffectRenderResponse,
} from "./protocol";

/** The part of `DedicatedWorkerGlobalScope` used here (the package compiles with the DOM lib). */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<EffectRenderRequest>) => void,
  ): void;
  postMessage(message: EffectRenderResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const supported =
  typeof createImageBitmap === "function" &&
  typeof OffscreenCanvas === "function" &&
  typeof OffscreenCanvas.prototype.convertToBlob === "function";

function context(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D context");
  return { canvas, ctx };
}

function readCover(
  bitmap: EffectBitmap,
  crop: { x: number; y: number; width: number; height: number },
  out: CanvasSize,
): PixelBuffer {
  const { ctx } = context(out.width, out.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap as ImageBitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    out.width,
    out.height,
  );
  const { data } = ctx.getImageData(0, 0, out.width, out.height);
  return { width: out.width, height: out.height, data };
}

const imageData = (pixels: PixelBuffer): ImageData =>
  new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);

async function encode(pixels: PixelBuffer, options: EffectEncodeOptions): Promise<Blob> {
  const { canvas, ctx } = context(pixels.width, pixels.height);
  if (options.background !== undefined && options.background !== "transparent") {
    // Composited, not replaced: `putImageData` would keep the alpha.
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, pixels.width, pixels.height);
    const bitmap = await createImageBitmap(imageData(pixels));
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
  } else {
    ctx.putImageData(imageData(pixels), 0, 0);
  }
  const blob = await canvas.convertToBlob(
    options.quality === undefined
      ? { type: options.mime }
      : { type: options.mime, quality: options.quality },
  );
  if (blob.type !== options.mime) throw new Error(`Encoded ${blob.type}, not ${options.mime}`);
  return blob;
}

const handle = createEffectHandler({
  decode: supported
    ? (bytes, mime) => createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
    : null,
  readCover,
  toBitmap: (pixels) => createImageBitmap(imageData(pixels)),
  encode,
  lookup: (id) => registry.get(id),
});

scope.addEventListener("message", (event) => {
  void handle(event.data).then((reply) => {
    scope.postMessage(reply, reply.ok && "bitmap" in reply ? [reply.bitmap] : []);
  });
});
