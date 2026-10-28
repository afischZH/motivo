import { flipRows, renderShaderGradientCpu, type ShaderFrame } from "@musterli/shaders";
import { ShaderContextLostError } from "@musterli/shaders/runtime";
import { registry, renderWebglReference, type AnyToolDefinition } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import {
  SHADER_FRAME_MAX_EDGE,
  createShaderHandler,
  isValidShaderRequest,
  type ShaderRenderRequest,
  type ShaderRenderResponse,
  type ShaderRuntimeLike,
  type ShaderWorkerEnv,
} from "./protocol";

function tool(id: string): AnyToolDefinition {
  const t = registry.get(id);
  if (!t) throw new Error(`missing tool ${id}`);
  return t;
}

const shader = tool("shader-gradient");

/** Bitmap stand-in that carries the pixels it was made from. */
interface FakeBitmap {
  width: number;
  height: number;
  pixels: Uint8Array;
  close(): void;
}

/** A runtime that draws with the CPU twin (the GPU's reference) and reads back bottom-up. */
function cpuRuntime(log: { draws: ShaderFrame[] }, lose?: () => boolean): ShaderRuntimeLike {
  let last: Uint8Array = new Uint8Array(0);
  let lost = false;
  return {
    draw(frame) {
      log.draws.push(frame);
      if (lose?.()) {
        lost = true;
        throw new ShaderContextLostError();
      }
      const tile = frame.tile ?? { x: 0, y: 0, ...frame.out };
      const pixels = renderShaderGradientCpu({ ...frame, tile });
      last = new Uint8Array(pixels.data);
      flipRows(last, tile.width, tile.height);
    },
    readPixels: () => last,
    isLost: () => lost,
    dispose: () => undefined,
  };
}

interface Harness {
  handle: (r: ShaderRenderRequest) => Promise<ShaderRenderResponse>;
  draws: ShaderFrame[];
  runtimes: number;
  progress: number[];
  composed: Uint8ClampedArray | null;
}

function harness(
  options: { webgl?: boolean; lose?: (n: number) => boolean; fail?: boolean } = {},
): Harness {
  const h: Harness = {
    handle: () => Promise.reject(new Error("unset")),
    draws: [],
    runtimes: 0,
    progress: [],
    composed: null,
  };
  let draws = 0;
  const env: ShaderWorkerEnv = {
    createRuntime() {
      if (options.webgl === false) return null;
      h.runtimes++;
      const runtime = cpuRuntime(h, () => options.lose?.(draws++) ?? false);
      if (options.fail) {
        runtime.draw = () => {
          throw new Error("shader does not compile");
        };
      }
      return runtime;
    },
    snapshot(runtime) {
      const pixels = runtime.readPixels();
      const frame = h.draws.at(-1);
      if (!frame) throw new Error("nothing drawn");
      const top = pixels.slice();
      flipRows(top, frame.out.width, frame.out.height);
      const bitmap: FakeBitmap = { ...frame.out, pixels: top, close: () => undefined };
      return Promise.resolve(bitmap as unknown as ImageBitmap);
    },
    createComposer(width, height) {
      const all = new Uint8ClampedArray(width * height * 4);
      h.composed = all;
      return {
        putStrip(strip, y) {
          all.set(strip, y * width * 4);
        },
        encode: (o) => Promise.resolve(new Blob([all], { type: o.mime })),
      };
    },
    lookup: (id) => registry.get(id),
    progress: (_, f) => h.progress.push(f),
  };
  h.handle = createShaderHandler(env);
  return h;
}

let nextId = 1;
const request = (r: Partial<ShaderRenderRequest> = {}): ShaderRenderRequest => ({
  id: nextId++,
  toolId: "shader-gradient",
  params: shader.defaults,
  seed: 1,
  design: { width: 160, height: 100 },
  out: { width: 80, height: 50 },
  ...r,
});

const reference = (r: ShaderRenderRequest) =>
  renderWebglReference(shader, r.params, r.seed, r.design, r.out, r.t).data;

