import { describe, expect, it, vi } from "vitest";

import {
  SVG_RENDER_TIMEOUT_MS,
  createSvgRenderClient,
  type SvgWorkerLike,
} from "./svg-render-client";
import type { SvgRenderRequest, SvgRenderResponse } from "./svg-render-protocol";

const JOB = { toolId: "polka-dots", params: { a: 1 }, seed: 1, size: { width: 10, height: 10 } };

/** A fake worker that answers each request with `answer`. */
function fakeWorker(answer: (request: SvgRenderRequest) => SvgRenderResponse | "silent" | "crash") {
  const posted: SvgRenderRequest[] = [];
  const worker: SvgWorkerLike = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      posted.push(message);
      const reply = answer(message);
      queueMicrotask(() => {
        if (reply === "silent") return;
        if (reply === "crash") worker.onerror?.({} as ErrorEvent);
        else worker.onmessage?.({ data: reply } as MessageEvent<SvgRenderResponse>);
      });
    },
    terminate: vi.fn(),
  };
  return { worker, posted };
}

function env(createWorker: () => Promise<SvgWorkerLike | null>) {
  return {
    createWorker: vi.fn(createWorker),
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle: unknown) => globalThis.clearTimeout(handle as number),
  };
}

describe("createSvgRenderClient", () => {
  it("returns the markup from the worker and reuses one worker", async () => {
    const { worker, posted } = fakeWorker((r) => ({
      id: r.id,
      ok: true,
      svg: `<svg id="${r.id}"/>`,
    }));
    const e = env(async () => worker);
    const client = createSvgRenderClient(e);
    await expect(client.render(JOB)).resolves.toBe('<svg id="1"/>');
    await expect(client.render(JOB)).resolves.toBe('<svg id="2"/>');
    expect(e.createWorker).toHaveBeenCalledTimes(1);
    expect(posted[0]).toEqual({ id: 1, ...JOB });
  });

  it("resolves to null without workers", async () => {
    const client = createSvgRenderClient(env(async () => null));
    await expect(client.render(JOB)).resolves.toBeNull();
  });

  it("resolves to null when the worker cannot render", async () => {
    const { worker } = fakeWorker((r) => ({ id: r.id, ok: false }));
    const client = createSvgRenderClient(env(async () => worker));
    await expect(client.render(JOB)).resolves.toBeNull();
  });

  it("replaces a crashed worker on the next job", async () => {
    let calls = 0;
    const crashing = fakeWorker(() => "crash");
    const healthy = fakeWorker((r) => ({ id: r.id, ok: true, svg: "<svg/>" }));
    const e = env(async () => (calls++ === 0 ? crashing.worker : healthy.worker));
    const client = createSvgRenderClient(e);
    await expect(client.render(JOB)).resolves.toBeNull();
    expect(crashing.worker.terminate).toHaveBeenCalled();
    await expect(client.render(JOB)).resolves.toBe("<svg/>");
    expect(e.createWorker).toHaveBeenCalledTimes(2);
  });

  it("gives up on a worker that does not answer", async () => {
    vi.useFakeTimers();
    try {
      const { worker } = fakeWorker(() => "silent");
      const client = createSvgRenderClient(env(async () => worker));
      const result = client.render(JOB);
      await vi.advanceTimersByTimeAsync(SVG_RENDER_TIMEOUT_MS);
      await expect(result).resolves.toBeNull();
      expect(worker.terminate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
