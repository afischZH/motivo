/**
 * Raster worker entry: encodes bitmaps on an `OffscreenCanvas`, off the main
 * thread. Started by `createRasterWorker` (raster-worker.ts).
 */
import { handleEncodeRequest, type EncodeRequest, type OffscreenCanvasLike } from "./raster-encode";

/** The part of `DedicatedWorkerGlobalScope` used here (the package compiles with the DOM lib). */
interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<EncodeRequest>) => void): void;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener("message", (event) => {
  void handleEncodeRequest(
    event.data,
    (w, h) => new OffscreenCanvas(w, h) as unknown as OffscreenCanvasLike,
  ).then((reply) => scope.postMessage(reply));
});
