/**
 * Runs conversions off the main thread, so a 5 MB input never blocks the UI.
 * Messages carry plain data only; nothing from the input is ever evaluated.
 */
import type { ConverterId } from "./ids";
import { runConverter, type ConverterInput, type ConverterResult } from "./run";

export type WorkerRequest = { requestId: number; id: ConverterId; input: ConverterInput };
export type WorkerResponse = { requestId: number; result: ConverterResult };

/** The part of DedicatedWorkerGlobalScope we use (the app compiles against the DOM lib). */
type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer: Transferable[]) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { requestId, id, input } = event.data;
  const result = runConverter(id, input);
  const transfer =
    result.ok && result.value.kind === "image" ? [result.value.bytes.buffer as ArrayBuffer] : [];
  scope.postMessage({ requestId, result }, transfer);
};
