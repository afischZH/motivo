import {
  coverRect,
  duotoneTool,
  photoSampleSize,
  renderImageEffect,
  type CanvasSize,
  type PixelBuffer,
} from "@musterli/tool-registry";
import { describe, expect, it, vi } from "vitest";
import {
  createEffectHandler,
  decodeDataUri,
  type EffectBitmap,
  type EffectEncodeOptions,
  type EffectRenderRequest,
  type EffectWorkerEnv,
} from "./protocol";

const PNG_HREF = `data:image/png;base64,${btoa("\x89PNG-fake")}`;

/** Fake bitmaps remember their size; `readCover` paints a gradient of the crop. */
function fakeEnv(overrides: Partial<EffectWorkerEnv> = {}) {
  const closed: EffectBitmap[] = [];
  const bitmap = (width: number, height: number): EffectBitmap => {
    const b = { width, height, close: () => closed.push(b) };
    return b;
  };
  const base = {
    decode: vi.fn(async () => bitmap(4000, 3000)),
    readCover: vi.fn(
      (_b: EffectBitmap, _crop: { x: number; y: number }, out: CanvasSize): PixelBuffer => {
        const data = new Uint8ClampedArray(out.width * out.height * 4);
        for (let i = 0; i < data.length; i += 4) data.set([(i / 4) % 256, 90, 160, 255], i);
        return { width: out.width, height: out.height, data };
      },
    ),
    toBitmap: vi.fn(async (p: PixelBuffer) => bitmap(p.width, p.height) as unknown as ImageBitmap),
    encode: vi.fn(
      async (p: PixelBuffer, options: EffectEncodeOptions) =>
        new Blob([p.data.slice(0, 8)], { type: options.mime }),
    ),
    lookup: (id: string) => (id === duotoneTool.id ? duotoneTool : undefined),
  } satisfies EffectWorkerEnv;
  // Overrides are mocks too; the cast keeps the mock types of the base.
  const env = { ...base, ...overrides } as typeof base;
  return { env, closed };
}

const request = (patch: Partial<EffectRenderRequest> = {}): EffectRenderRequest => ({
  id: 1,
  toolId: duotoneTool.id,
  params: duotoneTool.defaults,
  seed: 1,
  design: { width: 1500, height: 1000 },
  out: { width: 60, height: 40 },
  photo: null,
  ...patch,
});

describe("decodeDataUri", () => {
  it("returns the bytes and type of raster data URIs only", () => {
    expect(decodeDataUri(PNG_HREF)).toEqual({
      bytes: new Uint8Array([..."\x89PNG-fake"].map((c) => c.charCodeAt(0))),
      mime: "image/png",
    });
    expect(decodeDataUri("data:image/svg+xml;base64,PHN2Zy8+")).toBeNull();
    expect(decodeDataUri("data:image/png;base64,***")).toBeNull();
    expect(decodeDataUri("https://example.com/x.png")).toBeNull();
  });
});

describe("raster-effect handler", () => {
  it("renders the sample through the same path as a photo, generating it once", async () => {
    const { env } = fakeEnv();
    const handle = createEffectHandler(env);
    const first = await handle(request());
    const second = await handle(request({ id: 2, out: { width: 30, height: 20 } }));
    expect(first).toMatchObject({ id: 1, ok: true });
    expect(second).toMatchObject({ id: 2, ok: true });
    // One bitmap for the sample, one per preview result.
    expect(env.toBitmap).toHaveBeenCalledTimes(3);
    const sample = photoSampleSize({ width: 1500, height: 1000 });
    expect(env.toBitmap.mock.calls[0]?.[0]).toMatchObject(sample);
    expect(env.readCover.mock.calls[1]?.[2]).toEqual({ width: 30, height: 20 });
    expect(env.decode).not.toHaveBeenCalled();
  });

  it("returns exactly the effect of the tool on the cropped source", async () => {
    const { env } = fakeEnv();
    const handle = createEffectHandler(env);
    const reply = await handle(request({ encode: { mime: "image/png" } }));
    expect(reply).toMatchObject({ ok: true });
    const encoded = env.encode.mock.calls[0]?.[0];
    const source = env.readCover.mock.results[0]?.value as PixelBuffer;
    const expected = renderImageEffect(
      duotoneTool,
      duotoneTool.defaults,
      1,
      { width: 1500, height: 1000 },
      { width: 60, height: 40 },
      source,
    );
    expect(encoded?.data).toEqual(expected.data);
    expect(env.encode.mock.calls[0]?.[1]).toEqual({ mime: "image/png" });
  });

  it("crops the photo like object-fit: cover and decodes it once per key", async () => {
    const { env } = fakeEnv();
    const handle = createEffectHandler(env);
    expect(await handle(request({ photo: { key: "p1", href: PNG_HREF } }))).toMatchObject({
      ok: true,
    });
    expect(await handle(request({ id: 2, photo: { key: "p1" } }))).toMatchObject({ ok: true });
    expect(env.decode).toHaveBeenCalledTimes(1);
    expect(env.readCover.mock.calls[0]?.[1]).toEqual(coverRect(4000, 3000, 60, 40));
  });

  it("asks for the photo when it does not hold it, and reports bad photos", async () => {
    const { env } = fakeEnv({ decode: vi.fn(async () => Promise.reject(new Error("bad"))) });
    const handle = createEffectHandler(env);
    expect(await handle(request({ photo: { key: "p9" } }))).toEqual({
      id: 1,
      ok: false,
      error: "missing-photo",
    });
    expect(await handle(request({ photo: { key: "p9", href: PNG_HREF } }))).toMatchObject({
      ok: false,
      error: "decode-failed",
    });
    // A failed photo is forgotten, so the next request sends it again.
    expect(await handle(request({ photo: { key: "p9" } }))).toMatchObject({
      error: "missing-photo",
    });
  });

  it("keeps two photos and closes the ones it drops", async () => {
    const { env, closed } = fakeEnv();
    const handle = createEffectHandler(env);
    for (const key of ["a", "b", "c"]) {
      await handle(request({ photo: { key, href: PNG_HREF } }));
    }
    await vi.waitFor(() => expect(closed.some((b) => b.width === 4000)).toBe(true));
    expect(await handle(request({ photo: { key: "a" } }))).toMatchObject({
      error: "missing-photo",
    });
    expect(await handle(request({ photo: { key: "c" } }))).toMatchObject({ ok: true });
  });

  it("fails cleanly for unknown tools, missing APIs and throwing effects", async () => {
    const { env } = fakeEnv();
    expect(await createEffectHandler(env)(request({ toolId: "nope" }))).toMatchObject({
      error: "unknown-tool",
    });
    expect(await createEffectHandler({ ...env, decode: null })(request())).toMatchObject({
      error: "unsupported",
    });
    const failing = createEffectHandler({
      ...env,
      encode: vi.fn(async () => Promise.reject(new Error("too big"))),
    });
    expect(await failing(request({ encode: { mime: "image/webp" } }))).toMatchObject({
      error: "render-failed",
    });
    // The queue goes on after a failure.
    expect(await failing(request({ id: 5 }))).toMatchObject({ id: 5, ok: true });
  });
});
