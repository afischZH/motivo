import {
  blobTool,
  createRenderContext,
  cssPatternsTool,
  gridPatternsTool,
  shaderGradientTool,
} from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { FakeBitmap, fakeCanvas, type DrawLog } from "./__fixtures__/raster-fakes";
import { ExportError } from "./errors";
import { exportGif, type GifEnv, type GifWorkerLike } from "./gif";
import { createGifSession, hasTransparency, type GifMessage } from "./gif-encode";
import { readGifInfo } from "./gif-info";
import {
  GIF_DELAY_MAX,
  GIF_DELAY_MIN,
  GIF_FRAMES_MAX,
  GIF_FRAMES_MIN,
  GIF_MAX_EDGE,
  GIF_PIXEL_BUDGET,
  clampGifDelay,
  clampGifFrames,
  gifSize,
  planGif,
} from "./gif-plan";

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** RGBA frame: a horizontal gradient tinted by `n`, optionally with a transparent left half. */
function frame(width: number, height: number, n: number, transparent = false): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 255) / width;
      data[i + 1] = (n * 40) & 255;
      data[i + 2] = (y * 255) / height;
      data[i + 3] = transparent && x < width / 2 ? 0 : 255;
    }
  }
  return data;
}

describe("planGif", () => {
  it("keeps the aspect ratio at the requested long edge", () => {
    expect(gifSize({ width: 1600, height: 900 }, 640)).toEqual({ width: 640, height: 360 });
    expect(gifSize({ width: 900, height: 1600 }, 640)).toEqual({ width: 360, height: 640 });
    expect(gifSize({ width: 1080, height: 1080 }, 5000)).toEqual({
      width: GIF_MAX_EDGE,
      height: GIF_MAX_EDGE,
    });
  });

  it("clamps frames and delay", () => {
    expect(clampGifFrames(1)).toBe(GIF_FRAMES_MIN);
    expect(clampGifFrames(500)).toBe(GIF_FRAMES_MAX);
    expect(clampGifFrames(Number.NaN)).toBe(GIF_FRAMES_MIN);
    expect(clampGifDelay(3)).toBe(GIF_DELAY_MIN);
    expect(clampGifDelay(99_999)).toBe(GIF_DELAY_MAX);
    expect(clampGifDelay(84)).toBe(80);
  });

  it("checks the pixel budget", () => {
    const ok = planGif({ width: 1080, height: 1080 }, { edge: 640, frames: 60 });
    expect(ok).toMatchObject({ width: 640, height: 640, frames: 60, overBudget: false });
    const big = planGif({ width: 1080, height: 1080 }, { edge: 1024, frames: 60 });
    expect(big.overBudget).toBe(true);
    expect(big.pixels).toBe(60 * 1024 * 1024);
    expect(big.maxFrames).toBe(Math.floor(GIF_PIXEL_BUDGET / (1024 * 1024)));
    expect(
      planGif({ width: 1080, height: 1080 }, { edge: 1024, frames: big.maxFrames }).overBudget,
    ).toBe(false);
  });
});

