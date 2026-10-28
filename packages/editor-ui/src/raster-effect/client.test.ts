import { CANVAS_EDGE_MAX, createRenderContext, duotoneTool } from "@musterli/tool-registry";
import { describe, expect, it, vi } from "vitest";
import {
  EFFECT_EXPORT_TIMEOUT_MS,
  RasterEffectError,
  createRasterEffectClient,
  type EffectWorkerLike,
  type RasterEffectClient,
  type RasterEffectEnv,
} from "./client";
import { IMAGE_EFFECT_MAX_PIXELS, exportImageEffect } from "./export";
import type { EffectRenderRequest, EffectRenderResponse } from "./protocol";

const PHOTO = {
  kind: "raster" as const,
  href: `data:image/jpeg;base64,${btoa("\xff\xd8\xff-fake")}`,
  width: 800,
  height: 600,
  name: "lake.jpg",
};

type Reply = (request: EffectRenderRequest) => EffectRenderResponse | null;

/** A worker that answers with `reply` (null: never answers). */
function fakeWorker(reply: Reply) {
  const sent: EffectRenderRequest[] = [];
  const worker: EffectWorkerLike = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      sent.push(message);
      const answer = reply(message);
      if (answer) {
        queueMicrotask(() =>
          worker.onmessage?.({ data: answer } as MessageEvent<EffectRenderResponse>),
        );
      }
    },
    terminate: vi.fn(),
  };
  return { worker, sent };
}

const ok = (r: EffectRenderRequest): EffectRenderResponse =>
  r.encode
    ? { id: r.id, ok: true, blob: new Blob(["x"], { type: r.encode.mime }) }
    : { id: r.id, ok: true, bitmap: { width: r.out.width, close() {} } as unknown as ImageBitmap };

function setup(reply: Reply = ok, worker: "ok" | "none" = "ok") {
  const fake = fakeWorker(reply);
  const timers: (() => void)[] = [];
  const env: RasterEffectEnv = {
    createWorker: vi.fn(async () => (worker === "ok" ? fake.worker : null)),
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => undefined,
  };
  return { client: createRasterEffectClient(env), env, sent: fake.sent, timers, fake };
}

const job = (params: Readonly<Record<string, unknown>> = duotoneTool.defaults) => ({
  tool: duotoneTool,
  params,
  seed: 3,
  design: { width: 800, height: 600 },
  out: { width: 200, height: 150 },
});

