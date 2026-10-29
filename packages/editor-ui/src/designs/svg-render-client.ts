/**
 * Main-thread side of the SVG render worker: `renderSvgOffMain` returns the
 * markup of a design rendered in the worker, so app pages that show many
 * designs as pictures (template thumbnails, social backgrounds) never hold
 * the main thread for the generator. One worker for the page, started on
 * first use, jobs in order.
 *
 * Any worker problem (no `Worker`, a crash, a render error, no answer in
 * time) resolves to `null`; the caller then renders on the main thread as
 * before, so the result and its errors stay the same.
 */
import type { CanvasSize } from "@musterli/tool-registry";
import type { SvgRenderRequest, SvgRenderResponse } from "./svg-render-protocol";

/** Worker subset used here. */
export interface SvgWorkerLike {
  onmessage: ((event: MessageEvent<SvgRenderResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: SvgRenderRequest): void;
  terminate(): void;
}

export interface SvgRenderEnv {
  /** Resolves to `null` where workers are unavailable. */
  createWorker(): Promise<SvgWorkerLike | null>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SvgRenderJob {
  toolId: string;
  params: Readonly<Record<string, unknown>>;
  seed: number;
  size: CanvasSize;
}

/** A render that takes longer than this is treated as a stuck worker. */
export const SVG_RENDER_TIMEOUT_MS = 20_000;

export interface SvgRenderClient {
  /** The SVG markup, or `null` if the worker could not make it. */
  render(job: SvgRenderJob): Promise<string | null>;
  dispose(): void;
}

export function createSvgRenderClient(env: SvgRenderEnv): SvgRenderClient {
  let worker: Promise<SvgWorkerLike | null> | null = null;
  let nextId = 1;
  const pending = new Map<number, (svg: string | null) => void>();

  const reset = () => {
    const current = worker;
    worker = null;
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
    void current?.then((w) => w?.terminate());
  };

  const start = (): Promise<SvgWorkerLike | null> => {
    worker ??= env
      .createWorker()
      .catch(() => null)
      .then((w) => {
        if (!w) return null;
        w.onmessage = (event) => {
          const reply = event.data;
          const resolve = pending.get(reply.id);
          if (!resolve) return;
          pending.delete(reply.id);
          resolve(reply.ok ? reply.svg : null);
        };
        // A crashed worker is replaced on the next job.
        w.onerror = reset;
        w.onmessageerror = reset;
        return w;
      });
    return worker;
  };

  return {
    async render(job) {
      const w = await start();
      if (!w) return null;
      const id = nextId++;
      return new Promise<string | null>((resolve) => {
        const timer = env.setTimeout(() => {
          if (pending.has(id)) reset();
        }, SVG_RENDER_TIMEOUT_MS);
        pending.set(id, (svg) => {
          env.clearTimeout(timer);
          resolve(svg);
        });
        try {
          w.postMessage({ id, ...job });
        } catch {
          // Params that cannot be cloned: render on the main thread.
          pending.delete(id);
          env.clearTimeout(timer);
          resolve(null);
        }
      });
    },
    dispose: reset,
  };
}

let shared: SvgRenderClient | null = null;

/** The page's client, with the real worker where the browser has one. */
export function browserSvgRenderClient(): SvgRenderClient {
  shared ??= createSvgRenderClient({
    createWorker: async () => {
      if (typeof Worker !== "function") return null;
      const { createSvgRenderWorker } = await import("./svg-render-worker");
      return createSvgRenderWorker() as unknown as SvgWorkerLike;
    },
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  return shared;
}