describe("shader worker handler", () => {
  it("draws a preview frame equal to the CPU reference", async () => {
    const h = harness();
    const r = request({ t: 0.3 });
    const reply = await h.handle(r);
    if (!("ok" in reply) || !reply.ok || !("bitmap" in reply)) throw new Error("no bitmap");
    const bitmap = reply.bitmap as unknown as FakeBitmap;
    expect([bitmap.width, bitmap.height]).toEqual([80, 50]);
    expect(bitmap.pixels).toEqual(new Uint8Array(reference(r)));
    expect(h.draws[0]?.tile).toBeUndefined();
  });

  it("assembles tiled JPG and WebP exports into the same picture as one pass", async () => {
    const h = harness();
    // Wider than one tile (1024 px), so two tiles side by side.
    const r = request({
      design: { width: 1100, height: 24 },
      out: { width: 1100, height: 24 },
      encode: { mime: "image/jpeg", quality: 0.9 },
    });
    const reply = await h.handle(r);
    if (!("ok" in reply) || !reply.ok || !("blob" in reply)) throw new Error("no blob");
    expect(reply.blob.type).toBe("image/jpeg");
    expect(h.draws.map((d) => d.tile?.x)).toEqual([0, 1024]);
    expect(h.composed).toEqual(reference(r));
    expect(h.progress.at(-1)).toBeCloseTo(0.9);
  });

  it("streams PNG exports", async () => {
    const h = harness();
    const reply = await h.handle(
      request({ out: { width: 120, height: 75 }, encode: { mime: "image/png" } }),
    );
    if (!("ok" in reply) || !reply.ok || !("blob" in reply)) throw new Error("no blob");
    expect(reply.blob.type).toBe("image/png");
    const bytes = new Uint8Array(await reply.blob.arrayBuffer());
    expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([120, 75]);
    expect(h.progress).toEqual([1]);
    expect(h.composed).toBeNull();
  });

  it("refuses malformed requests", async () => {
    const h = harness();
    const errorOf = async (r: Partial<ShaderRenderRequest>) => {
      const reply = await h.handle(request(r));
      return "ok" in reply && !reply.ok ? reply.error : "ok";
    };
    expect(await errorOf({ toolId: "nope" })).toBe("unknown-tool");
    expect(await errorOf({ toolId: "blob", params: tool("blob").defaults })).toBe(
      "invalid-request",
    );
    expect(await errorOf({ out: { width: SHADER_FRAME_MAX_EDGE + 1, height: 10 } })).toBe(
      "invalid-request",
    );
    expect(await errorOf({ out: { width: 0, height: 10 } })).toBe("invalid-request");
    expect(await errorOf({ t: 1.5 })).toBe("invalid-request");
    expect(await errorOf({ params: { ...shader.defaults, style: "nope" } })).toBe(
      "invalid-request",
    );
    expect(
      await errorOf({ out: { width: 8192, height: 8192 }, encode: { mime: "image/webp" } }),
    ).toBe("too-large");
    expect(h.draws).toHaveLength(0);
  });

  it("accepts large PNG exports and bitmaps up to the frame edge", () => {
    expect(
      isValidShaderRequest(
        shader,
        request({ out: { width: 8192, height: 8192 }, encode: { mime: "image/png" } }),
      ),
    ).toBe(true);
    expect(
      isValidShaderRequest(
        shader,
        request({ out: { width: SHADER_FRAME_MAX_EDGE, height: SHADER_FRAME_MAX_EDGE } }),
      ),
    ).toBe(true);
  });

  it("reports a browser without WebGL2", async () => {
    const reply = await harness({ webgl: false }).handle(request());
    expect(reply).toMatchObject({ ok: false, error: "unsupported" });
  });

  it("retries once on a fresh runtime after a lost context", async () => {
    const h = harness({ lose: (n) => n === 0 });
    const reply = await h.handle(request());
    expect(reply).toMatchObject({ ok: true });
    expect(h.runtimes).toBe(2);
    const again = harness({ lose: () => true });
    expect(await again.handle(request())).toMatchObject({ ok: false, error: "context-lost" });
  });

  it("reports render failures without retrying", async () => {
    const h = harness({ fail: true });
    expect(await h.handle(request())).toMatchObject({ ok: false, error: "render-failed" });
    expect(h.runtimes).toBe(1);
  });
});