describe("GIF session (worker side)", () => {
  async function encode(frames: Uint8ClampedArray[], loop = true, w = 32, h = 16) {
    const session = createGifSession();
    const replies = [];
    replies.push(
      await session.handle({ kind: "gif-start", id: 1, width: w, height: h, delay: 80, loop }),
    );
    for (const data of frames)
      replies.push(await session.handle({ kind: "gif-frame", id: 1, data }));
    const done = await session.handle({ kind: "gif-end", id: 1 });
    return { replies, done };
  }

  it("writes a GIF89a with one image per frame, delays and an endless loop", async () => {
    const { replies, done } = await encode([frame(32, 16, 0), frame(32, 16, 1), frame(32, 16, 2)]);
    expect(replies.map((r) => r.kind === "gif-ack" && r.frames)).toEqual([0, 1, 2, 3]);
    if (done.kind !== "gif-done" || !done.ok) throw new Error("no gif");
    expect(done.blob.type).toBe("image/gif");
    const bytes = await bytesOf(done.blob);
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("GIF89a");
    expect(readGifInfo(bytes)).toEqual({
      version: "GIF89a",
      width: 32,
      height: 16,
      frames: 3,
      delays: [80, 80, 80],
      loop: 0,
      complete: true,
    });
  });

  it("plays once without the loop block", async () => {
    const { done } = await encode([frame(32, 16, 0), frame(32, 16, 1)], false);
    if (done.kind !== "gif-done" || !done.ok) throw new Error("no gif");
    const info = readGifInfo(await bytesOf(done.blob));
    expect(info.frames).toBe(2);
    expect(info.loop).toBeUndefined();
  });

  it("keeps transparency", async () => {
    const data = frame(32, 16, 0, true);
    expect(hasTransparency(data)).toBe(true);
    expect(hasTransparency(frame(32, 16, 0))).toBe(false);
    const { done } = await encode([data, frame(32, 16, 1, true)]);
    if (done.kind !== "gif-done" || !done.ok) throw new Error("no gif");
    const bytes = await bytesOf(done.blob);
    // First graphic control extension: transparency flag set, disposal 2.
    const gce = bytes.findIndex((b, i) => b === 0x21 && bytes[i + 1] === 0xf9);
    expect((bytes[gce + 3] ?? 0) & 0x01).toBe(1);
    expect(((bytes[gce + 3] ?? 0) >> 2) & 0x07).toBe(2);
  });

  it("is deterministic", async () => {
    const a = await encode([frame(32, 16, 0), frame(32, 16, 1)]);
    const b = await encode([frame(32, 16, 0), frame(32, 16, 1)]);
    if (a.done.kind !== "gif-done" || !a.done.ok || b.done.kind !== "gif-done" || !b.done.ok) {
      throw new Error("no gif");
    }
    expect(await bytesOf(a.done.blob)).toEqual(await bytesOf(b.done.blob));
  });

  it("answers protocol errors with an error reply", async () => {
    const session = createGifSession();
    expect(await session.handle({ kind: "gif-end", id: 3 })).toMatchObject({
      kind: "gif-done",
      ok: false,
      code: "encode-failed",
    });
    await session.handle({ kind: "gif-start", id: 3, width: 4, height: 4, delay: 100, loop: true });
    expect(
      await session.handle({ kind: "gif-frame", id: 3, data: new Uint8ClampedArray(8) }),
    ).toMatchObject({ ok: false, code: "encode-failed" });
  });

  it("reports an encoder that cannot load", async () => {
    const session = createGifSession(() => Promise.reject(new Error("chunk failed")));
    expect(
      await session.handle({
        kind: "gif-start",
        id: 1,
        width: 4,
        height: 4,
        delay: 100,
        loop: true,
      }),
    ).toMatchObject({ ok: false, code: "unavailable" });
  });
});

interface FakeGifEnv extends GifEnv {
  log: DrawLog;
  loadedSvgs: string[];
  released: number;
  terminated: number;
  messages: GifMessage["kind"][];
  bitmaps: FakeBitmap[];
  workerDraws: number;
}

interface FakeGifEnvOptions {
  worker?: boolean;
  workerCrashes?: boolean;
  /** `createImageBitmap`: absent (default), working, or rejecting (no bitmaps from SVG). */
  bitmaps?: "ok" | "fail";
}

/** Worker-side canvas for bitmap frames: "draws" a frame tinted by the bitmap count. */
function fakeFrameCanvas(env: FakeGifEnv) {
  return (width: number, height: number) => ({
    clearRect: () => undefined,
    drawImage: () => {
      env.workerDraws++;
    },
    getImageData: () => ({ data: frame(width, height, env.workerDraws) }),
  });
}

