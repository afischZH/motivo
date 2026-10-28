/**
 * Image-input worker: decodes and downsamples user images and runs the
 * tool's `imageInput.derive` (e.g. k-means), off the main thread. Started by
 * `createImageInputWorker` (worker.ts).
 */
import { registry, type PixelBuffer } from "@musterli/tool-registry";
import {
  CROP_JPEG_QUALITY,
  handleImageRequest,
  type CropMime,
  type ImageWorkerRequest,
  type ImageWorkerResponse,
  type PixelRect,
} from "./protocol";

/** The part of `DedicatedWorkerGlobalScope` used here (the package compiles with the DOM lib). */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ImageWorkerRequest>) => void,
  ): void;
  postMessage(message: ImageWorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const canDecode = typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function";

function readPixels(bitmap: ImageBitmap, width: number, height: number): PixelBuffer {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, data };
}

const canEncode = canDecode && typeof OffscreenCanvas.prototype.convertToBlob === "function";

async function encodeCrop(
  bitmap: ImageBitmap,
  crop: PixelRect,
  width: number,
  height: number,
  mime: CropMime,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  const blob = await canvas.convertToBlob(
    mime === "image/jpeg" ? { type: mime, quality: CROP_JPEG_QUALITY } : { type: mime },
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
}

scope.addEventListener("message", (event) => {
  void handleImageRequest(event.data, {
    createBitmap: canDecode ? (blob) => createImageBitmap(blob) : null,
    readPixels: (bitmap, w, h) => readPixels(bitmap as ImageBitmap, w, h),
    encodeCrop: canEncode
      ? (bitmap, crop, w, h, mime) => encodeCrop(bitmap as ImageBitmap, crop, w, h, mime)
      : null,
    lookup: (id) => registry.get(id),
  }).then((reply) => {
    const transfer =
      reply.ok && reply.type === "decode" ? [reply.pixels.data.buffer as ArrayBuffer] : [];
    scope.postMessage(reply, transfer);
  });
});
