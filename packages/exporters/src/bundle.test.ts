import { createRenderContext, faviconGeneratorTool, blobTool } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { fakeEnv } from "./__fixtures__/raster-fakes";
import { bundleFiles, bundleSnippet, exportBundle, listBundles } from "./bundle";
import { readIco } from "./ico";
import { readZip } from "./zip";

const tool = faviconGeneratorTool;
const ctx = createRenderContext(7, { width: 512, height: 512 });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function entries(blob: Blob): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const r of readZip(new Uint8Array(await blob.arrayBuffer()))) {
    out.set(r.path, r.method === 8 ? await inflateRaw(r.data) : r.data);
  }
  return out;
}

/** The fake encoder writes the PNG signature, then `<width>x<height>`. */
const fakePngSize = (bytes: Uint8Array): string =>
  new TextDecoder().decode(bytes.subarray(PNG_SIGNATURE.length));

describe("listBundles", () => {
  it("lists the icon pack with its snippet, nothing for other tools", () => {
    expect(listBundles(tool)).toEqual([
      {
        id: "icon-pack",
        labelKey: "tools.favicon-generator.bundles.iconPack.label",
        descriptionKey: "tools.favicon-generator.bundles.iconPack.description",
        snippet: {
          labelKey: "tools.favicon-generator.bundles.iconPack.snippet",
          language: "html",
          mime: "text/html",
        },
      },
    ]);
    expect(listBundles(blobTool)).toEqual([]);
  });

  it("gives files and snippet without rendering, rejects unknown ids", () => {
    expect(bundleFiles(tool, "icon-pack", tool.defaults, ctx)).toHaveLength(8);
    expect(bundleSnippet(tool, "icon-pack", tool.defaults, ctx)).toContain("site.webmanifest");
    expect(() => bundleFiles(tool, "nope", tool.defaults, ctx)).toThrow(/no bundle/);
  });
});

describe("exportBundle", () => {
  it("renders every image through the tool, builds the icon and zips in the worker", async () => {
    const env = fakeEnv();
    const progress: number[] = [];
    const result = await exportBundle(
      tool,
      "icon-pack",
      { ...tool.defaults, darkMode: true },
      ctx,
      { onProgress: (f) => progress.push(f) },
      env,
    );
    expect(result.filename).toBe("musterli-favicon-generator-7-icon-pack.zip");
    expect(result.blob.type).toBe("application/zip");
    expect(result.paths).toEqual([
      "favicon.ico",
      "favicon.svg",
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "icon-512-maskable.png",
      "site.webmanifest",
      "head-snippet.html",
    ]);
    // Three icon images and four PNG files, each decoded at its own size.
    expect(env.loadedSvgs.map((svg) => /width="(\d+)"/.exec(svg)?.[1])).toEqual([
      "16",
      "32",
      "48",
      "180",
      "192",
      "512",
      "512",
    ]);
    expect(env.log.calls.at(-1)).toBe(`zip ${result.paths.join(",")}`);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));

    const files = await entries(result.blob);
    const ico = readIco(files.get("favicon.ico") ?? new Uint8Array());
    expect(ico.map((e) => [e.width, e.height])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ]);
    expect(ico.map((e) => fakePngSize(e.data))).toEqual(["16x16", "32x32", "48x48"]);
    expect(fakePngSize(files.get("apple-touch-icon.png") ?? new Uint8Array())).toBe("180x180");
    expect(fakePngSize(files.get("icon-512-maskable.png") ?? new Uint8Array())).toBe("512x512");
    const text = (path: string) => new TextDecoder().decode(files.get(path));
    expect(JSON.parse(text("site.webmanifest"))).toMatchObject({ display: "standalone" });
    expect(text("favicon.svg")).toContain("prefers-color-scheme:dark");
    expect(text("head-snippet.html")).toBe(
      bundleSnippet(tool, "icon-pack", { ...tool.defaults, darkMode: true }, ctx),
    );
  });

  it("renders the apple and maskable files opaque, the others in the standard variant", async () => {
    const env = fakeEnv();
    await exportBundle(
      tool,
      "icon-pack",
      {
        ...tool.defaults,
        backgroundType: "transparent",
        variant: "maskable",
        appBackground: "#abcdef",
      },
      ctx,
      {},
      env,
    );
    const fill = 'fill="#abcdef"';
    expect(env.loadedSvgs.map((svg) => svg.includes(fill))).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });

  it("builds the ZIP on the main thread without a worker", async () => {
    const env = fakeEnv({ worker: false });
    const result = await exportBundle(tool, "icon-pack", tool.defaults, ctx, {}, env);
    expect(env.log.calls.some((c) => c.startsWith("zip "))).toBe(false);
    expect((await entries(result.blob)).size).toBe(8);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportBundle(tool, "icon-pack", tool.defaults, ctx, { signal: controller.signal }, fakeEnv()),
    ).rejects.toMatchObject({ code: "aborted" });
  });
});
