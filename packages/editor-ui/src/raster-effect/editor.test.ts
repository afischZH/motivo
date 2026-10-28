import {
  asciiArtTool,
  deriveFromImage,
  duotoneTool,
  type PixelBuffer,
} from "@musterli/tool-registry";
import { describe, expect, it, vi } from "vitest";
import type { ImageDecodeResult, ImageInputServices } from "../image-input/services";
import { createImageInputController } from "../image-input/use-image-input";
import { rasterPreviewSize } from "../shell/motif";
import { renderMotif } from "../shell/render";
import { createEditorStore } from "../store/editor-store";

const photo = (width: number, height: number) => ({
  kind: "raster" as const,
  href: `data:image/jpeg;base64,${btoa("\xff\xd8\xff-fake")}`,
  width,
  height,
  name: "lake.jpg",
});

function gradient(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([(i * 7) % 256, 120, 40, 255], i * 4);
  return { width, height, data };
}

function fakeServices() {
  const services: ImageInputServices = {
    decode: vi.fn(async (): Promise<ImageDecodeResult> => ({ ok: true, pixels: gradient(64, 48) })),
    crop: vi.fn(async () => ({ ok: false as const, error: "decode-failed" as const })),
    derive: vi.fn(async (t, pixels, params, seed) => {
      const patch = deriveFromImage(t, pixels, params, seed);
      return patch
        ? { ok: true as const, patch }
        : { ok: false as const, error: "no-result" as const };
    }),
    dispose: vi.fn(),
  };
  return services;
}

describe("photo tools in the editor", () => {
  it("render image effects as raster motifs", () => {
    const output = renderMotif(duotoneTool, duotoneTool.defaults, 4, { width: 300, height: 200 });
    expect(output).toMatchObject({ kind: "raster", seed: 4, size: { width: 300, height: 200 } });
  });

  it("render previews at device pixels, never above the design size", () => {
    const design = { width: 1500, height: 1000 };
    expect(rasterPreviewSize(design, 0.4, 2)).toEqual({ width: 1200, height: 800 });
    expect(rasterPreviewSize(design, 0.8, 2)).toEqual(design);
    expect(rasterPreviewSize(design, 0.1, Number.NaN)).toEqual({ width: 150, height: 100 });
  });

  it("set the design size to a new photo in the same undo step", () => {
    const store = createEditorStore({ toolId: duotoneTool.id });
    store.getState().setParam("photo", photo(1200, 900));
    expect(store.getState().size).toEqual({ width: 1200, height: 900 });
    expect(store.getState().past).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().size).toEqual(duotoneTool.defaultSize);
    expect(store.getState().params.photo).toBeNull();
    // Removing the photo keeps the size.
    store.getState().setParam("photo", photo(1200, 900));
    store.getState().setParam("photo", null);
    expect(store.getState().size).toEqual({ width: 1200, height: 900 });
  });

  it("analyse the photo param instead of the picker, and the sample by default", async () => {
    const store = createEditorStore({ toolId: asciiArtTool.id });
    const services = fakeServices();
    const controller = createImageInputController(store, asciiArtTool, services);
    const stop = controller.start();
    expect(controller.getView()).toMatchObject({ source: { kind: "sample" }, pixels: null });
    expect(services.derive).not.toHaveBeenCalled();
    expect(store.getState().params.grid).toBe("");

    store.getState().setParam("photo", photo(640, 480));
    await vi.waitFor(() => expect(store.getState().params.grid).toMatch(/^v1:/));
    expect(services.decode).toHaveBeenCalledWith(
      expect.any(Blob),
      asciiArtTool.imageInput?.maxEdge,
    );
    expect(controller.getView().source).toEqual({ kind: "user", name: "lake.jpg" });
    const grid = store.getState().params.grid;

    // The grid follows the columns; the derive adds no undo step.
    store.getState().setParam("columns", 40);
    await vi.waitFor(() => expect(store.getState().params.grid).not.toBe(grid));
    expect(store.getState().past).toHaveLength(2);

    store.getState().setParam("photo", null);
    expect(store.getState().params.grid).toBe("");
    expect(controller.getView().source).toEqual({ kind: "sample" });
    stop();
  });
});
