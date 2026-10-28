/**
 * GIF worker entry: quantises and encodes frames with `gifenc` off the main
 * thread (see `createGifSession`). `gifenc` itself is loaded with a dynamic
 * import on `gif-start`. Started by `createGifWorker` (gif-worker.ts).
 */
import { createGifSession, isGifMessage, type GifMessage } from "./gif-encode";

/** The part of `DedicatedWorkerGlobalScope` used here (the package compiles with the DOM lib). */
interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<GifMessage>) => void): void;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;
const session = createGifSession();
// Messages are asynchronous; handle them strictly in arrival order.
let queue: Promise<void> = Promise.resolve();

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (!isGifMessage(message)) return;
  queue = queue.then(() => session.handle(message).then((reply) => scope.postMessage(reply)));
});
