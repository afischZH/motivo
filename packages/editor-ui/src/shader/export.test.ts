import { createRenderContext, registry, type AnyToolDefinition } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { ShaderRenderError, type ShaderClient, type ShaderJob } from "./client";
import { exportShader, shaderGifFrames } from "./export";
import type { ShaderEncodeOptions } from "./protocol";

const tool = registry.get("shader-gradient") as AnyToolDefinition;
const ctx = createRenderContext(7, { width: 1600, height: 1000 });

function fakeClient(fail?: ShaderRenderError) {
  const calls: { job: ShaderJob; options?: ShaderEncodeOptions }[] = [];
  const client: ShaderClient = {
    preview: () => Promise.reject(new Error("not used")),
    frame(job) {
      calls.push({ job });
      if (fail) return Promise.reject(fail);
      return Promise.resolve({ width: job.out.width } as ImageBitmap);
    },
    encode(job, options, _signal, onProgress) {
      calls.push({ job, options });
      if (fail) return Promise.reject(fail);
      onProgress?.(0.5);
      return Promise.resolve(new Blob(["x"], { type: options.mime }));
    },
    dispose: () => undefined,
  };
  return { client, calls };
}

describe("exportShader", () => {
  it("encodes at the requested size with the design as render context", async () => {
    const { client, calls } = fakeClient();
    const progress: number[] = [];
    const result = await exportShader(
      tool,
      tool.defaults,
      ctx,
      { format: "webp", size: { scale: 4 }, onProgress: (f) => progress.push(f) },
      client,
    );
    expect(result).toMatchObject({ width: 6400, height: 4000, clamped: false });
    expect(result.filename).toBe("musterli-shader-gradient-7.webp");
    expect(calls[0]?.job).toMatchObject({
      seed: 7,
      design: { width: 1600, height: 1000 },
      out: { width: 6400, height: 4000 },
    });
    expect(calls[0]?.options?.mime).toBe("image/webp");
    expect(progress).toEqual([0.5, 1]);
  });

  it("refuses formats the tool lacks and JPG/WebP over the budget", async () => {
    const { client, calls } = fakeClient();
    const blob = registry.get("blob") as AnyToolDefinition;
    await expect(
      exportShader(blob, blob.defaults, ctx, { format: "png" }, client),
    ).rejects.toMatchObject({ code: "unsupported-format" });
    await expect(
      exportShader(
        tool,
        tool.defaults,
        createRenderContext(1, { width: 8192, height: 8192 }),
        { format: "jpg" },
        client,
      ),
    ).rejects.toMatchObject({ code: "too-large" });
    expect(calls).toHaveLength(0);
    // PNG streams, so the full 8K square is fine.
    await expect(
      exportShader(
        tool,
        tool.defaults,
        createRenderContext(1, { width: 8192, height: 8192 }),
        { format: "png" },
        client,
      ),
    ).resolves.toMatchObject({ width: 8192, height: 8192 });
  });

  it("maps worker failures to export errors", async () => {
    const { client } = fakeClient(new ShaderRenderError("unsupported"));
    await expect(
      exportShader(tool, tool.defaults, ctx, { format: "png" }, client),
    ).rejects.toMatchObject({ code: "unavailable" });
    const broken = fakeClient(new ShaderRenderError("render-failed"));
    await expect(
      exportShader(tool, tool.defaults, ctx, { format: "png" }, broken.client),
    ).rejects.toMatchObject({ code: "encode-failed" });
  });
});

describe("shaderGifFrames", () => {
  it("draws each frame at the GIF size with its loop time", async () => {
    const { client, calls } = fakeClient();
    const render = shaderGifFrames(tool, ctx, client);
    const frame = await render(
      { params: tool.defaults, seed: 7, t: 0.25 },
      { width: 320, height: 200 },
      undefined,
    );
    expect("bitmap" in frame).toBe(true);
    expect(calls[0]?.job).toMatchObject({
      t: 0.25,
      design: { width: 1600, height: 1000 },
      out: { width: 320, height: 200 },
    });
  });
});
