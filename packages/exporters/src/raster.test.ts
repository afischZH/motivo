import {
  blobTool,
  createRenderContext,
  cssGradientTool,
  defineTool,
  polkaDotsTool,
} from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { decodePng } from "./__fixtures__/png-decode";
import { FakeBitmap, fakeCanvas, fakeEnv, fakePixel } from "./__fixtures__/raster-fakes";
import { ExportError } from "./errors";
import {
  createStripSession,
  encodeBitmap,
  handleEncodeRequest,
  type EncodeRequest,
} from "./raster-encode";
import {
  effectiveMaxCanvasArea,
  exportRaster,
  MAX_CANVAS_AREA_OVERRIDE,
  probeMatches,
  probePoints,
  rasterizeSvg,
  SAFE_CANVAS_AREA,
} from "./raster";

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>';

const request = (over: Partial<EncodeRequest> = {}): EncodeRequest => ({
  id: 1,
  bitmap: new FakeBitmap("img") as unknown as ImageBitmap,
  width: 40,
  height: 20,
  mime: "image/png",
  ...over,
});

describe("encodeBitmap (worker side)", () => {
  it("fills the background, draws, closes the bitmap and encodes", async () => {
    const log = { calls: [] as string[] };
    const req = request({ mime: "image/jpeg", quality: 0.8, background: "#fff" });
    const { blob } = await encodeBitmap(req, (w, h) => fakeCanvas(log, w, h));
    expect(blob.type).toBe("image/jpeg");
    expect(log.calls).toEqual([
      "fill #fff 0,0,40,20",
      "draw 0,0,40,20",
      "encode image/jpeg q=0.8 40x20",
    ]);
    expect((req.bitmap as unknown as FakeBitmap).closed).toBe(true);
  });

  it("reports formats the browser silently replaced with PNG", async () => {
    const log = { calls: [] as string[] };
    const reply = await handleEncodeRequest(request({ mime: "image/webp" }), (w, h) =>
      fakeCanvas(log, w, h, { encodable: (m) => m !== "image/webp" }),
    );
    expect(reply).toMatchObject({ id: 1, ok: false, code: "encode-unsupported" });
  });

  it("reports a missing context (canvas too large) without throwing", async () => {
    const log = { calls: [] as string[] };
    const req = request();
    const reply = await handleEncodeRequest(req, (w, h) =>
      fakeCanvas(log, w, h, { noContext: true }),
    );
    expect(reply).toMatchObject({ ok: false, code: "encode-failed" });
    expect((req.bitmap as unknown as FakeBitmap).closed).toBe(true);
  });

  it("reports canvas constructor errors", async () => {
    const reply = await handleEncodeRequest(request(), () => {
      throw new RangeError("too big");
    });
    expect(reply).toMatchObject({ ok: false, code: "encode-failed" });
  });
});

