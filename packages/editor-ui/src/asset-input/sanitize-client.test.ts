import { recolorSvgAsset, svgAssetFor, clearSvgAssetCache } from "@musterli/tool-registry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finishAsset, readAsset } from "./prepare";
import {
  SANITIZE_TIMEOUT_MS,
  createSvgSanitizer,
  type SanitizeEnv,
  type SanitizeWorkerLike,
} from "./sanitize-client";
import {
  handleSanitizeRequest,
  type SanitizeWorkerRequest,
  type SanitizeWorkerResponse,
} from "./sanitize-protocol";

const MAX = 1_048_576;
const enc = (s: string) => new TextEncoder().encode(s);

const HOSTILE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" onload="alert(1)">' +
  '<script>alert(1)</script><rect width="40" height="20" fill="red"/></svg>';

type Mode = "answer" | "hang" | "crash";

/** In-process stand-in for the worker, answering through `handleSanitizeRequest`. */
class FakeWorker implements SanitizeWorkerLike {
  onmessage: ((event: MessageEvent<SanitizeWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  requests: SanitizeWorkerRequest[] = [];
  constructor(private mode: Mode = "answer") {}
  postMessage(message: SanitizeWorkerRequest): void {
    this.requests.push(message);
    if (this.mode === "hang") return;
    if (this.mode === "crash") {
      queueMicrotask(() => this.onerror?.(new Event("error") as ErrorEvent));
      return;
    }
    // Structured clone like a real worker boundary.
    const data = structuredClone(handleSanitizeRequest(structuredClone(message)));
    queueMicrotask(() => this.onmessage?.(new MessageEvent("message", { data })));
  }
  terminate(): void {
    this.terminated = true;
  }
}

function setup(workers: (FakeWorker | null)[] = [new FakeWorker()]) {
  const queue = [...workers];
  const created: (FakeWorker | null)[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextTimer = 1;
  const env: SanitizeEnv = {
    createWorker: vi.fn(async () => {
      const w = queue.length > 0 ? (queue.shift() ?? null) : new FakeWorker();
      created.push(w);
      return w;
    }),
    setTimeout: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (handle) => timers.delete(handle as number),
  };
  const fireTimers = () => {
    for (const [id, { fn }] of [...timers]) {
      timers.delete(id);
      fn();
    }
  };
  return { sanitizer: createSvgSanitizer(env), env, created, timers, fireTimers };
}

/** Lets queued microtasks (worker start, fake replies) run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => clearSvgAssetCache());

describe("svg sanitizer client (worker protocol)", () => {
  it("reads and sanitises in the worker", async () => {
    const { sanitizer, created } = setup();
    const result = await sanitizer.read(enc(HOSTILE), MAX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.svg).not.toMatch(/script|onload/);
    expect(result.removed).toBeGreaterThanOrEqual(2);
    expect(result.viewBox).toEqual({ x: 0, y: 0, width: 40, height: 20 });
    expect(created[0]?.requests[0]?.type).toBe("read");
  });

  it("crops in the worker and returns the prepared render data", async () => {
    const { sanitizer } = setup();
    const read = await sanitizer.read(enc(HOSTILE), MAX);
    if (!read.ok) throw new Error("expected ok");
    const crop = await sanitizer.crop(read.svg, { x: 10, y: 0, width: 20, height: 20 }, MAX);
    expect(crop.ok).toBe(true);
    if (!crop.ok) return;
    expect(crop.svg).toContain('viewBox="10 0 20 20"');
    expect(crop).toMatchObject({ width: 20, height: 20 });
    expect(crop.prepared?.recolorParts?.length).toBe(3);
  });

  it("reports invalid files as errors of the file", async () => {
    const { sanitizer } = setup();
    expect(await sanitizer.read(enc("<html/>"), MAX)).toEqual({ ok: false, error: "svg-invalid" });
    expect(await sanitizer.read(new Uint8Array([0xff, 0xfe, 0x3c]), MAX)).toEqual({
      ok: false,
      error: "svg-invalid",
    });
    expect(await sanitizer.read(enc(HOSTILE), 10)).toEqual({ ok: false, error: "svg-too-large" });
  });

  it("times out, terminates a hanging worker and starts a fresh one", async () => {
    const hanging = new FakeWorker("hang");
    const { sanitizer, created, timers, fireTimers } = setup([hanging, new FakeWorker()]);
    const pending = sanitizer.read(enc(HOSTILE), MAX);
    await flush();
    expect([...timers.values()][0]?.ms).toBe(SANITIZE_TIMEOUT_MS);
    fireTimers();
    expect(await pending).toEqual({ ok: false, error: "svg-timeout" });
    expect(hanging.terminated).toBe(true);
    expect((await sanitizer.read(enc(HOSTILE), MAX)).ok).toBe(true);
    expect(created).toHaveLength(2);
  });

  it("aborts: stops the worker, answers aborted, leaves no timer", async () => {
    const hanging = new FakeWorker("hang");
    const { sanitizer, timers } = setup([hanging]);
    const controller = new AbortController();
    const pending = sanitizer.read(enc(HOSTILE), MAX, controller.signal);
    await flush();
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: "aborted" });
    expect(hanging.terminated).toBe(true);
    expect(timers.size).toBe(0);
    // An already aborted signal never reaches the worker.
    const again = await sanitizer.read(enc(HOSTILE), MAX, controller.signal);
    expect(again).toEqual({ ok: false, error: "aborted" });
  });

  it("retries a call that waited on a worker stopped by another call", async () => {
    const hanging = new FakeWorker("hang");
    const { sanitizer } = setup([hanging, new FakeWorker()]);
    const controller = new AbortController();
    const first = sanitizer.read(enc(HOSTILE), MAX, controller.signal);
    const second = sanitizer.read(enc(HOSTILE), MAX);
    await flush();
    controller.abort();
    expect(await first).toEqual({ ok: false, error: "aborted" });
    expect((await second).ok).toBe(true);
  });

  it("falls back to the main thread without a worker or after a crash", async () => {
    const none = setup([null]);
    expect((await none.sanitizer.read(enc(HOSTILE), MAX)).ok).toBe(true);
    const crashing = new FakeWorker("crash");
    const crashed = setup([crashing]);
    expect((await crashed.sanitizer.read(enc(HOSTILE), MAX)).ok).toBe(true);
    expect(crashing.terminated).toBe(true);
    // Not tried again.
    expect((await crashed.sanitizer.read(enc(HOSTILE), MAX)).ok).toBe(true);
    expect(crashed.env.createWorker).toHaveBeenCalledTimes(1);
  });

  it("dispose answers pending calls and stops the worker", async () => {
    const hanging = new FakeWorker("hang");
    const { sanitizer, timers } = setup([hanging]);
    const pending = sanitizer.read(enc(HOSTILE), MAX);
    await flush();
    sanitizer.dispose();
    expect(await pending).toEqual({ ok: false, error: "aborted" });
    expect(hanging.terminated).toBe(true);
    expect(timers.size).toBe(0);
  });
});

describe("readAsset and finishAsset with the worker", () => {
  it("prime the render cache so renders do not sanitise again", async () => {
    const { sanitizer } = setup();
    const file = new File([HOSTILE], "logo.svg", { type: "image/svg+xml" });
    const read = await readAsset(file, { svg: sanitizer });
    if (!read.ok) throw new Error("expected ok");
    const crop = vi.fn();
    const done = await finishAsset(
      read.source,
      { x: 0, y: 0, w: 0.5, h: 1 },
      {
        crop,
        svg: sanitizer,
      },
    );
    if (!done.ok || done.asset.kind !== "svg") throw new Error("expected svg asset");
    expect(crop).not.toHaveBeenCalled();
    const prepared = svgAssetFor(done.asset.svg);
    expect(prepared?.svg).toBe(done.asset.svg);
    expect(prepared && recolorSvgAsset(prepared, "#123456")).toContain('fill="#123456"');
  });

  it("passes timeouts on as a localised error key", async () => {
    const { sanitizer, fireTimers } = setup([new FakeWorker("hang")]);
    const file = new File([HOSTILE], "logo.svg", { type: "image/svg+xml" });
    const pending = readAsset(file, { svg: sanitizer });
    await flush();
    fireTimers();
    expect(await pending).toEqual({ ok: false, error: "svg-timeout" });
  });
});
