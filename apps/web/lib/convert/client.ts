/**
 * Dispatches conversions to a Web Worker and falls back to the main thread
 * when no worker can be created or the worker fails (load error, crash,
 * undecodable message). Framework-free so it can be unit tested.
 */
import type { WorkerRequest, WorkerResponse } from "./convert.worker";
import { runConverter, type ConverterResult } from "./run";

/** The part of `Worker` the client uses. */
export interface ConverterWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

export interface ConverterClient {
  /** Converts in the worker if one is alive, else synchronously on the main thread. */
  request(request: WorkerRequest): void;
  dispose(): void;
}

export function createConverterClient(options: {
  /** Returns null (or throws) where workers are unavailable. */
  createWorker(): ConverterWorker | null;
  onResult(requestId: number, result: ConverterResult): void;
}): ConverterClient {
  const { onResult } = options;
  let worker: ConverterWorker | null = null;
  /** Requests sent to the worker without a response yet. */
  const pending = new Map<number, WorkerRequest>();

  const runHere = (request: WorkerRequest) =>
    onResult(request.requestId, runConverter(request.id, request.input));

  /** Drops the broken worker for good and finishes its open requests here. */
  const fail = () => {
    worker?.terminate();
    worker = null;
    const open = [...pending.values()];
    pending.clear();
    for (const request of open) runHere(request);
  };

  try {
    worker = options.createWorker();
  } catch {
    worker = null;
  }
  if (worker) {
    worker.onmessage = (event) => {
      const { requestId, result } = event.data;
      pending.delete(requestId);
      onResult(requestId, result);
    };
    worker.onerror = (event) => {
      // Handled here: keep it out of the console as an uncaught error.
      event.preventDefault();
      fail();
    };
    worker.onmessageerror = fail;
  }

  return {
    request(request) {
      if (worker) {
        pending.set(request.requestId, request);
        worker.postMessage(request);
      } else {
        runHere(request);
      }
    },
    dispose() {
      worker?.terminate();
      worker = null;
      pending.clear();
    },
  };
}
