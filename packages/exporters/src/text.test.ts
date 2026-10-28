import {
  blobTool,
  builtInTools,
  createRenderContext,
  cssGradientTool,
  defineTool,
  polkaDotsTool,
  svgWavesTool,
  type AnyToolDefinition,
} from "@motivo/tool-registry";
import { checkSvg } from "@motivo/tool-registry/testing";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { ExportError } from "./errors";
import {
  exportCss,
  exportExtra,
  exportSvg,
  freshContext,
  listExtraExports,
  renderDesignSvg,
  supportsExport,
  svgBlob,
  svgToDataUri,
  textBlob,
} from "./text";

const size = { width: 320, height: 240 };
const ctx = (seed = 1) => createRenderContext(seed, size);

const textTool = defineTool({
  id: "text-tool",
  version: 1,
  category: ["converters"],
  schema: z.object({ value: z.string() }),
  defaults: { value: "a" },
  presets: [],
  randomize: (_rng, current) => current,
  render: { kind: "text", render: (p) => p.value },
  exports: ["css", "svg"],
});

describe("freshContext", () => {
  it("copies seed, size and t with a new rng", () => {
    const a = createRenderContext(9, size, 0.25);
    a.rng.next();
    const b = freshContext(a);
    expect(b).toMatchObject({ seed: 9, width: 320, height: 240, t: 0.25 });
    expect(b.rng.next()).toBe(createRenderContext(9, size).rng.next());
  });
});

describe("supportsExport", () => {
  it("needs the format declared and a render kind that can produce it", () => {
    expect(supportsExport(blobTool, "svg")).toBe(true);
    expect(supportsExport(cssGradientTool, "css")).toBe(true);
    expect(supportsExport(blobTool, "gif")).toBe(false);
    expect(supportsExport(textTool, "svg")).toBe(false);
  });
});

describe.each(builtInTools.map((t) => [t.id, t] as const))("%s", (_, tool: AnyToolDefinition) => {
  it("exports well-formed SVG equal to the preview render", () => {
    const svg = exportSvg(tool, tool.defaults, ctx());
    expect(checkSvg(svg)).toEqual([]);
    expect(svg).toBe(renderDesignSvg(tool, tool.defaults, ctx()));
    expect(svg).toContain('width="320" height="240"');
  });

  // Colour tools offer code via extra exports instead of an SVG background.
  it.runIf(supportsExport(tool, "css"))("exports CSS declarations", () => {
    const css = exportCss(tool, tool.defaults, ctx());
    expect(css).toMatch(/background-image: /);
    expect(css).not.toMatch(/\b(?:NaN|undefined)\b/);
  });

  it("is unaffected by an rng the caller already consumed", () => {
    const used = ctx(5);
    for (let i = 0; i < 10; i++) used.rng.next();
    expect(exportSvg(tool, tool.defaults, used)).toBe(exportSvg(tool, tool.defaults, ctx(5)));
  });
});

describe("exportSvg", () => {
  it("returns the CSS tool's preview SVG", () => {
    const render = cssGradientTool.render;
    if (render.kind !== "css") throw new Error("expected css tool");
    const preview = render.render(cssGradientTool.defaults, ctx()).previewSvg;
    expect(exportSvg(cssGradientTool, cssGradientTool.defaults, ctx())).toBe(preview);
  });

  it("rejects tools that cannot produce SVG", () => {
    expect(() => exportSvg(textTool, { value: "x" }, ctx())).toThrow(ExportError);
    try {
      exportSvg(textTool, { value: "x" }, ctx());
    } catch (error) {
      expect((error as ExportError).code).toBe("unsupported-format");
    }
  });
});

describe("exportCss", () => {
  it("returns native CSS for CSS tools", () => {
    const css = exportCss(cssGradientTool, cssGradientTool.defaults, ctx());
    expect(css.split("\n")[0]).toBe("background-color: #ff7e5f;");
    expect(css).toContain("linear-gradient(135deg in oklch,");
  });

  it("embeds SVG tools as a background data URI", () => {
    const css = exportCss(svgWavesTool, svgWavesTool.defaults, ctx());
    const lines = css.split("\n");
    expect(lines[0]).toMatch(
      /^background-image: url\("data:image\/svg\+xml,%3Csvg xmlns='http:\/\/www\.w3\.org\/2000\/svg'/,
    );
    expect(lines.slice(1)).toEqual([
      "background-size: cover;",
      "background-position: center;",
      "background-repeat: no-repeat;",
    ]);
  });

  it("rejects unsupported tools", () => {
    expect(() => exportCss(textTool, { value: "x" }, ctx())).toThrow(/cannot export css/);
  });
});

describe("svgToDataUri", () => {
  it("swaps quotes and encodes unsafe characters", () => {
    expect(svgToDataUri('<svg a="#1"><t>100% é</t></svg>')).toBe(
      "data:image/svg+xml,%3Csvg a='%231'%3E%3Ct%3E100%25 %C3%A9%3C/t%3E%3C/svg%3E",
    );
  });

  it("keeps single quotes and encodes double quotes when the SVG has both", () => {
    expect(svgToDataUri(`<svg a="it's"/>`)).toBe("data:image/svg+xml,%3Csvg a=%22it's%22/%3E");
  });

  it("encodes newlines, backslashes and lone surrogates", () => {
    expect(svgToDataUri("<svg>\n\\\ud800</svg>")).toBe(
      "data:image/svg+xml,%3Csvg%3E%0A%5C%EF%BF%BD%3C/svg%3E",
    );
  });

  it("round-trips through decodeURIComponent", () => {
    const svg = exportSvg(polkaDotsTool, polkaDotsTool.defaults, ctx());
    const uri = svgToDataUri(svg);
    expect(uri).not.toMatch(/["#<>\s]{2}|"|#/);
    expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(
      svg.replace(/"/g, "'"),
    );
  });
});

describe("extra exports", () => {
  it("lists extras with file metadata", () => {
    expect(listExtraExports(cssGradientTool)).toEqual([
      {
        id: "tailwind",
        labelKey: "Editor.export.extras.tailwind",
        language: "html",
        mime: "text/html",
        extension: "html",
      },
    ]);
    expect(listExtraExports(blobTool).map((e) => [e.id, e.extension])).toEqual([
      ["clip-path", "css"],
    ]);
    expect(listExtraExports(polkaDotsTool)).toEqual([]);
  });

  it("renders Tailwind for css-gradient and clip-path for blob", () => {
    expect(exportExtra(cssGradientTool, "tailwind", cssGradientTool.defaults, ctx())).toMatch(
      /^bg-\[#ff7e5f\] bg-\[linear-gradient\(/,
    );
    const used = ctx(3);
    used.rng.next();
    const clip = exportExtra(blobTool, "clip-path", blobTool.defaults, used);
    const d = /<path d="([^"]+)"/.exec(exportSvg(blobTool, blobTool.defaults, ctx(3)))?.[1];
    expect(clip).toContain(`clip-path: path("${d ?? "?"}");`);
  });

  it("rejects unknown ids", () => {
    expect(() => exportExtra(blobTool, "tailwind", blobTool.defaults, ctx())).toThrow(
      expect.objectContaining({ code: "unknown-extra" }),
    );
  });
});

describe("blob helpers", () => {
  it("creates typed blobs", async () => {
    const svg = svgBlob("<svg/>");
    expect(svg.type).toBe("image/svg+xml");
    expect(await svg.text()).toBe("<svg/>");
    expect(textBlob("a{}", "text/css").type).toBe("text/css;charset=utf-8");
    expect(textBlob("{}", "application/json").type).toBe("application/json");
  });
});
