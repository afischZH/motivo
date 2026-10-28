/**
 * Reads and validates an import file (designs, brand kit) in a worker where
 * possible, otherwise (no Worker, worker failed to start or crashed) on the
 * main thread. JSON parsing, tool schemas and the SVG sanitizer can take far
 * more than 50 ms for a large file. Never throws.
 */

export interface FileWorkerRequest {
  id: number;
  file: Blob;
}

export interface FileWorkerResponse<R> {
  id: number;
  result: R;
}

export type ReadFileFailure = { ok: false; error: "timeout" | "aborted" };

export interface ReadFileOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Default: the bundled worker; `null` forces the main thread (tests). */
  createWorker?: (() => Promise<Worker>) | null;
}

export interface FileImporter<R> {
  /** Largest accepted file in bytes; larger files are refused unread. */
  maxBytes: number;
  defaultTimeoutMs: number;
  tooLarge: R;
  empty: R;
  /** Starts the worker (dynamic import keeps it out of the page bundle). */
  createWorker(): Promise<Worker>;
  /** Same validation on the main thread. */
  parseOnMain(file: Blob): Promise<R>;
}

let nextId = 1;

export async function readFileInWorker<R>(
  reader: FileImporter<R>,
  file: Blob,
  options: ReadFileOptions = {},
): Promise<R | ReadFileFailure> {
  if (file.size > reader.maxBytes) return reader.tooLarge;
  if (file.size === 0) return reader.empty;
  if (options.signal?.aborted) return { ok: false, error: "aborted" };

  const create =
    options.createWorker === null
      ? null
      : (options.createWorker ??
        (typeof Worker === "function" ? () => reader.createWorker() : null));
  let worker: Worker | null = null;
  if (create) {
    try {
      worker = await create();
    } catch {
      worker = null;
    }
  }
  if (!worker) return reader.parseOnMain(file);

  const w = worker;
  const id = nextId++;
  return new Promise<R | ReadFileFailure>((resolve) => {
    let settled = false;
    const finish = (result: R | ReadFileFailure | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      w.terminate();
      // A worker that could not run (bundling, CSP) falls back to the main thread.
      if (result === null) void reader.parseOnMain(file).then(resolve);
      else resolve(result);
    };
    const onAbort = () => finish({ ok: false, error: "aborted" });
    const timer = setTimeout(
      () => finish({ ok: false, error: "timeout" }),
      options.timeoutMs ?? reader.defaultTimeoutMs,
    );
    options.signal?.addEventListener("abort", onAbort);
    w.onmessage = (event: MessageEvent<FileWorkerResponse<R>>) => {
      if (event.data?.id === id) finish(event.data.result);
    };
    w.onerror = (event) => {
      event.preventDefault();
      finish(null);
    };
    w.onmessageerror = () => finish(null);
    const request: FileWorkerRequest = { id, file };
    w.postMessage(request);
  });
}

/** The part of `DedicatedWorkerGlobalScope` a file worker uses. */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<FileWorkerRequest>) => void,
  ): void;
  postMessage(message: FileWorkerResponse<unknown>): void;
}

/**
 * Body of a file worker: answers each request with `parse(text)`, or the
 * given results for files over the limit and unreadable files.
 */
export function serveFileWorker<R>(
  scope: unknown,
  options: { maxBytes: number; tooLarge: R; unreadable: R; parse(text: string): R },
): void {
  const s = scope as WorkerScope;
  s.addEventListener("message", (event) => {
    const { id, file } = event.data;
    const reply = (result: R) => s.postMessage({ id, result });
    if (file.size > options.maxBytes) {
      reply(options.tooLarge);
      return;
    }
    // `parse` never throws by contract; if it still does (a stack overflow in
    // a dependency), answer anyway instead of leaving the page waiting for
    // the import timeout.
    file.text().then(
      (text) => {
        let result: R;
        try {
          result = options.parse(text);
        } catch {
          result = options.unreadable;
        }
        reply(result);
      },
      () => reply(options.unreadable),
    );
  });
}
