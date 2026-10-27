import { paletteFromImageTool, type PixelBuffer } from "@motivo/tool-registry";
import { describe, expect, it, vi } from "vitest";
import {
  handleImageRequest,
  type BitmapLike,
  type ImageWorkerEnv,
  type ImageWorkerRequest,
  type ImageWorkerResponse,
} from "./protocol";
import {
  DECODE_TIMEOUT_MS,
  createImageInputServices,
  type ImageInputEnv,
  type ImageWorkerLike,
} from "./services";

const PNG_HEADER = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 0,
  0, 0, 2, 0, 8, 6, 0, 0, 0,
];
/** A PNG header claiming 768 × 512 pixels (the fake decoders never read the rest). */
const pngFile = () => new Blob([new Uint8Array(PNG_HEADER)], { type: "image/png" });
const svgFile = () =>
  new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>'], {
    type: "image/svg+xml",
  });

/** Three solid bands: navy (60 %), red (30 %), sand (10 %). */
function bands(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rgb =
      y < height * 0.6 ? [29, 53, 87] : y < height * 0.9 ? [230, 57, 70] : [241, 250, 238];
    for (let x = 0; x < width; x++) data.set([...rgb, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

const workerEnv = (overrides: Partial<ImageWorkerEnv> = {}): ImageWorkerEnv => ({
  createBitmap: async () => ({ width: 768, height: 512, close: vi.fn() }),
  readPixels: (_b: BitmapLike, w: number, h: number) => bands(w, h),
  lookup: (id) => (id === paletteFromImageTool.id ? paletteFromImageTool : undefined),
  ...overrides,
});

/** In-process stand-in for the worker, answering through `handleImageRequest`. */
class FakeWorker implements ImageWorkerLike {
  onmessage: ((event: MessageEvent<ImageWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  requests: ImageWorkerRequest[] = [];
  constructor(
    private env: ImageWorkerEnv,
    private mode: "answer" | "hang" | "crash" = "answer",
  ) {}
  postMessage(message: ImageWorkerRequest): void {
    this.requests.push(message);
    if (this.mode === "hang") return;
    if (this.mode === "crash") {
      queueMicrotask(() => this.onerror?.(new Event("error") as ErrorEvent));
      return;
    }
    void handleImageRequest(message, this.env).then((data) =>
      this.onmessage?.(new MessageEvent("message", { data })),
    );
  }
  terminate(): void {
    this.terminated = true;
  }
}

function setup(options: { workers?: (FakeWorker | null)[]; timers?: "real" | "manual" } = {}) {
  const workers = options.workers ?? [new FakeWorker(workerEnv())];
  const created: (FakeWorker | null)[] = [];
  const timers: (() => void)[] = [];
  const decodeOnMainThread = vi.fn(async (_b: Uint8Array, _m: string, maxEdge: number) =>
    bands(maxEdge, maxEdge),
  );
  const env: ImageInputEnv = {
    createWorker: async () => {
      const w = workers.shift() ?? null;
      created.push(w);
      return w;
    },
    decodeOnMainThread,
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => undefined,
  };
  return { services: createImageInputServices(env), created, timers, decodeOnMainThread };
}

describe("handleImageRequest", () => {
  it("decodes, downsamples to maxEdge and closes the bitmap", async () => {
    const close = vi.fn();
    const reply = await handleImageRequest(
      { id: 1, type: "decode", bytes: new ArrayBuffer(4), mime: "image/png", maxEdge: 256 },
      workerEnv({ createBitmap: async () => ({ width: 4000, height: 1000, close }) }),
    );
    expect(
      reply.ok && reply.type === "decode" && [reply.pixels.width, reply.pixels.height],
    ).toEqual([256, 64]);
    expect(close).toHaveBeenCalled();
  });

  it("reports undecodable images, missing canvas support and unknown tools", async () => {
    const decode: ImageWorkerRequest = {
      id: 2,
      type: "decode",
      bytes: new ArrayBuffer(4),
      mime: "image/png",
      maxEdge: 256,
    };
    const broken = await handleImageRequest(
      decode,
      workerEnv({ createBitmap: () => Promise.reject(new Error("bad")) }),
    );
    expect(broken).toEqual({ id: 2, type: "decode", ok: false, error: "decode-failed" });
    const old = await handleImageRequest(decode, workerEnv({ createBitmap: null }));
    expect(old).toMatchObject({ ok: false, error: "unsupported" });
    const unknown = await handleImageRequest(
      { id: 3, type: "derive", toolId: "nope", pixels: bands(4, 4), params: {}, seed: 1 },
      workerEnv(),
    );
    expect(unknown).toMatchObject({ ok: false, error: "unknown-tool" });
  });
});

describe("createImageInputServices", () => {
  it("checks, decodes in the worker and derives there", async () => {
    const { services, created, decodeOnMainThread } = setup();
    const decoded = await services.decode(pngFile(), 256);
    expect(decoded.ok && [decoded.pixels.width, decoded.pixels.height]).toEqual([256, 171]);
    expect(decodeOnMainThread).not.toHaveBeenCalled();
    const derived = await services.derive(
      paletteFromImageTool,
      bands(10, 10),
      { ...paletteFromImageTool.defaults, count: 3 },
      1,
    );
    expect(derived).toEqual({
      ok: true,
      patch: {
        colors: [
          { color: "#1d3557", share: 0.6 },
          { color: "#e63946", share: 0.3 },
          { color: "#f1faee", share: 0.1 },
        ],
      },
    });
    expect(created).toHaveLength(1);
    expect((created[0] as FakeWorker).requests.map((r) => r.type)).toEqual(["decode", "derive"]);
  });

  it("refuses large, unknown and broken files before decoding", async () => {
    const { services, created } = setup();
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]);
    expect(await services.decode(big, 256)).toEqual({ ok: false, error: "too-large" });
    expect(await services.decode(new Blob(["hello"]), 256)).toEqual({
      ok: false,
      error: "unsupported-type",
    });
    expect(created).toHaveLength(0);
  });

  it("rasterises SVG on the main thread through an image, never in the worker", async () => {
    const { services, created, decodeOnMainThread } = setup();
    const result = await services.decode(svgFile(), 128);
    expect(result.ok).toBe(true);
    expect(decodeOnMainThread).toHaveBeenCalledWith(expect.any(Uint8Array), "image/svg+xml", 128);
    expect(created).toHaveLength(0);
  });

  it("falls back to the main thread without worker or canvas support", async () => {
    const noWorker = setup({ workers: [null] });
    expect((await noWorker.services.decode(pngFile(), 64)).ok).toBe(true);
    expect(noWorker.decodeOnMainThread).toHaveBeenCalledTimes(1);
    const derived = await noWorker.services.derive(
      paletteFromImageTool,
      bands(4, 10),
      paletteFromImageTool.defaults,
      1,
    );
    expect(derived.ok).toBe(true);

    const noCanvas = setup({ workers: [new FakeWorker(workerEnv({ createBitmap: null }))] });
    expect((await noCanvas.services.decode(pngFile(), 64)).ok).toBe(true);
    expect(noCanvas.decodeOnMainThread).toHaveBeenCalledTimes(1);
  });

  it("falls back to the main thread when the worker crashes, and stops using it", async () => {
    const crashing = new FakeWorker(workerEnv(), "crash");
    const { services, created, decodeOnMainThread } = setup({ workers: [crashing] });
    expect((await services.decode(pngFile(), 64)).ok).toBe(true);
    expect(decodeOnMainThread).toHaveBeenCalledTimes(1);
    expect(crashing.terminated).toBe(true);
    await services.decode(pngFile(), 64);
    expect(created).toHaveLength(1);
  });

  it("times out a hanging worker, terminates it and starts a fresh one next time", async () => {
    const hanging = new FakeWorker(workerEnv(), "hang");
    const { services, created, timers } = setup({
      workers: [hanging, new FakeWorker(workerEnv())],
    });
    const pending = services.decode(pngFile(), 64);
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers[0]?.();
    expect(await pending).toEqual({ ok: false, error: "timeout" });
    expect(hanging.terminated).toBe(true);
    expect((await services.decode(pngFile(), 64)).ok).toBe(true);
    expect(created).toHaveLength(2);
    expect(DECODE_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("reports images without a result, e.g. fully transparent ones", async () => {
    const { services } = setup();
    const clear: PixelBuffer = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    expect(
      await services.derive(paletteFromImageTool, clear, paletteFromImageTool.defaults, 1),
    ).toEqual({
      ok: false,
      error: "no-result",
    });
  });
});
