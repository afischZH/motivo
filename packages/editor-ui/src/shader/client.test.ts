import { registry, type AnyToolDefinition } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import {
  SHADER_EXPORT_IDLE_TIMEOUT_MS,
  ShaderRenderError,
  createShaderClient,
  type ShaderClientEnv,
  type ShaderWorkerLike,
} from "./client";
import type { ShaderRenderRequest, ShaderRenderResponse } from "./protocol";

const tool = registry.get("shader-gradient") as AnyToolDefinition;
const job = {
  tool,
  params: tool.defaults,
  seed: 1,
  design: { width: 160, height: 100 },
  out: { width: 80, height: 50 },
};

type Reply = (request: ShaderRenderRequest, worker: FakeWorker) => void;

interface FakeWorker extends ShaderWorkerLike {
  requests: ShaderRenderRequest[];
  terminated: boolean;
  send(message: ShaderRenderResponse): void;
}

function fakeEnv(reply: Reply, options: { workers?: boolean } = {}) {
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const workers: FakeWorker[] = [];
  const env: ShaderClientEnv = {
    createWorker() {
      if (options.workers === false) return Promise.resolve(null);
      const worker: FakeWorker = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        requests: [],
        terminated: false,
        postMessage(message) {
          worker.requests.push(message);
          queueMicrotask(() => reply(message, worker));
        },
        terminate() {
          worker.terminated = true;
        },
        send(message) {
          worker.onmessage?.({ data: message } as MessageEvent<ShaderRenderResponse>);
        },
      };
      workers.push(worker);
      return Promise.resolve(worker);
    },
    setTimeout(fn) {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
  };
  const fireTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const fn of pending) fn();
  };
  return { env, workers, timers, fireTimers };
}

/** Lets queued microtasks and worker start-up run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const bitmap = (closed: { n: number }) =>
  ({ width: 80, height: 50, close: () => closed.n++ }) as unknown as ImageBitmap;

describe("shader client", () => {
  it("returns preview bitmaps and passes the loop time", async () => {
    const closed = { n: 0 };
    const { env, workers } = fakeEnv((r, w) =>
      w.send({ id: r.id, ok: true, bitmap: bitmap(closed) }),
    );
    const client = createShaderClient(env);
    const result = await client.preview({ ...job, t: 0.5 });
    expect(result.width).toBe(80);
    expect(workers[0]?.requests[0]).toMatchObject({ toolId: "shader-gradient", t: 0.5 });
    expect(workers[0]?.requests[0]).not.toHaveProperty("encode");
  });

  it("encodes on a separate worker and forwards progress", async () => {
    const { env, workers } = fakeEnv((r, w) => {
      w.send({ id: r.id, progress: 0.5 });
      w.send({ id: r.id, ok: true, blob: new Blob(["x"], { type: "image/png" }) });
    });
    const client = createShaderClient(env);
    await client.preview(job).catch(() => undefined);
    const progress: number[] = [];
    const blob = await client.encode(job, { mime: "image/png" }, undefined, (f) =>
      progress.push(f),
    );
    expect(blob.type).toBe("image/png");
    expect(progress).toEqual([0.5]);
    expect(workers).toHaveLength(2);
    expect(workers[1]?.requests[0]?.encode).toEqual({ mime: "image/png" });
  });

  it("maps worker errors and missing workers", async () => {
    const { env } = fakeEnv((r, w) => w.send({ id: r.id, ok: false, error: "unsupported" }));
    await expect(createShaderClient(env).preview(job)).rejects.toMatchObject({
      code: "unsupported",
    });
    const none = fakeEnv(() => undefined, { workers: false });
    const error = await createShaderClient(none.env)
      .preview(job)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ShaderRenderError);
    expect((error as ShaderRenderError).code).toBe("unavailable");
  });

  it("ends the export worker on abort and on silence", async () => {
    const { env, workers, fireTimers } = fakeEnv(() => undefined);
    const client = createShaderClient(env);
    const controller = new AbortController();
    const aborted = client.encode(job, { mime: "image/png" }, controller.signal);
    await settle();
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ code: "aborted" });
    expect(workers[0]?.terminated).toBe(true);

    const stuck = client.encode(job, { mime: "image/png" });
    await settle();
    expect(SHADER_EXPORT_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
    fireTimers();
    await expect(stuck).rejects.toMatchObject({ code: "timeout" });
    expect(workers[1]?.terminated).toBe(true);
  });

  it("frees bitmaps that arrive after a timeout", async () => {
    const closed = { n: 0 };
    let late: (() => void) | undefined;
    const { env, fireTimers } = fakeEnv((r, w) => {
      late = () => w.send({ id: r.id, ok: true, bitmap: bitmap(closed) });
    });
    const client = createShaderClient(env);
    const pending = client.preview(job);
    await settle();
    fireTimers();
    await expect(pending).rejects.toMatchObject({ code: "timeout" });
    // The worker was replaced; a reply of the old one is dropped and freed.
    late?.();
    expect(closed.n).toBe(1);
  });
});