describe("rasterizeSvg", () => {
  it("decodes the SVG at the output size and encodes in a worker", async () => {
    const env = fakeEnv();
    const progress: number[] = [];
    const blob = await rasterizeSvg(
      SVG,
      { format: "png", width: 400, height: 200, onProgress: (f) => progress.push(f) },
      env,
    );
    expect(blob.type).toBe("image/png");
    expect(env.loadedSvgs[0]).toContain('width="400" height="200" viewBox="0 0 100 50"');
    expect(env.log.calls).toEqual([
      "post transfer=1",
      "draw 0,0,400,200",
      "encode image/png q=undefined 400x200",
    ]);
    expect(env.terminated).toBe(1);
    expect(env.released).toBe(1);
    expect(progress).toEqual([0, 1]);
  });

  it("gives JPG a white background and the default quality", async () => {
    const env = fakeEnv();
    await rasterizeSvg(SVG, { format: "jpg", width: 10, height: 10 }, env);
    expect(env.log.calls).toContain("fill #ffffff 0,0,10,10");
    expect(env.log.calls).toContain("encode image/jpeg q=0.92 10x10");
  });

  it("falls back to the main thread in bands when bitmaps from SVG fail", async () => {
    const env = fakeEnv({ bitmapFails: true });
    const progress: number[] = [];
    await rasterizeSvg(
      SVG,
      {
        format: "webp",
        width: 100,
        height: 30,
        bandPixels: 1000,
        onProgress: (f) => progress.push(f),
      },
      env,
    );
    expect(env.log.calls).toEqual([
      "draw 0,0,100,10,0,0,100,10",
      "draw 0,10,100,10,0,10,100,10",
      "draw 0,20,100,10,0,20,100,10",
      "toBlob image/webp q=0.9 100x30",
    ]);
    expect(env.yields).toBe(2);
    expect(progress.at(-1)).toBe(1);
    expect(env.released).toBe(1);
  });

  it("falls back when the worker crashes or is unsupported", async () => {
    const crash = fakeEnv({ workerCrashes: true });
    await rasterizeSvg(SVG, { format: "png", width: 10, height: 10 }, crash);
    expect(crash.log.calls.at(-1)).toBe("toBlob image/png q=undefined 10x10");
    expect(crash.terminated).toBe(1);

    const none = fakeEnv({ worker: false });
    await rasterizeSvg(SVG, { format: "png", width: 10, height: 10 }, none);
    expect(none.log.calls).toEqual([
      "draw 0,0,10,10,0,0,10,10",
      "toBlob image/png q=undefined 10x10",
    ]);
  });

  it("forces the main thread with mode 'main'", async () => {
    const env = fakeEnv();
    await rasterizeSvg(SVG, { format: "png", width: 10, height: 10, mode: "main" }, env);
    expect(env.bitmaps).toHaveLength(0);
  });

  it("does not retry real encoder results on the main thread", async () => {
    const env = fakeEnv({ encodable: (m) => m !== "image/webp" });
    await expect(
      rasterizeSvg(SVG, { format: "webp", width: 10, height: 10 }, env),
    ).rejects.toMatchObject({
      code: "encode-unsupported",
    });
    expect(env.log.calls.some((c) => c.startsWith("toBlob"))).toBe(false);
    expect(env.released).toBe(1);
  });

  it("detects unsupported formats on the main thread too", async () => {
    const env = fakeEnv({ worker: false, encodable: (m) => m === "image/png" });
    await expect(rasterizeSvg(SVG, { format: "webp", width: 5, height: 5 }, env)).rejects.toThrow(
      /cannot encode image\/webp/,
    );
  });

  it("maps decode failures", async () => {
    const env = fakeEnv({ decodeFails: true });
    await expect(rasterizeSvg(SVG, { format: "png", width: 5, height: 5 }, env)).rejects.toThrow(
      "decode",
    );
  });

  it("aborts a running worker and before starting", async () => {
    const env = fakeEnv({ workerHangs: true });
    const controller = new AbortController();
    const pending = rasterizeSvg(
      SVG,
      { format: "png", width: 10, height: 10, signal: controller.signal },
      env,
    );
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(env.terminated).toBe(1);
    expect(env.released).toBe(1);

    const early = new AbortController();
    early.abort();
    await expect(
      rasterizeSvg(SVG, { format: "png", width: 10, height: 10, signal: early.signal }, fakeEnv()),
    ).rejects.toBeInstanceOf(ExportError);
  });

  it("aborts between bands on the main thread", async () => {
    const env = fakeEnv({ worker: false });
    const controller = new AbortController();
    env.yieldToMain = () => {
      controller.abort();
      return Promise.resolve();
    };
    await expect(
      rasterizeSvg(
        SVG,
        { format: "png", width: 100, height: 100, bandPixels: 1000, signal: controller.signal },
        env,
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(env.log.calls.filter((c) => c.startsWith("draw"))).toHaveLength(1);
  });
});

/** Every pixel of a decoded PNG equals the fake pattern at its own coordinates. */
async function expectFakePattern(blob: Blob, width: number, height: number) {
  expect(blob.type).toBe("image/png");
  const png = await decodePng(new Uint8Array(await blob.arrayBuffer()));
  expect({ width: png.width, height: png.height }).toEqual({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      expect([...png.data.subarray(i, i + 4)], `pixel ${x},${y}`).toEqual(fakePixel(x, y));
    }
  }
}

describe("rasterizeSvg above the canvas area limit", () => {
  // 100 x 35 output, at most 1000 pixels per canvas: strips of 10 rows.
  const LIMIT = 1000;
  const big = { width: 100, height: 35 };

  it("streams PNG strips to the worker; no canvas or bitmap has the full size", async () => {
    // Canvases above the limit draw nothing, like WebKit; the strips must not need one.
    const env = fakeEnv({ maxCanvasArea: LIMIT, blankAbove: LIMIT, workerBlankAbove: LIMIT });
    const progress: number[] = [];
    const blob = await rasterizeSvg(
      SVG,
      { format: "png", ...big, onProgress: (f) => progress.push(f) },
      env,
    );
    await expectFakePattern(blob, big.width, big.height);
    expect(env.bitmaps).toHaveLength(0);
    expect(env.stripMessages).toEqual([
      "strip-start",
      "strip-rows",
      "strip-rows",
      "strip-rows",
      "strip-rows",
      "strip-end",
    ]);
    expect(env.log.calls.filter((c) => c.startsWith("draw"))).toEqual([
      "draw 0,0,100,10,0,0,100,10",
      "draw 0,10,100,10,0,0,100,10",
      "draw 0,20,100,10,0,0,100,10",
      "draw 0,30,100,5,0,0,100,5",
    ]);
    expect(env.terminated).toBe(1);
    expect(env.released).toBe(1);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("fills the background under every strip", async () => {
    const env = fakeEnv({ maxCanvasArea: LIMIT });
    await rasterizeSvg(SVG, { format: "png", ...big, background: "#123456" }, env);
    expect(env.log.calls.filter((c) => c.startsWith("fill"))).toEqual([
      "fill #123456 0,0,100,10",
      "fill #123456 0,0,100,10",
      "fill #123456 0,0,100,10",
      "fill #123456 0,0,100,5",
    ]);
  });

  it("encodes strips on the main thread without a worker or when it crashes", async () => {
    const none = fakeEnv({ maxCanvasArea: LIMIT, worker: false, blankAbove: LIMIT });
    await expectFakePattern(await rasterizeSvg(SVG, { format: "png", ...big }, none), 100, 35);
    expect(none.yields).toBe(3);

    const crash = fakeEnv({ maxCanvasArea: LIMIT, workerCrashes: true, blankAbove: LIMIT });
    await expectFakePattern(await rasterizeSvg(SVG, { format: "png", ...big }, crash), 100, 35);
    expect(crash.terminated).toBe(1);
  });

  it("aborts between strips", async () => {
    const env = fakeEnv({ maxCanvasArea: LIMIT });
    const controller = new AbortController();
    env.yieldToMain = () => {
      controller.abort();
      return Promise.resolve();
    };
    await expect(
      rasterizeSvg(SVG, { format: "png", ...big, signal: controller.signal }, env),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(env.log.calls.filter((c) => c.startsWith("draw"))).toHaveLength(1);
    expect(env.terminated).toBe(1);
    expect(env.released).toBe(1);
  });

  it("keeps one canvas below the limit", async () => {
    const env = fakeEnv({ maxCanvasArea: LIMIT });
    await rasterizeSvg(SVG, { format: "png", width: 40, height: 25 }, env);
    expect(env.stripMessages).toEqual([]);
    expect(env.log.calls).toContain("encode image/png q=undefined 40x25");
  });

  it("accepts a large JPG when the probe pixels match", async () => {
    const env = fakeEnv({ maxCanvasArea: LIMIT });
    const blob = await rasterizeSvg(SVG, { format: "jpg", ...big }, env);
    expect(blob.type).toBe("image/jpeg");
    expect(env.log.calls).toContain("encode image/jpeg q=0.92 100x35");
    expect(env.log.calls.some((c) => c.startsWith("toBlob"))).toBe(false);
  });

  it("retries a large JPG on the main thread when the worker canvas stayed blank", async () => {
    const env = fakeEnv({ maxCanvasArea: LIMIT, workerBlankAbove: LIMIT });
    const blob = await rasterizeSvg(SVG, { format: "jpg", ...big }, env);
    expect(blob.type).toBe("image/jpeg");
    expect(env.log.calls.at(-1)).toBe("toBlob image/jpeg q=0.92 100x35");
  });

  it("fails with too-large instead of a blank JPG or WebP", async () => {
    for (const format of ["jpg", "webp"] as const) {
      const env = fakeEnv({ maxCanvasArea: LIMIT, blankAbove: LIMIT, workerBlankAbove: LIMIT });
      await expect(rasterizeSvg(SVG, { format, ...big }, env)).rejects.toMatchObject({
        code: "too-large",
      });
      expect(env.released).toBe(1);
    }
  });

  it("uses the checked full canvas for PNG without CompressionStream", async () => {
    const env = fakeEnv({ maxCanvasArea: LIMIT, strips: false, workerBlankAbove: LIMIT });
    await rasterizeSvg(SVG, { format: "png", ...big }, env);
    expect(env.stripMessages).toEqual([]);
    expect(env.log.calls.at(-1)).toBe("toBlob image/png q=undefined 100x35");
  });
});

describe("probe helpers", () => {
  it("places nine points inside the image", () => {
    const points = probePoints(600, 300);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual([100, 50]);
    expect(points[4]).toEqual([300, 150]);
    expect(points[8]).toEqual([500, 250]);
    expect(probePoints(1, 1).every(([x, y]) => x === 0 && y === 0)).toBe(true);
  });

  it("tolerates anti-aliasing and a few odd points, not a blank canvas", () => {
    const expected = Array.from({ length: 9 }, (_, i) => [i * 20, 100, 200, 255]).flat();
    expect(probeMatches(expected, expected)).toBe(true);
    const shifted = expected.map((v, i) => (i % 4 === 3 ? v : Math.max(0, v - 30)));
    expect(probeMatches(shifted, expected)).toBe(true);
    const twoOff = [...expected];
    twoOff.splice(0, 8, 0, 0, 0, 0, 0, 0, 0, 0);
    expect(probeMatches(twoOff, expected)).toBe(true);
    expect(probeMatches(new Array<number>(36).fill(0), expected)).toBe(false);
  });

  it("lets a global lower the limit, never raise it", () => {
    expect(effectiveMaxCanvasArea({})).toBe(SAFE_CANVAS_AREA);
    expect(effectiveMaxCanvasArea({ [MAX_CANVAS_AREA_OVERRIDE]: 5000.7 })).toBe(5000);
    expect(effectiveMaxCanvasArea({ [MAX_CANVAS_AREA_OVERRIDE]: 1e12 })).toBe(SAFE_CANVAS_AREA);
    expect(effectiveMaxCanvasArea({ [MAX_CANVAS_AREA_OVERRIDE]: "1" })).toBe(SAFE_CANVAS_AREA);
  });
});

describe("strip session (worker side)", () => {
  it("rejects rows before start and reports encoder errors as replies", async () => {
    const session = createStripSession();
    const rows = { kind: "strip-rows", id: 3, rows: 1, data: new Uint8ClampedArray(4) } as const;
    expect(await session.handle(rows)).toMatchObject({ id: 3, ok: false, code: "encode-failed" });
    expect(await session.handle({ kind: "strip-start", id: 3, width: 1, height: 1 })).toEqual({
      id: 3,
      kind: "strip-ack",
      rows: 0,
    });
    expect(await session.handle(rows)).toEqual({ id: 3, kind: "strip-ack", rows: 1 });
    const end = await session.handle({ kind: "strip-end", id: 3 });
    expect(end).toMatchObject({ id: 3, ok: true });
    expect(await session.handle({ kind: "strip-end", id: 3 })).toMatchObject({ ok: false });
  });
});

describe("exportRaster", () => {
  const ctx = createRenderContext(42, { width: 300, height: 200 });

  it("renders the tool, scales and names the file", async () => {
    const env = fakeEnv();
    const out = await exportRaster(
      polkaDotsTool,
      polkaDotsTool.defaults,
      ctx,
      {
        format: "png",
        size: { scale: 2 },
      },
      env,
    );
    expect(out).toMatchObject({
      width: 600,
      height: 400,
      clamped: false,
      filename: "musterli-polka-dots-42.png",
    });
    expect(env.loadedSvgs[0]).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="400" viewBox="0 0 300 200">/,
    );
  });

  it("clamps to the maximum edge and rasterises CSS tools via their preview", async () => {
    const env = fakeEnv();
    const out = await exportRaster(
      cssGradientTool,
      cssGradientTool.defaults,
      ctx,
      {
        format: "jpg",
        size: { width: 9000 },
        maxEdge: 1080,
      },
      env,
    );
    expect(out).toMatchObject({ width: 1080, height: 720, clamped: true });
    expect(out.filename).toBe("musterli-css-gradient-42.jpg");
  });

  it("rejects formats the tool does not offer", async () => {
    const noPng = defineTool({ ...blobTool, id: "no-png", exports: ["svg"] });
    await expect(
      exportRaster(noPng, blobTool.defaults, ctx, { format: "png" }, fakeEnv()),
    ).rejects.toMatchObject({ code: "unsupported-format" });
    const text = defineTool({
      id: "text",
      version: 1,
      category: ["converters"],
      schema: z.object({}),
      defaults: {},
      presets: [],
      randomize: (_r, c) => c,
      render: { kind: "text", render: () => "" },
      exports: ["png"],
    });
    await expect(exportRaster(text, {}, ctx, { format: "png" }, fakeEnv())).rejects.toBeInstanceOf(
      ExportError,
    );
  });
});
