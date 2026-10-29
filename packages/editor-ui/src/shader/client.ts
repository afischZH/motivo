/**
 * Main-thread side of the shader stage (docs/ARCHITECTURE.md 4.15): sends
 * render requests of WebGL tools to a worker and resolves with an
 * `ImageBitmap` (preview, GIF frame) or an encoded file (export). Two
 * workers, so a long 8K export never holds up the preview.
 *
 * There is no main-thread fallback: every browser Musterli supports has
 * WebGL2 in workers (`OffscreenCanvas`), and drawing an 8K export on the
 * main thread would block the page. Without it the preview shows a notice
 * (`unavailable` or `unsupported`) and the export fails with `unavailable`.
 */
import type { AnyToolDefinition, CanvasSize } from "@musterli/tool-registry";
import type {
  ShaderEncodeOptions,
  ShaderRenderRequest,
  ShaderRenderResponse,
  ShaderWorkerError,
} from "./protocol";

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

/** Worker subset used here. */
export interface ShaderWorkerLike {
  onmessage: ((event: MessageEvent<ShaderRenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: ShaderRenderRequest): void;
  terminate(): void;
}

export interface ShaderClientEnv {
  /** Resolves to `null` where workers or `OffscreenCanvas` are unavailable. */
  createWorker(): Promise<ShaderWorkerLike | null>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ShaderJob {
  tool: AnyToolDefinition;
  params: Values;
  seed: number;
  /** Design size (render context). */
  design: CanvasSize;
  /** Output pixels. */
  out: CanvasSize;
  /** Loop time 0..1; absent: the still. */
  t?: number;
}

export type ShaderFailure = ShaderWorkerError | "timeout" | "unavailable" | "aborted";

export class ShaderRenderError extends Error {
  constructor(readonly code: ShaderFailure) {
    super(`Shader render failed: ${code}`);
    this.name = "ShaderRenderError";
  }
}

export interface ShaderClient {
  /** Preview frame. Rejects with `ShaderRenderError`. */
  preview(job: ShaderJob): Promise<ImageBitmap>;
  /** A frame on the export worker (GIF). Rejects with `ShaderRenderError`. */
  frame(job: ShaderJob, signal?: AbortSignal): Promise<ImageBitmap>;
  /**
   * Full-size export in tiles. Rejects with `ShaderRenderError`. Aborting
   * `signal` ends the export worker at once.
   */
  encode(
    job: ShaderJob,
    options: ShaderEncodeOptions,
    signal?: AbortSignal,
    onProgress?: (fraction: number) => void,
  ): Promise<Blob>;
  dispose(): void;
}

/** Preview frames are small; a stuck worker is replaced after this. */
export const SHADER_PREVIEW_TIMEOUT_MS = 30_000;
/**
 * An export may take long in total (8K on a slow GPU), but every tile row
 * reports progress; the worker is replaced after this long without any.
 */
export const SHADER_EXPORT_IDLE_TIMEOUT_MS = 60_000;

/**
 * A worker that crashes (worker error, unreadable message) is started again
 * on the next call. After this many crashes in a row without one good reply
 * the channel gives up until it is disposed, so a browser that kills every
 * new worker does not get a new one per preview frame.
 */
export const SHADER_MAX_CRASHES = 3;

type Settle = (reply: Extract<ShaderRenderResponse, { ok: boolean }> | ShaderFailure) => void;

/** One worker with its pending calls. */
function createChannel(env: ShaderClientEnv, timeoutMs: number) {
  let worker: ShaderWorkerLike | null = null;
  let starting: Promise<ShaderWorkerLike | null> | null = null;
  /** No workers here at all (`createWorker` gave none), or too many crashes in a row. */
  let broken = false;
  /** Crashes since the last good reply. */
  let crashes = 0;
  /** The worker gave up on a lost GPU context: replace it once it is idle. */
  let stale = false;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: Settle; timer: unknown; arm(): void; onProgress?: (f: number) => void }
  >();

  const settleAll = (failure: ShaderFailure) => {
    for (const { resolve, timer } of pending.values()) {
      env.clearTimeout(timer);
      resolve(failure);
    }
    pending.clear();
  };

  const stop = () => {
    worker?.terminate();
    worker = null;
    starting = null;
  };

  const getWorker = (): Promise<ShaderWorkerLike | null> => {
    if (broken) return Promise.resolve(null);
    // A new worker gets a new GPU context; calls in flight finish on the old one.
    if (stale && worker && pending.size === 0) {
      stale = false;
      stop();
    }
    if (worker) return Promise.resolve(worker);
    starting ??= env
      .createWorker()
      .catch(() => null)
      .then((w) => {
        if (!w) {
          broken = true;
          return null;
        }
        w.onmessage = (event) => {
          const data = event.data;
          const entry = pending.get(data.id);
          if ("progress" in data) {
            if (entry) {
              entry.arm();
              entry.onProgress?.(data.progress);
            }
            return;
          }
          if (!entry) {
            // Late reply of a timed-out call: free the bitmap.
            if (data.ok && "bitmap" in data) data.bitmap.close();
            return;
          }
          pending.delete(data.id);
          env.clearTimeout(entry.timer);
          if (data.ok) crashes = 0;
          else if (data.error === "context-lost") stale = true;
          entry.resolve(data);
        };
        // Ends the calls in flight; the next call starts a new worker.
        const crash = (event?: Event) => {
          event?.preventDefault();
          if (worker !== w) return;
          crashes++;
          if (crashes >= SHADER_MAX_CRASHES) broken = true;
          stop();
          settleAll("unavailable");
        };
        w.onerror = crash;
        w.onmessageerror = crash;
        worker = w;
        return w;
      });
    return starting;
  };

