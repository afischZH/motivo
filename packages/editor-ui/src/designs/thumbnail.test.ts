import type { RasterEnv } from "@musterli/exporters";
import { registry, type AnyToolDefinition } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import {
  RasterEffectError,
  type RasterEffectClient,
  type RasterEffectJob,
} from "../raster-effect/client";
import type { EffectEncodeOptions } from "../raster-effect/protocol";
import { ShaderRenderError, type ShaderClient, type ShaderJob } from "../shader/client";
import type { ShaderEncodeOptions } from "../shader/protocol";
import { DESIGN_THUMBNAIL_EDGE, createDesignThumbnail } from "./thumbnail";

function tool(id: string): AnyToolDefinition {
  const found = registry.get(id);
  if (!found) throw new Error(`missing tool ${id}`);
  return found;
}

/** A shader client that encodes every format except those in `refuse`. */
function fakeShader(refuse: { mime?: string; error: ShaderRenderError } | null = null) {
  const calls: { job: ShaderJob; options: ShaderEncodeOptions }[] = [];
  const client: ShaderClient = {
    preview: () => Promise.reject(new Error("not used")),
    frame: () => Promise.reject(new Error("not used")),
    encode(job, options) {
      calls.push({ job, options });
      if (refuse && (refuse.mime === undefined || refuse.mime === options.mime)) {
        return Promise.reject(refuse.error);
      }
      return Promise.resolve(new Blob(["x"], { type: options.mime }));
    },
    dispose: () => undefined,
  };
  return { client, calls };
}

function fakeEffect(fail: RasterEffectError | null = null) {
  const calls: { job: RasterEffectJob; options: EffectEncodeOptions }[] = [];
  const client: RasterEffectClient = {
    preview: () => Promise.reject(new Error("not used")),
    encode(job, options) {
      calls.push({ job, options });
      if (fail) return Promise.reject(fail);
      return Promise.resolve(new Blob(["x"], { type: options.mime }));
    },
    dispose: () => undefined,
  };
  return { client, calls };
}

const shader = tool("shader-gradient");

describe("design thumbnails", () => {
  it("draws WebGL designs in the shader worker, small", async () => {
    const { client, calls } = fakeShader();
    const blob = await createDesignThumbnail(
      shader,
      shader.defaults,
      5,
      { width: 1600, height: 900 },
      { shaderClient: client },
    );
    expect(blob?.type).toBe("image/webp");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.job).toMatchObject({
      seed: 5,
      design: { width: 1600, height: 900 },
      out: { width: DESIGN_THUMBNAIL_EDGE, height: 225 },
    });
  });

  it("falls back to PNG where WebP cannot be encoded", async () => {
    const { client, calls } = fakeShader({
      mime: "image/webp",
      error: new ShaderRenderError("render-failed"),
    });
    const blob = await createDesignThumbnail(
      shader,
      shader.defaults,
      1,
      { width: 300, height: 300 },
      { shaderClient: client },
    );
    expect(blob?.type).toBe("image/png");
    // Never larger than the design.
    expect(calls.map((c) => c.job.out)).toEqual([
      { width: 300, height: 300 },
      { width: 300, height: 300 },
    ]);
  });

  it("saves without a thumbnail where the worker is unavailable", async () => {
    const { client, calls } = fakeShader({ error: new ShaderRenderError("unavailable") });
    const blob = await createDesignThumbnail(
      shader,
      shader.defaults,
      1,
      { width: 800, height: 800 },
      { shaderClient: client },
    );
    expect(blob).toBeNull();
    expect(calls).toHaveLength(1);
  });

  for (const id of ["halftone", "cmyk-halftone", "dither", "duotone"]) {
    it(`draws ${id} designs in the raster-effect worker, with the demo picture`, async () => {
      const effect = tool(id);
      const { client, calls } = fakeEffect();
      const blob = await createDesignThumbnail(
        effect,
        effect.defaults,
        3,
        { width: 1080, height: 1350 },
        { effectClient: client },
      );
      expect(blob?.type).toBe("image/webp");
      expect(calls[0]?.job.out).toEqual({ width: 320, height: DESIGN_THUMBNAIL_EDGE });
      expect(calls[0]?.job.design).toEqual({ width: 1080, height: 1350 });
      // No photo in the design: the worker draws the tool's sample, as in the preview.
      expect(calls[0]?.job.params.photo).toBeNull();
    });
  }

  it("returns null when the effect worker fails", async () => {
    const effect = tool("halftone");
    const { client } = fakeEffect(new RasterEffectError("render-failed"));
    expect(
      await createDesignThumbnail(
        effect,
        effect.defaults,
        1,
        { width: 500, height: 500 },
        {
          effectClient: client,
        },
      ),
    ).toBeNull();
  });

  // ASCII art is an SVG tool: its grid (demo picture without a photo) is a param.
  it.each(["blob", "ascii-art"])("keeps SVG tools on the SVG path (%s)", async (id) => {
    const blobTool = tool(id);
    const svgs: string[] = [];
    const shaderFake = fakeShader();
    const effectFake = fakeEffect();
    const env = {
      workerSupported: () => false,
      stripsSupported: () => false,
      maxCanvasArea: () => 16_777_216,
      loadSvgImage(svg: string) {
        svgs.push(svg);
        return Promise.reject(new Error("no image decoder in Node"));
      },
    } as unknown as RasterEnv;
    const blob = await createDesignThumbnail(
      blobTool,
      blobTool.defaults,
      1,
      { width: 800, height: 400 },
      { env, shaderClient: shaderFake.client, effectClient: effectFake.client },
    );
    expect(blob).toBeNull();
    expect(svgs[0]).toMatch(/^<svg/);
    expect(shaderFake.calls).toHaveLength(0);
    expect(effectFake.calls).toHaveLength(0);
  });
});