function fakeGifEnv(o: FakeGifEnvOptions = {}): FakeGifEnv {
  const log: DrawLog = { calls: [] };
  const env: FakeGifEnv = {
    log,
    loadedSvgs: [],
    released: 0,
    terminated: 0,
    messages: [],
    bitmaps: [],
    workerDraws: 0,
    ...(o.bitmaps
      ? {
          createImageBitmap(image: CanvasImageSource) {
            if (o.bitmaps === "fail") return Promise.reject(new Error("no svg bitmaps"));
            const bitmap = new FakeBitmap(image);
            env.bitmaps.push(bitmap);
            return Promise.resolve(bitmap as unknown as ImageBitmap);
          },
        }
      : {}),
    loadSvgImage(svg) {
      env.loadedSvgs.push(svg);
      return Promise.resolve({
        image: { svg } as unknown as CanvasImageSource,
        release: () => {
          env.released++;
        },
      });
    },
    createCanvas: (w, h) => fakeCanvas(log, w, h),
    yieldToMain: () => Promise.resolve(),
    workerSupported: () => o.worker ?? true,
    createWorker(): GifWorkerLike {
      const session = createGifSession(undefined, fakeFrameCanvas(env));
      let queue: Promise<void> = Promise.resolve();
      const worker: GifWorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(message) {
          env.messages.push(message.kind);
          if (o.workerCrashes) {
            queueMicrotask(() => worker.onerror?.({ message: "boom" } as ErrorEvent));
            return;
          }
          queue = queue.then(() =>
            session.handle(message).then((reply) => {
              worker.onmessage?.({ data: reply } as MessageEvent);
            }),
          );
        },
        terminate() {
          env.terminated++;
        },
      };
      return worker;
    },
  };
  return env;
}

const ctx = (seed = 1) => createRenderContext(seed, { width: 400, height: 200 });

