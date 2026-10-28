/**
 * Sanitising SVG uploads in a worker (docs/ARCHITECTURE.md section 6). The
 * sanitizer is pure but a hostile 1 MB file keeps it busy for up to about
 * 200 ms, too long for the main thread (50 ms rule).
 *
 * Every call has a timeout and can be aborted. The work inside the worker
 * cannot be interrupted, so a timeout or an abort terminates the worker; the
 * next call starts a fresh one. Where workers are missing (old browsers,
 * jsdom) or the worker cannot start, the pure handlers run on the main
 * thread instead: correct, just not off the main thread.
 */
import type { SvgRect } from "@motivo/svg-sanitizer";
import {
  cropSvg,
  readSvg,
  type SanitizeWorkerRequest,
  type SanitizeWorkerResponse,
  type SvgCropOutcome,
  type SvgReadOutcome,
} from "./sanitize-protocol";

/** Longest a sanitizer call may take (worst measured cases stay far below 1 s). */
export const SANITIZE_TIMEOUT_MS = 10_000;

/** Failures of the transport, not of the file. */
export type SanitizeFailure = { ok: false; error: "svg-timeout" | "aborted" };

export interface SvgSanitizer {
  /** Decodes and sanitises an SVG file's bytes. */
  read(
    bytes: Uint8Array,
    maxLength: number,
    signal?: AbortSignal,
  ): Promise<SvgReadOutcome | SanitizeFailure>;
  /** Crops sanitised SVG and prepares it for rendering. */
  crop(
    svg: string,
    crop: SvgRect,
    maxLength: number,
    signal?: AbortSignal,
  ): Promise<SvgCropOutcome | SanitizeFailure>;
  /** Stops the worker. */
  dispose(): void;
}

/** Worker subset used here. */
export interface SanitizeWorkerLike {
  onmessage: ((event: MessageEvent<SanitizeWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: SanitizeWorkerRequest): void;
  terminate(): void;
}

export interface SanitizeEnv {
  /** Resolves to `null` where workers are unavailable. */
  createWorker(): Promise<SanitizeWorkerLike | null>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Default `SANITIZE_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** `restarted`: another call stopped the worker while this one waited (retried once). */
type Failure = "timeout" | "aborted" | "unavailable" | "restarted";
type CallResult = SanitizeWorkerResponse | { failure: Failure };

type Request = SanitizeWorkerRequest extends infer R
  ? R extends unknown
    ? Omit<R, "id">
    : never
  : never;

export function createSvgSanitizer(env: SanitizeEnv): SvgSanitizer {
  const timeoutMs = env.timeoutMs ?? SANITIZE_TIMEOUT_MS;
  let worker: SanitizeWorkerLike | null = null;
  let starting: Promise<SanitizeWorkerLike | null> | null = null;
  /** A worker that failed to load or crashed is not tried again (main thread from then on). */
  let broken = false;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve(r: CallResult): void; timer: unknown; cleanup(): void }
  >();

  const settle = (id: number, result: CallResult) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    env.clearTimeout(entry.timer);
    entry.cleanup();
    entry.resolve(result);
  };

  const settleAll = (failure: Failure) => {
    for (const id of [...pending.keys()]) settle(id, { failure });
  };

  const stop = () => {
    worker?.terminate();
    worker = null;
    starting = null;
  };

  const getWorker = async (): Promise<SanitizeWorkerLike | null> => {
    if (broken) return null;
    if (worker) return worker;
    starting ??= env
      .createWorker()
      .catch(() => null)
      .then((w) => {
        if (!w) {
          broken = true;
          return null;
        }
        w.onmessage = (event) => settle(event.data.id, event.data);
        const crash = (event?: Event) => {
          // Handled here: keep it out of the console as an uncaught error.
          event?.preventDefault();
          broken = true;
          if (worker === w) stop();
          else w.terminate();
          settleAll("unavailable");
        };
        w.onerror = crash;
        w.onmessageerror = crash;
        worker = w;
        return w;
      });
    return starting;
  };

  const call = async (request: Request, signal?: AbortSignal): Promise<CallResult> => {
    if (signal?.aborted) return { failure: "aborted" };
    const w = await getWorker();
    if (!w) return { failure: "unavailable" };
    if (signal?.aborted) return { failure: "aborted" };
    const id = nextId++;
    return new Promise<CallResult>((resolve) => {
      // The sanitizer cannot be interrupted: stop the worker; other waiting calls retry.
      const kill = (failure: "timeout" | "aborted") => {
        settle(id, { failure });
        if (worker === w) {
          stop();
          settleAll("restarted");
        }
      };
      const onAbort = () => kill("aborted");
      const timer = env.setTimeout(() => kill("timeout"), timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      pending.set(id, {
        resolve,
        timer,
        cleanup: () => signal?.removeEventListener("abort", onAbort),
      });
      w.postMessage({ ...request, id } as SanitizeWorkerRequest);
    });
  };

  /** Turns a call result into an outcome; `here` runs the handler on the main thread. */
  const callWithRetry = async (request: Request, signal?: AbortSignal): Promise<CallResult> => {
    const reply = await call(request, signal);
    return "failure" in reply && reply.failure === "restarted" ? call(request, signal) : reply;
  };

  const outcome = <T>(
    reply: CallResult,
    type: SanitizeWorkerResponse["type"],
    here: () => T,
  ): T | SanitizeFailure => {
    if ("failure" in reply) {
      if (reply.failure === "timeout") return { ok: false, error: "svg-timeout" };
      if (reply.failure === "aborted") return { ok: false, error: "aborted" };
      if (reply.failure === "restarted") return { ok: false, error: "svg-timeout" };
      // No worker, or it failed to load or crashed (`broken` is set): main thread.
      return here();
    }
    if (reply.type !== type) return here();
    // The outcome is the reply without its routing fields.
    const { id, type: replyType, ...rest } = reply;
    void id;
    void replyType;
    return rest as T;
  };

  return {
    async read(bytes, maxLength, signal) {
      // Copied, not transferred: the main-thread fallback may still need the bytes.
      const copy = bytes.slice().buffer as ArrayBuffer;
      const reply = await callWithRetry({ type: "read", bytes: copy, maxLength }, signal);
      return outcome<SvgReadOutcome>(reply, "read", () => readSvg(bytes, maxLength));
    },
    async crop(svg, rect, maxLength, signal) {
      const reply = await callWithRetry({ type: "crop", svg, crop: rect, maxLength }, signal);
      return outcome<SvgCropOutcome>(reply, "crop", () => cropSvg(svg, rect, maxLength));
    },
    dispose() {
      stop();
      settleAll("aborted");
    },
  };
}

/** The real browser sanitizer: lazy worker, real timers. Only call in a browser. */
export function browserSvgSanitizer(): SvgSanitizer {
  return createSvgSanitizer({
    createWorker: async () => {
      if (typeof Worker === "undefined") return null;
      const { createSanitizeWorker } = await import("./sanitize-worker");
      return createSanitizeWorker() as unknown as SanitizeWorkerLike;
    },
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
}
