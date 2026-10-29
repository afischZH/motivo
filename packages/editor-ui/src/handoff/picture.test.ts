import { effectPhotoAssetSchema, photoAssetSchema, registry } from "@musterli/tool-registry";
import { describe, expect, it, vi } from "vitest";
import { IMAGE_INPUT_MAX_BYTES } from "../image-input/check";
import type { ImageInputServices } from "../image-input/services";
import { fakeServices } from "../test/fake-services";
import {
  HANDOFF_MIN_EDGE,
  HandoffError,
  handoffSize,
  prepareHandoffAsset,
  renderHandoffPicture,
} from "./picture";

const u32be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const pngHeader = (w: number, h: number) =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32be(13),
    ...[..."IHDR"].map((c) => c.charCodeAt(0)),
    ...u32be(w),
    ...u32be(h),
    8,
    6,
    0,
    0,
    0,
  ]);

const mesh = registry.get("mesh-gradient");
if (!mesh) throw new Error("mesh-gradient missing");

describe("handoffSize", () => {
  it("fits the design into the target edge without enlarging it", () => {
    expect(handoffSize({ width: 1600, height: 900 }, 4096)).toEqual({ width: 1600, height: 900 });
    expect(handoffSize({ width: 8000, height: 4000 }, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(handoffSize({ width: 1600, height: 900 }, 2048, 0.5)).toEqual({
      width: 800,
      height: 450,
    });
    expect(handoffSize({ width: 8192, height: 16 }, 1024)).toEqual({
      width: 1024,
      height: HANDOFF_MIN_EDGE,
    });
  });
});

describe("renderHandoffPicture", () => {
  it("renders a PNG through the export's raster service at the target size", async () => {
    const services = fakeServices();
    const picture = await renderHandoffPicture(
      services.exportRaster,
      mesh,
      mesh.defaults,
      7,
      { width: 3000, height: 1500 },
      { maxEdge: 2048, photo: false },
    );
    expect(services.exportRaster).toHaveBeenCalledTimes(1);
    const [tool, , ctx, options] = services.exportRaster.mock.calls[0] ?? [];
    expect(tool?.id).toBe("mesh-gradient");
    expect(ctx).toMatchObject({ seed: 7, width: 3000, height: 1500 });
    expect(options).toMatchObject({ format: "png", size: { width: 2048, height: 1024 } });
    expect(picture).toMatchObject({ width: 2048, height: 1024 });
  });

  it("tries a JPEG for photo targets, then smaller sizes, when over the upload limit", async () => {
    const big = new Blob([new Uint8Array(IMAGE_INPUT_MAX_BYTES + 1)], { type: "image/png" });
    const small = new Blob(["ok"], { type: "image/jpeg" });
    const exportRaster = vi.fn(async (_tool, _params, ctx, options) => ({
      blob: options.format === "jpg" && options.size.width < 1000 ? small : big,
      width: options.size.width,
      height: options.size.height,
      clamped: false,
      filename: "x",
    })) as unknown as Parameters<typeof renderHandoffPicture>[0];
    const picture = await renderHandoffPicture(
      exportRaster,
      mesh,
      mesh.defaults,
      1,
      { width: 1600, height: 900 },
      { maxEdge: 4096, photo: true },
    );
    expect(picture.blob).toBe(small);
    const calls = (exportRaster as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => `${c[3].format}@${c[3].size.width}`,
    );
    expect(calls).toEqual(["png@1600", "jpg@1600", "png@1120", "jpg@1120", "png@800", "jpg@800"]);
  });

  it("gives up with too-large when even the smallest step does not fit", async () => {
    const big = new Blob([new Uint8Array(IMAGE_INPUT_MAX_BYTES + 1)], { type: "image/png" });
    const services = fakeServices({
      exportRaster: async (_tool, _params, _ctx, options) => ({
        blob: big,
        width: options.size?.width ?? 1,
        height: options.size?.height ?? 1,
        clamped: false,
        filename: "x",
      }),
    });
    await expect(
      renderHandoffPicture(
        services.exportRaster,
        mesh,
        mesh.defaults,
        1,
        { width: 800, height: 800 },
        { maxEdge: 2048, photo: false },
      ),
    ).rejects.toBeInstanceOf(HandoffError);
    expect(services.exportRaster).toHaveBeenCalledTimes(4);
  });
});

const crop = (result: Awaited<ReturnType<ImageInputServices["crop"]>>) => ({
  crop: vi.fn<ImageInputServices["crop"]>(async () => result),
});
const JPEG_URI = "data:image/jpeg;base64,/9j/4AAQ";
const photoControl = {
  maxEdge: 4096,
  photo: true,
  rasterOnly: true,
  schema: effectPhotoAssetSchema,
};

describe("prepareHandoffAsset", () => {
  it("runs the upload checks and re-encodes the whole picture in the worker", async () => {
    const svc = crop({ ok: true, href: JPEG_URI, width: 1600, height: 900 });
    const result = await prepareHandoffAsset(
      new Blob([pngHeader(1600, 900)], { type: "image/png" }),
      "musterli-mesh-gradient-1.png",
      photoControl,
      svc,
    );
    expect(svc.crop).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "image/png",
      { x: 0, y: 0, width: 1600, height: 900 },
      4096,
      true,
    );
    expect(result).toEqual({
      ok: true,
      asset: {
        kind: "raster",
        href: JPEG_URI,
        width: 1600,
        height: 900,
        name: "musterli-mesh-gradient-1.png",
      },
    });
  });

  it("refuses broken, oversize and SVG data like any upload", async () => {
    const svc = crop({ ok: true, href: JPEG_URI, width: 10, height: 10 });
    const broken = await prepareHandoffAsset(new Blob(["garbage"]), "x.png", photoControl, svc);
    expect(broken).toEqual({ ok: false, error: "unsupported-type" });
    const big = new Uint8Array(IMAGE_INPUT_MAX_BYTES + 1);
    big.set(pngHeader(10, 10));
    expect(await prepareHandoffAsset(new Blob([big]), "x.png", photoControl, svc)).toEqual({
      ok: false,
      error: "too-large",
    });
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>']);
    expect(await prepareHandoffAsset(svg, "x.svg", photoControl, svc)).toEqual({
      ok: false,
      error: "raster-only",
    });
    const bomb = await prepareHandoffAsset(
      new Blob([pngHeader(10_000, 10_000)]),
      "x.png",
      photoControl,
      svc,
    );
    expect(bomb).toEqual({ ok: false, error: "too-many-pixels" });
    expect(svc.crop).not.toHaveBeenCalled();
  });

  it("lets the target param's schema decide (edge limit)", async () => {
    const svc = crop({ ok: true, href: JPEG_URI, width: 4096, height: 2304 });
    const result = await prepareHandoffAsset(
      new Blob([pngHeader(4096, 2304)]),
      "x.png",
      { maxEdge: 2048, photo: true, rasterOnly: false, schema: photoAssetSchema },
      svc,
    );
    expect(result).toEqual({ ok: false, error: "too-large" });
  });

  it("reports a failed decode in the worker", async () => {
    const svc = crop({ ok: false, error: "decode-failed" });
    const result = await prepareHandoffAsset(
      new Blob([pngHeader(20, 20)]),
      "x.png",
      photoControl,
      svc,
    );
    expect(result).toEqual({ ok: false, error: "decode-failed" });
  });
});
