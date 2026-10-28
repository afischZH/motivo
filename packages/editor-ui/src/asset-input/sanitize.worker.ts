/**
 * SVG sanitize worker: sanitises and crops SVG uploads off the main thread
 * (a hostile 1 MB file takes up to about 200 ms). Only imports the sanitizer
 * and the SVG asset helpers, so it starts fast. Started by
 * `createSanitizeWorker` (sanitize-worker.ts).
 */
import {
  handleSanitizeRequest,
  type SanitizeWorkerRequest,
  type SanitizeWorkerResponse,
} from "./sanitize-protocol";

/** The part of `DedicatedWorkerGlobalScope` used here (the package compiles with the DOM lib). */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<SanitizeWorkerRequest>) => void,
  ): void;
  postMessage(message: SanitizeWorkerResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener("message", (event) => {
  scope.postMessage(handleSanitizeRequest(event.data));
});
