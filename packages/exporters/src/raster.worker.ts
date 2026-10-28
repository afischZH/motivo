/**
 * Raster worker entry: encodes bitmaps on an `OffscreenCanvas` and streams
 * PNG strips (see `createStripSession`), off the main thread. Started by
 * `createRasterWorker` (raster-worker.ts).
 */
import {
  createStripSession,
  handleEncodeRequest,
  isStripMessage,
  type EncodeRequest,
  type OffscreenCanvasLike,
  type StripMessage,
} from "./raster-encode";

/** The part of `DedicatedWorkerGlobalScope` used here (the package compiles with the DOM lib). */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<EncodeRequest | StripMessage>) => void,
  ): void;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;
const strips = createStripSession();
// Strip messages are asynchronous; handle them strictly in arrival order.
let queue: Promise<void> = Promise.resolve();

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (isStripMessage(message)) {
    queue = queue.then(() => strips.handle(message).then((reply) => scope.postMessage(reply)));
    return;
  }
  void handleEncodeRequest(
    message,
    (w, h) => new OffscreenCanvas(w, h) as unknown as OffscreenCanvasLike,
  ).then((reply) => scope.postMessage(reply));
});
