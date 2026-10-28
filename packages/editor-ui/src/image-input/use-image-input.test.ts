import { sampleImagePixels } from "@musterli/engine";
import {
  deriveFromImage,
  paletteFromImageTool,
  type PaletteFromImageParams,
  type PixelBuffer,
} from "@musterli/tool-registry";
import { describe, expect, it, vi } from "vitest";
import { createEditorStore } from "../store/editor-store";
import type { ImageDecodeResult, ImageInputServices } from "./services";
import { createImageInputController } from "./use-image-input";

const tool = paletteFromImageTool;

function solid(rgb: readonly [number, number, number], alpha = 255): PixelBuffer {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, alpha], i);
  return { width: 4, height: 4, data };
}

/** Services that derive in-process; `decode` answers with what the test queues. */
function fakeServices(decoded: ImageDecodeResult[] = []) {
  const services: ImageInputServices = {
    decode: vi.fn(
      async (): Promise<ImageDecodeResult> =>
        decoded.shift() ?? { ok: false, error: "decode-failed" },
    ),
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

function setup(decoded: ImageDecodeResult[] = []) {
  let seed = 10;
  const store = createEditorStore({ toolId: tool.id, randomSeed: () => ++seed });
  const services = fakeServices(decoded);
  const controller = createImageInputController(store, tool, services);
  const params = () => store.getState().params as PaletteFromImageParams;
  return { store, services, controller, params };
}

const settle = () => vi.waitFor(() => undefined).then(() => new Promise((r) => setTimeout(r, 0)));

describe("image input controller", () => {
  it("starts on the sample, whose palette already matches the defaults", async () => {
    const { controller, params, store } = setup();
    const stop = controller.start();
    expect(controller.getView().source).toEqual({ kind: "sample" });
    expect(controller.getView().pixels?.width).toBe(160);
    await settle();
    expect(params()).toEqual(tool.defaults);
    expect(store.getState().past).toHaveLength(0);
    stop();
  });

  it("re-runs derive on Space (new seed) and on count, without extra undo steps", async () => {
    const { controller, params, store } = setup();
    controller.start();
    await settle();
    store.getState().setParam("count", 8);
    await vi.waitFor(() => expect(params().colors).toHaveLength(8));
    expect(store.getState().past).toHaveLength(1);
    store.getState().newVariant();
    const seed = store.getState().seed;
    await settle();
    expect(params().colors).toEqual(
      (deriveFromImage(tool, sampleImagePixels(), params(), seed) as PaletteFromImageParams).colors,
    );
    expect(store.getState().past).toHaveLength(2);
    // The filmstrip entry carries the derived colours too.
    expect(store.getState().variants.at(-1)?.params).toBe(store.getState().params);
  });

  it("loads a user image, announces it and can go back to the sample", async () => {
    const red = solid([230, 57, 70]);
    const { controller, params } = setup([{ ok: true, pixels: red }]);
    controller.start();
    await settle();
    controller.loadFile(Object.assign(new Blob(["x"]), { name: "red.png" }));
    expect(controller.getView().status).toBe("loading");
    await vi.waitFor(() => expect(params().colors).toEqual([{ color: "#e63946", share: 1 }]));
    expect(controller.getView()).toMatchObject({
      source: { kind: "user", name: "red.png" },
      status: "idle",
      error: null,
      loadedCount: 1,
    });
    controller.resetToSample();
    await vi.waitFor(() => expect(params().colors).toEqual(tool.defaults.colors));
  });

  it("keeps the current picture and shows an error when loading fails", async () => {
    const { controller, params } = setup([{ ok: false, error: "too-large" }]);
    controller.start();
    await settle();
    controller.loadFile(new Blob(["x"]));
    await vi.waitFor(() => expect(controller.getView().error).toBe("too-large"));
    expect(controller.getView().source).toEqual({ kind: "sample" });
    expect(params()).toEqual(tool.defaults);
    controller.dismissError();
    expect(controller.getView().error).toBeNull();
  });

  it("reports an image without result and leaves the colours alone", async () => {
    const { controller, params } = setup([{ ok: true, pixels: solid([0, 0, 0], 0) }]);
    controller.start();
    await settle();
    controller.loadFile(new Blob(["x"]));
    await vi.waitFor(() => expect(controller.getView().error).toBe("no-result"));
    expect(params().colors).toEqual(tool.defaults.colors);
  });

  it("recovers from rejected service calls instead of hanging", async () => {
    const { controller, params, store, services } = setup();
    controller.start();
    await settle();
    vi.mocked(services.decode).mockRejectedValueOnce(new Error("boom"));
    controller.loadFile(new Blob(["x"]));
    await vi.waitFor(() => expect(controller.getView().error).toBe("decode-failed"));
    expect(controller.getView().status).toBe("idle");
    // A derive that throws once must not block every later derive.
    vi.mocked(services.derive).mockRejectedValueOnce(new Error("boom"));
    store.getState().setParam("count", 3);
    await settle();
    expect(controller.getView().status).toBe("idle");
    store.getState().setParam("count", 4);
    await vi.waitFor(() => expect(params().colors).toHaveLength(4));
  });

  it("applies only the newest result when changes overlap", async () => {
    const { controller, params, store, services } = setup();
    controller.start();
    for (const count of [3, 4, 5, 6, 7]) store.getState().setParam("count", count);
    await vi.waitFor(() => expect(params().colors).toHaveLength(7));
    await settle();
    expect(params().colors).toHaveLength(7);
    // One run in flight plus one queued rerun, not one per change.
    expect(vi.mocked(services.derive).mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("ignores replies after stop and disposes the services", async () => {
    const { controller, services, store, params } = setup();
    const stop = controller.start();
    store.getState().setParam("count", 3);
    stop();
    await settle();
    expect(params().colors).toEqual(tool.defaults.colors);
    expect(services.dispose).toHaveBeenCalled();
  });
});
