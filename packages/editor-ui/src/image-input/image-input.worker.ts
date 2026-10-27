/**
 * Image-input worker: decodes and downsamples user images and runs the
 * tool's `imageInput.derive` (e.g. k-means), off the main thread. Started by
 * `createImageInputWorker` (worker.ts).
 */
import { registry, type PixelBuffer } from "@motivo/tool-registry";
import { handleImageRequest, type ImageWorkerRequest, type ImageWorkerResponse } from "./protocol";

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

scope.addEventListener("message", (event) => {
  void handleImageRequest(event.data, {
    createBitmap: canDecode ? (blob) => createImageBitmap(blob) : null,
    readPixels: (bitmap, w, h) => readPixels(bitmap as ImageBitmap, w, h),
    lookup: (id) => registry.get(id),
  }).then((reply) => {
    const transfer =
      reply.ok && reply.type === "decode" ? [reply.pixels.data.buffer as ArrayBuffer] : [];
    scope.postMessage(reply, transfer);
  });
});