describe("exportGif", () => {
  it("renders every frame through the tool's render path and encodes them in the worker", async () => {
    const env = fakeGifEnv();
    const progress: number[] = [];
    const result = await exportGif(
      blobTool,
      blobTool.defaults,
      ctx(5),
      { source: "seeds", frames: 4, edge: 100, delay: 50, onProgress: (f) => progress.push(f) },
      env,
    );
    expect(result).toMatchObject({ width: 100, height: 50, frames: 4 });
    expect(result.filename).toBe("musterli-blob-5.gif");
    const info = readGifInfo(await bytesOf(result.blob));
    expect(info).toMatchObject({ version: "GIF89a", width: 100, height: 50, frames: 4, loop: 0 });
    expect(info.delays).toEqual([50, 50, 50, 50]);
    // One SVG per frame, each the tool's own render at the design size, scaled to the GIF.
    expect(env.loadedSvgs).toHaveLength(4);
    expect(new Set(env.loadedSvgs).size).toBe(4);
    expect(env.loadedSvgs[0]).toContain('width="100" height="50"');
    expect(env.released).toBe(4);
    expect(env.messages).toEqual([
      "gif-start",
      "gif-frame",
      "gif-frame",
      "gif-frame",
      "gif-frame",
      "gif-end",
    ]);
    expect(env.terminated).toBe(1);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
  });

  it("colour cycles CSS tools through their preview SVG", async () => {
    const env = fakeGifEnv();
    const result = await exportGif(
      cssPatternsTool,
      cssPatternsTool.defaults,
      ctx(),
      { source: "colors", frames: 3, edge: 64, loop: false },
      env,
    );
    const info = readGifInfo(await bytesOf(result.blob));
    expect(info.frames).toBe(3);
    expect(info.loop).toBeUndefined();
    // Two colours swap and come back: frames 1 and 2 mirror each other.
    expect(new Set(env.loadedSvgs).size).toBe(2);
  });

  it("draws WebGL frames through the caller's frame renderer", async () => {
    const env = fakeGifEnv();
    const drawn: { t: number | undefined; width: number; height: number }[] = [];
    const result = await exportGif(
      shaderGradientTool,
      shaderGradientTool.defaults,
      ctx(3),
      {
        source: "time",
        frames: 4,
        edge: 80,
        renderFrame: (f, size) => {
          drawn.push({ t: f.t, ...size });
          return Promise.resolve({ data: frame(size.width, size.height, drawn.length) });
        },
      },
      env,
    );
    expect(result).toMatchObject({ width: 80, height: 40, frames: 4 });
    expect(readGifInfo(await bytesOf(result.blob)).frames).toBe(4);
    expect(env.loadedSvgs).toEqual([]);
    expect(drawn.map((d) => d.t)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(drawn.every((d) => d.width === 80 && d.height === 40)).toBe(true);
  });

  it("refuses WebGL tools without a frame renderer", async () => {
    await expect(
      exportGif(
        shaderGradientTool,
        shaderGradientTool.defaults,
        ctx(),
        { source: "time", frames: 2, edge: 64 },
        fakeGifEnv(),
      ),
    ).rejects.toMatchObject({ code: "unsupported-format" });
  });

  it("refuses tools and sources without animation", async () => {
    const env = fakeGifEnv();
    await expect(
      exportGif(
        gridPatternsTool,
        gridPatternsTool.defaults,
        ctx(),
        { source: "seeds", frames: 2, edge: 64 },
        env,
      ),
    ).rejects.toMatchObject({ code: "unsupported-format" });
    await expect(
      exportGif(
        cssPatternsTool,
        cssPatternsTool.defaults,
        ctx(),
        { source: "seeds", frames: 2, edge: 64 },
        env,
      ),
    ).rejects.toMatchObject({ code: "unsupported-format" });
  });

  it("refuses exports over the pixel budget before rendering", async () => {
    const env = fakeGifEnv();
    const square = createRenderContext(1, { width: 1080, height: 1080 });
    const error = await exportGif(
      blobTool,
      blobTool.defaults,
      square,
      { source: "seeds", frames: 60, edge: 1024 },
      env,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExportError);
    expect((error as ExportError).code).toBe("budget-exceeded");
    expect(env.loadedSvgs).toHaveLength(0);
  });

  it("cancels: stops rendering and terminates the worker", async () => {
    const env = fakeGifEnv();
    const controller = new AbortController();
    const error = await exportGif(
      blobTool,
      blobTool.defaults,
      ctx(),
      {
        source: "seeds",
        frames: 10,
        edge: 64,
        signal: controller.signal,
        onProgress: (f) => {
          if (f > 0.2) controller.abort();
        },
      },
      env,
    ).catch((e: unknown) => e);
    expect((error as ExportError).code).toBe("aborted");
    expect(env.loadedSvgs.length).toBeLessThan(10);
    expect(env.terminated).toBe(1);
  });

  it("is deterministic: the same design gives the same bytes", async () => {
    const opts = { source: "colors" as const, frames: 3, edge: 64 };
    const a = await exportGif(blobTool, blobTool.defaults, ctx(), opts, fakeGifEnv());
    const b = await exportGif(blobTool, blobTool.defaults, ctx(), opts, fakeGifEnv());
    expect(await bytesOf(a.blob)).toEqual(await bytesOf(b.blob));
  });

  it("hands bitmaps to the worker, which draws and reads them back", async () => {
    const env = fakeGifEnv({ bitmaps: "ok" });
    const result = await exportGif(
      blobTool,
      blobTool.defaults,
      ctx(),
      { source: "seeds", frames: 3, edge: 64 },
      env,
    );
    expect(readGifInfo(await bytesOf(result.blob)).frames).toBe(3);
    expect(env.bitmaps).toHaveLength(3);
    expect(env.bitmaps.every((b) => b.closed)).toBe(true);
    expect(env.workerDraws).toBe(3);
    // Nothing drawn or read back on the main thread.
    expect(env.log.calls).toEqual([]);
  });

  it("draws on the main thread when the engine makes no bitmaps from SVG", async () => {
    const env = fakeGifEnv({ bitmaps: "fail" });
    const result = await exportGif(
      blobTool,
      blobTool.defaults,
      ctx(),
      { source: "seeds", frames: 2, edge: 64 },
      env,
    );
    expect(readGifInfo(await bytesOf(result.blob)).frames).toBe(2);
    expect(env.workerDraws).toBe(0);
    expect(env.log.calls.filter((c) => c.startsWith("draw"))).toHaveLength(2);
  });

  it("needs a worker (gifenc never runs on the main thread)", async () => {
    const env = fakeGifEnv({ worker: false });
    await expect(
      exportGif(blobTool, blobTool.defaults, ctx(), { source: "seeds", frames: 2, edge: 64 }, env),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(env.loadedSvgs).toHaveLength(0);
  });

  it("reports a crashed worker", async () => {
    const env = fakeGifEnv({ workerCrashes: true });
    await expect(
      exportGif(blobTool, blobTool.defaults, ctx(), { source: "seeds", frames: 2, edge: 64 }, env),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(env.messages).toEqual(["gif-start"]);
    expect(env.terminated).toBe(1);
  });
});
