/**
 * Reads a designs file for import: in the import worker where possible,
 * otherwise (no Worker, worker failed to start) on the main thread. Files
 * over the size limit are refused before a single byte is read.
 */
import { DESIGNS_FILE_MAX_BYTES, type DesignsFileParseResult } from "./transfer-format";

export interface TransferWorkerRequest {
  id: number;
  file: Blob;
}

export interface TransferWorkerResponse {
  id: number;
  result: DesignsFileParseResult;
}

/** Longest an import may take before it is given up. */
export const IMPORT_TIMEOUT_MS = 60_000;

export type ReadDesignsFileResult =
  DesignsFileParseResult | { ok: false; error: "timeout" | "aborted" };

export interface ReadDesignsFileOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Default: the bundled import worker; `null` forces the main thread (tests). */
  createWorker?: (() => Promise<Worker>) | null;
}

let nextId = 1;

const defaultCreateWorker = async (): Promise<Worker> => {
  const { createTransferWorker } = await import("./transfer-worker");
  return createTransferWorker();
};

async function parseOnMain(file: Blob): Promise<DesignsFileParseResult> {
  const [{ parseDesignsFile }, { registry }] = await Promise.all([
    import("./transfer"),
    import("@motivo/tool-registry"),
  ]);
  try {
    return parseDesignsFile(await file.text(), registry);
  } catch {
    return { ok: false, error: "malformed" };
  }
}

/** Validates an import file. Never throws. */
export async function readDesignsFile(
  file: Blob,
  options: ReadDesignsFileOptions = {},
): Promise<ReadDesignsFileResult> {
  if (file.size > DESIGNS_FILE_MAX_BYTES) return { ok: false, error: "too-large" };
  if (file.size === 0) return { ok: false, error: "empty" };
  if (options.signal?.aborted) return { ok: false, error: "aborted" };

  const create =
    options.createWorker === null
      ? null
      : (options.createWorker ?? (typeof Worker === "function" ? defaultCreateWorker : null));
  let worker: Worker | null = null;
  if (create) {
    try {
      worker = await create();
    } catch {
      worker = null;
    }
  }
  if (!worker) return parseOnMain(file);

  const w = worker;
  const id = nextId++;
  return new Promise<ReadDesignsFileResult>((resolve) => {
    let settled = false;
    const finish = (result: ReadDesignsFileResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      w.terminate();
      // A worker that could not run (bundling, CSP) falls back to the main thread.
      if (result === null) void parseOnMain(file).then(resolve);
      else resolve(result);
    };
    const onAbort = () => finish({ ok: false, error: "aborted" });
    const timer = setTimeout(
      () => finish({ ok: false, error: "timeout" }),
      options.timeoutMs ?? IMPORT_TIMEOUT_MS,
    );
    options.signal?.addEventListener("abort", onAbort);
    w.onmessage = (event: MessageEvent<TransferWorkerResponse>) => {
      if (event.data?.id === id) finish(event.data.result);
    };
    w.onerror = (event) => {
      event.preventDefault();
      finish(null);
    };
    w.onmessageerror = () => finish(null);
    const request: TransferWorkerRequest = { id, file };
    w.postMessage(request);
  });
}
