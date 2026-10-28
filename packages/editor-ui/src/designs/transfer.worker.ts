/**
 * Import worker: reads and validates a designs file off the main thread
 * (JSON parsing, every tool schema and the SVG sanitizer can take far more
 * than 50 ms for a large file). Started by `createTransferWorker`.
 */
import { registry } from "@motivo/tool-registry";
import { DESIGNS_FILE_MAX_BYTES, parseDesignsFile } from "./transfer";
import type { TransferWorkerRequest, TransferWorkerResponse } from "./import-client";

/** The part of `DedicatedWorkerGlobalScope` used here (the package compiles with the DOM lib). */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<TransferWorkerRequest>) => void,
  ): void;
  postMessage(message: TransferWorkerResponse): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener("message", (event) => {
  const { id, file } = event.data;
  const reply = (result: TransferWorkerResponse["result"]) => scope.postMessage({ id, result });
  if (file.size > DESIGNS_FILE_MAX_BYTES) {
    reply({ ok: false, error: "too-large" });
    return;
  }
  file.text().then(
    (text) => reply(parseDesignsFile(text, registry)),
    () => reply({ ok: false, error: "malformed" }),
  );
});