  const run = async (
    request: Omit<ShaderRenderRequest, "id">,
    signal?: AbortSignal,
    onProgress?: (fraction: number) => void,
  ): Promise<Extract<ShaderRenderResponse, { ok: true }>> => {
    if (signal?.aborted) throw new ShaderRenderError("aborted");
    const w = await getWorker();
    if (!w) throw new ShaderRenderError("unavailable");
    if (signal?.aborted) throw new ShaderRenderError("aborted");
    const id = nextId++;
    const reply = await new Promise<Extract<ShaderRenderResponse, { ok: boolean }> | ShaderFailure>(
      (resolve) => {
        // Ends every call in flight on this worker: it is restarted on the next call.
        const restart = (failure: ShaderFailure) => {
          signal?.removeEventListener("abort", onAbort);
          pending.delete(id);
          stop();
          settleAll(failure);
          resolve(failure);
        };
        const onAbort = () => {
          const entry = pending.get(id);
          if (entry) env.clearTimeout(entry.timer);
          restart("aborted");
        };
        const entry = {
          resolve: ((r) => {
            signal?.removeEventListener("abort", onAbort);
            resolve(r);
          }) as Settle,
          timer: undefined as unknown,
          arm() {
            env.clearTimeout(entry.timer);
            entry.timer = env.setTimeout(() => restart("timeout"), timeoutMs);
          },
          ...(onProgress ? { onProgress } : {}),
        };
        entry.arm();
        pending.set(id, entry);
        signal?.addEventListener("abort", onAbort, { once: true });
        w.postMessage({ ...request, id });
      },
    );
    if (typeof reply === "string") throw new ShaderRenderError(reply);
    if (!reply.ok) throw new ShaderRenderError(reply.error);
    return reply;
  };

  return {
    run,
    dispose() {
      stop();
      settleAll("unavailable");
    },
  };
}

function requestOf(job: ShaderJob): Omit<ShaderRenderRequest, "id"> {
  return {
    toolId: job.tool.id,
    params: job.params,
    seed: job.seed,
    design: { width: job.design.width, height: job.design.height },
    out: { width: job.out.width, height: job.out.height },
    ...(job.t === undefined ? {} : { t: job.t }),
  };
}

export function createShaderClient(env: ShaderClientEnv): ShaderClient {
  const previewChannel = createChannel(env, SHADER_PREVIEW_TIMEOUT_MS);
  const exportChannel = createChannel(env, SHADER_EXPORT_IDLE_TIMEOUT_MS);
  const bitmapOf = (reply: Extract<ShaderRenderResponse, { ok: true }>): ImageBitmap => {
    if (!("bitmap" in reply)) throw new ShaderRenderError("render-failed");
    return reply.bitmap;
  };
  return {
    async preview(job) {
      return bitmapOf(await previewChannel.run(requestOf(job)));
    },
    async frame(job, signal) {
      return bitmapOf(await exportChannel.run(requestOf(job), signal));
    },
    async encode(job, options, signal, onProgress) {
      const reply = await exportChannel.run(
        { ...requestOf(job), encode: options },
        signal,
        onProgress,
      );
      if (!("blob" in reply)) throw new ShaderRenderError("render-failed");
      return reply.blob;
    },
    dispose() {
      previewChannel.dispose();
      exportChannel.dispose();
    },
  };
}

let shared: ShaderClient | null = null;
let users = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * After the last user lets go, the page-wide client waits this long, then
 * ends its workers and their GPU contexts (browsers allow only a few).
 */
export const SHADER_IDLE_DISPOSE_MS = 30_000;

/**
 * Marks the page-wide client as in use (shader motifs while mounted,
 * exports while running). Returns the release function; once nobody holds
 * the client for `SHADER_IDLE_DISPOSE_MS`, its workers are ended and
 * recreated on next use.
 */
export function retainShaderClient(): () => void {
  users++;
  if (idleTimer !== null) {
    globalThis.clearTimeout(idleTimer);
    idleTimer = null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    users--;
    if (users > 0) return;
    idleTimer = globalThis.setTimeout(() => {
      idleTimer = null;
      if (users > 0 || shared === null) return;
      shared.dispose();
      shared = null;
    }, SHADER_IDLE_DISPOSE_MS);
  };
}

/** The page-wide client with real workers (created on first use). Browser only. */
export function shaderClient(): ShaderClient {
  shared ??= createShaderClient({
    createWorker: async () => {
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
      const { createShaderWorker } = await import("./worker");
      return createShaderWorker() as unknown as ShaderWorkerLike;
    },
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  return shared;
}
