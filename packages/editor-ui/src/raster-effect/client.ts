/**
 * Main-thread side of the raster-effect stage (docs/ARCHITECTURE.md 4.13):
 * sends render requests of image-effect tools to a worker and resolves with
 * an `ImageBitmap` (preview) or an encoded file (export). Two workers, so a
 * long full-size export never holds up the preview. The photo's data URI
 * (up to 24 MB) is posted once per worker; later requests name it by key.
 *
 * Without workers or `OffscreenCanvas` there is no main-thread fallback: a
 * 12 MP effect would block the page for seconds. The preview then shows an
 * empty box and the export fails with `unavailable`.
 */
import { photoAssetOf, type AnyToolDefinition, type CanvasSize } from "@musterli/tool-registry";
import type {
  EffectEncodeOptions,
  EffectRenderRequest,
  EffectRenderResponse,
  EffectWorkerError,
} from "./protocol";

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

/** Worker subset used here. */
export interface EffectWorkerLike {
  onmessage: ((event: MessageEvent<EffectRenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: EffectRenderRequest): void;
  terminate(): void;
}

export interface RasterEffectEnv {
  /** Resolves to `null` where workers are unavailable. */
  createWorker(): Promise<EffectWorkerLike | null>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RasterEffectJob {
  tool: AnyToolDefinition;
  params: Values;
  seed: number;
  /** Design size (render context). */
  design: CanvasSize;
  /** Output pixels. */
  out: CanvasSize;
}

export type RasterEffectFailure = EffectWorkerError | "timeout" | "unavailable";

export class RasterEffectError extends Error {
  constructor(readonly code: RasterEffectFailure) {
    super(`Raster effect failed: ${code}`);
    this.name = "RasterEffectError";
  }
}

export interface RasterEffectClient {
  /** Preview frame. Rejects with `RasterEffectError`. */
  preview(job: RasterEffectJob): Promise<ImageBitmap>;
  /** Full-size export. Rejects with `RasterEffectError`. */
  encode(job: RasterEffectJob, options: EffectEncodeOptions): Promise<Blob>;
  dispose(): void;
}

/** Preview frames are small; a stuck worker is replaced after this. */
export const EFFECT_PREVIEW_TIMEOUT_MS = 30_000;
/** A 8192 px export of a 12 MP photo takes a few seconds on a slow phone. */
export const EFFECT_EXPORT_TIMEOUT_MS = 120_000;

const photoKeys = new WeakMap<object, string>();
let nextPhotoKey = 1;

/** Stable key of a photo asset object (a new upload is a new object). */
function photoKeyOf(tool: AnyToolDefinition, params: Values): string | null {
  const key = tool.photoSource?.param;
  const asset = key === undefined ? undefined : params[key];
  if (typeof asset !== "object" || asset === null || photoAssetOf(tool, params) === null) {
    return null;
  }
  let id = photoKeys.get(asset);
  if (id === undefined) {
    id = `p${nextPhotoKey++}`;
    photoKeys.set(asset, id);
  }
  return id;
}

/** One worker with its pending calls and the photos it holds. */
function createChannel(env: RasterEffectEnv, timeoutMs: number) {
  let worker: EffectWorkerLike | null = null;
  let starting: Promise<EffectWorkerLike | null> | null = null;
  let broken = false;
  let nextId = 1;
  /** Photo keys the current worker has received. */
  let sent = new Set<string>();
  const pending = new Map<
    number,
    { resolve(r: EffectRenderResponse | RasterEffectFailure): void; timer: unknown }
  >();

  const settleAll = (failure: RasterEffectFailure) => {
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
    sent = new Set();
  };

  const getWorker = (): Promise<EffectWorkerLike | null> => {
    if (broken) return Promise.resolve(null);
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
          const entry = pending.get(event.data.id);
          if (!entry) {
            // Late reply of a timed-out call: free the bitmap.
            if (event.data.ok && "bitmap" in event.data) event.data.bitmap.close();
            return;
          }
          pending.delete(event.data.id);
          env.clearTimeout(entry.timer);
          entry.resolve(event.data);
        };
        const crash = (event?: Event) => {
          event?.preventDefault();
          broken = true;
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

  const post = async (
    request: Omit<EffectRenderRequest, "id">,
  ): Promise<EffectRenderResponse | RasterEffectFailure> => {
    const w = await getWorker();
    if (!w) return "unavailable";
    const id = nextId++;
    return new Promise((resolve) => {
      const timer = env.setTimeout(() => {
        pending.delete(id);
        stop();
        settleAll("timeout");
        resolve("timeout");
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      w.postMessage({ ...request, id });
    });
  };

  return {
    async run(
      job: RasterEffectJob,
      encode?: EffectEncodeOptions,
    ): Promise<Extract<EffectRenderResponse, { ok: true }>> {
      const { tool } = job;
      const photo = photoAssetOf(tool, job.params);
      const key = photoKeyOf(tool, job.params);
      const param = tool.photoSource?.param;
      // The photo travels separately (once); the effect never reads it from params.
      const params = param === undefined ? job.params : { ...job.params, [param]: null };
      const base: Omit<EffectRenderRequest, "id" | "photo"> = {
        toolId: tool.id,
        params,
        seed: job.seed,
        design: job.design,
        out: job.out,
        ...(encode ? { encode } : {}),
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        const withHref = photo !== null && key !== null && (attempt > 0 || !sent.has(key));
        // Marked before the reply, so requests in flight do not post the photo again.
        if (withHref && key !== null) sent.add(key);
        const reply = await post({
          ...base,
          photo:
            photo === null || key === null ? null : withHref ? { key, href: photo.href } : { key },
        });
        if (typeof reply === "string") throw new RasterEffectError(reply);
        if (reply.ok) return reply;
        if (reply.error !== "missing-photo") throw new RasterEffectError(reply.error);
        if (key !== null) sent.delete(key);
      }
      throw new RasterEffectError("missing-photo");
    },
    dispose() {
      stop();
      settleAll("unavailable");
    },
  };
}

export function createRasterEffectClient(env: RasterEffectEnv): RasterEffectClient {
  const previewChannel = createChannel(env, EFFECT_PREVIEW_TIMEOUT_MS);
  const exportChannel = createChannel(env, EFFECT_EXPORT_TIMEOUT_MS);
  return {
    async preview(job) {
      const reply = await previewChannel.run(job);
      if (!("bitmap" in reply)) throw new RasterEffectError("render-failed");
      return reply.bitmap;
    },
    async encode(job, options) {
      const reply = await exportChannel.run(job, options);
      if (!("blob" in reply)) throw new RasterEffectError("render-failed");
      return reply.blob;
    },
    dispose() {
      previewChannel.dispose();
      exportChannel.dispose();
    },
  };
}

let shared: RasterEffectClient | null = null;

/** The page-wide client with real workers (created on first use). Browser only. */
export function rasterEffectClient(): RasterEffectClient {
  shared ??= createRasterEffectClient({
    createWorker: async () => {
      if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
      const { createRasterEffectWorker } = await import("./worker");
      return createRasterEffectWorker() as unknown as EffectWorkerLike;
    },
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  return shared;
}
