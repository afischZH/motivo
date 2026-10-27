import {
  blobTool,
  createRenderContext,
  cssGradientTool,
  defineTool,
  polkaDotsTool,
} from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { FakeBitmap, fakeCanvas, fakeEnv } from "./__fixtures__/raster-fakes";
import { ExportError } from "./errors";
import { encodeBitmap, handleEncodeRequest, type EncodeRequest } from "./raster-encode";
import { exportRaster, rasterizeSvg } from "./raster";

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
    const blob = await encodeBitmap(req, (w, h) => fakeCanvas(log, w, h));
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
      filename: "motivo-polka-dots-42.png",
    });
    expect(env.loadedSvgs[0]).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="600" height="400" viewBox="0 0 300 200">/,
    );
  });

  it("clamps to the licence edge and rasterises CSS tools via their preview", async () => {
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
    expect(out.filename).toBe("motivo-css-gradient-42.jpg");
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
      gating: {},
    });
    await expect(exportRaster(text, {}, ctx, { format: "png" }, fakeEnv())).rejects.toBeInstanceOf(
      ExportError,
    );
  });
});