describe("raster-effect client", () => {
  it("sends the photo once per worker, by key afterwards, never inside params", async () => {
    const { client, sent } = setup();
    const params = { ...duotoneTool.defaults, photo: PHOTO };
    await client.preview(job(params));
    await client.preview(job({ ...params, amount: 50 }));
    expect(sent).toHaveLength(2);
    expect(sent[0]?.photo).toEqual({ key: expect.any(String), href: PHOTO.href });
    expect(sent[1]?.photo).toEqual({ key: sent[0]?.photo?.key });
    expect(sent.every((r) => r.params.photo === null)).toBe(true);
  });

  it("sends the photo again when the worker lost it", async () => {
    let first = true;
    const { client, sent } = setup((r) => {
      if (r.photo && r.photo.href === undefined && first) {
        first = false;
        return { id: r.id, ok: false, error: "missing-photo" };
      }
      return ok(r);
    });
    const params = { ...duotoneTool.defaults, photo: PHOTO };
    await client.preview(job(params));
    await client.encode(job(params), { mime: "image/png" });
    await client.encode(job(params), { mime: "image/png" });
    // Export has its own worker channel: it posts the photo itself.
    expect(sent.map((r) => r.photo?.href !== undefined)).toEqual([true, true, false, true]);
  });

  it("rejects with a code on errors, timeouts and without workers", async () => {
    const failing = setup((r) => ({ id: r.id, ok: false, error: "render-failed" }));
    await expect(failing.client.preview(job())).rejects.toMatchObject({ code: "render-failed" });

    const stuck = setup(() => null);
    const pending = stuck.client.encode(job(), { mime: "image/png" });
    await vi.waitFor(() => expect(stuck.timers).toHaveLength(1));
    stuck.timers[0]?.();
    await expect(pending).rejects.toMatchObject({ code: "timeout" });
    expect(stuck.fake.worker.terminate).toHaveBeenCalled();

    const none = setup(ok, "none");
    await expect(none.client.preview(job())).rejects.toBeInstanceOf(RasterEffectError);
    await expect(none.client.preview(job())).rejects.toMatchObject({ code: "unavailable" });
    expect(EFFECT_EXPORT_TIMEOUT_MS).toBeGreaterThan(60_000);
  });

  it("stops the export worker when an export is cancelled", async () => {
    const stuck = setup(() => null);
    const controller = new AbortController();
    const pending = stuck.client.encode(job(), { mime: "image/png" }, controller.signal);
    await vi.waitFor(() => expect(stuck.sent).toHaveLength(1));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(stuck.fake.worker.terminate).toHaveBeenCalledTimes(1);
    // An export already cancelled never reaches the worker.
    await expect(
      stuck.client.encode(job(), { mime: "image/png" }, controller.signal),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(stuck.sent).toHaveLength(1);
  });
});

describe("exportImageEffect", () => {
  const fakeClient = (encode: RasterEffectClient["encode"]): RasterEffectClient => ({
    preview: vi.fn(),
    encode: vi.fn(encode),
    dispose: vi.fn(),
  });

  it("renders at the output size with the design as context", async () => {
    const client = fakeClient(async () => new Blob(["x"], { type: "image/jpeg" }));
    const ctx = createRenderContext(7, { width: 1500, height: 1000 });
    const result = await exportImageEffect(
      duotoneTool,
      duotoneTool.defaults,
      ctx,
      { format: "jpg", size: { width: 3000, height: 2000 }, quality: 0.5 },
      client,
    );
    expect(client.encode).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: 7,
        design: { width: 1500, height: 1000 },
        out: { width: 3000, height: 2000 },
      }),
      { mime: "image/jpeg", quality: 0.5, background: "#ffffff" },
      undefined,
    );
    expect(result).toMatchObject({ width: 3000, height: 2000, clamped: false });
    expect(result.filename).toMatch(/^musterli-duotone-7\.jpg$/);
  });

  it("refuses SVG, oversize outputs and maps worker failures", async () => {
    const ctx = createRenderContext(1, { width: 1500, height: 1000 });
    const client = fakeClient(async () => {
      throw new RasterEffectError("unavailable");
    });
    await expect(
      exportImageEffect(duotoneTool, duotoneTool.defaults, ctx, { format: "png" }, client),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      exportImageEffect(
        duotoneTool,
        duotoneTool.defaults,
        ctx,
        { format: "png", size: { width: CANVAS_EDGE_MAX, height: CANVAS_EDGE_MAX } },
        client,
      ),
    ).rejects.toMatchObject({ code: "too-large" });
    expect(CANVAS_EDGE_MAX * CANVAS_EDGE_MAX).toBeGreaterThan(IMAGE_EFFECT_MAX_PIXELS);
    const broken = fakeClient(async () => {
      throw new RasterEffectError("render-failed");
    });
    await expect(
      exportImageEffect(duotoneTool, duotoneTool.defaults, ctx, { format: "webp" }, broken),
    ).rejects.toMatchObject({ code: "encode-failed" });
  });

  it("stops waiting when the export is cancelled", async () => {
    const controller = new AbortController();
    const client = fakeClient(() => new Promise<Blob>(() => undefined));
    const ctx = createRenderContext(1, { width: 100, height: 100 });
    const pending = exportImageEffect(
      duotoneTool,
      duotoneTool.defaults,
      ctx,
      { format: "png", signal: controller.signal },
      client,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });
});
