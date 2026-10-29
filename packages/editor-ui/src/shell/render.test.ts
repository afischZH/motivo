import { cssGradientTool, polkaDotsTool } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { fixtureTool } from "../test/fixture-tool";
import { fitScale } from "./preview";
import {
  cssToStyle,
  motifDataUrl,
  parseCssDeclarations,
  peekMotif,
  renderMotif,
  renderMotifCached,
  svgDataUrl,
  toReactStyleProperty,
} from "./render";

describe("renderMotif", () => {
  it("renders SVG tools through tool.render with the given size", () => {
    const out = renderMotif(fixtureTool, fixtureTool.defaults, 1, { width: 300, height: 200 });
    expect(out.kind).toBe("svg");
    if (out.kind === "svg") expect(out.svg).toContain('width="300" height="200"');
  });

  it("is deterministic for the same design", () => {
    const size = { width: 400, height: 400 };
    const a = renderMotif(polkaDotsTool, polkaDotsTool.defaults, 7, size);
    const b = renderMotif(polkaDotsTool, polkaDotsTool.defaults, 7, size);
    expect(a).toEqual(b);
  });

  it("parses CSS tools into declarations", () => {
    const out = renderMotif(cssGradientTool, cssGradientTool.defaults, 1, {
      width: 100,
      height: 100,
    });
    expect(out.kind).toBe("css");
    if (out.kind !== "css") return;
    const props = out.declarations.map(([p]) => p);
    expect(props).toContain("background-image");
  });

  it("names WebGL designs for the shader worker", () => {
    const tool = { ...fixtureTool, render: { kind: "webgl", fragment: "", uniforms: () => ({}) } };
    const params = fixtureTool.defaults;
    const out = renderMotif(tool as never, params, 3, { width: 10, height: 10 });
    expect(out).toEqual({ kind: "shader", tool, params, seed: 3, size: { width: 10, height: 10 } });
  });

  it("reports render kinds without a preview", () => {
    const tool = { ...fixtureTool, render: { kind: "future" } };
    const out = renderMotif(tool as never, fixtureTool.defaults, 1, { width: 10, height: 10 });
    expect(out).toEqual({ kind: "unsupported", renderKind: "future" });
  });
});

describe("renderMotifCached", () => {
  const size = { width: 120, height: 80 };

  it("renders once per params object, seed and size", () => {
    const params = { ...polkaDotsTool.defaults };
    expect(peekMotif(polkaDotsTool as never, params, 1, size)).toBeUndefined();
    const a = renderMotifCached(polkaDotsTool as never, params, 1, size);
    expect(a).toEqual(renderMotif(polkaDotsTool as never, params, 1, size));
    expect(renderMotifCached(polkaDotsTool as never, params, 1, size)).toBe(a);
    expect(peekMotif(polkaDotsTool as never, params, 1, size)).toBe(a);
  });

  it("misses for another seed, size or params object", () => {
    const params = { ...polkaDotsTool.defaults };
    const a = renderMotifCached(polkaDotsTool as never, params, 1, size);
    expect(renderMotifCached(polkaDotsTool as never, params, 2, size)).not.toBe(a);
    expect(peekMotif(polkaDotsTool as never, params, 1, { width: 80, height: 80 })).toBeUndefined();
    expect(peekMotif(polkaDotsTool as never, { ...params }, 1, size)).toBeUndefined();
  });

  it("computes the data URL once per output", () => {
    const out = renderMotifCached(polkaDotsTool as never, { ...polkaDotsTool.defaults }, 1, size);
    if (out.kind !== "svg") throw new Error("expected svg");
    expect(motifDataUrl(out)).toBe(svgDataUrl(out.svg));
    expect(motifDataUrl(out)).toBe(motifDataUrl(out));
  });
});

describe("svgDataUrl", () => {
  it("percent-encodes the markup", () => {
    const url = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0#"/></svg>');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(url).not.toMatch(/[<>"#\s]/);
  });
});

describe("parseCssDeclarations", () => {
  it("stays linear for many escapes and an unterminated quote (M4b-AP05)", () => {
    // Searching the closing quote again per character made both quadratic
    // (about 1e11 steps for 400 KB of escapes).
    const escapes = "\\a".repeat(200_000);
    const css = `content: "${escapes}";\ncolor: red;\nbackground: url("x;y");`;
    const start = performance.now();
    const decls = parseCssDeclarations(css);
    const open = parseCssDeclarations(`content: "${"a".repeat(400_000)};\ncolor: red`);
    expect(performance.now() - start).toBeLessThan(500);
    expect(decls.map(([p]) => p)).toEqual(["content", "color", "background"]);
    expect(decls[2]?.[1]).toEqual(['url("x;y")']);
    // An unterminated quote swallows the rest, as in CSS.
    expect(open.map(([p]) => p)).toEqual(["content"]);
  });

  it("skips escaped quotes inside a value", () => {
    expect(parseCssDeclarations('content: "a\\";b"; color: red')).toEqual([
      ["content", ['"a\\";b"']],
      ["color", ["red"]],
    ]);
  });

  it("groups repeated properties in source order", () => {
    const css = "background-color: #fff;\nbackground-image: a;\nbackground-image: b;";
    expect(parseCssDeclarations(css)).toEqual([
      ["background-color", ["#fff"]],
      ["background-image", ["a", "b"]],
    ]);
  });

  it("does not split inside parentheses or quotes", () => {
    const css = `background: url("data:image/svg+xml;utf8,<svg/>") center; mask: url(a;b); content: 'x;y'`;
    expect(parseCssDeclarations(css)).toEqual([
      ["background", [`url("data:image/svg+xml;utf8,<svg/>") center`]],
      ["mask", ["url(a;b)"]],
      ["content", ["'x;y'"]],
    ]);
  });

  it("skips empty and malformed declarations", () => {
    expect(parseCssDeclarations(";; color: red ;: x; nocolon; width:")).toEqual([
      ["color", ["red"]],
    ]);
  });
});

describe("cssToStyle", () => {
  const decls = parseCssDeclarations(
    "background-color: red; background-image: old; background-image: new; --tile: 4px; -webkit-mask-image: m",
  );

  it("uses the fallback without a supports check (server render)", () => {
    expect(cssToStyle(decls)).toEqual({
      backgroundColor: "red",
      backgroundImage: "old",
      "--tile": "4px",
      WebkitMaskImage: "m",
    });
  });

  it("uses the last supported value, like a stylesheet", () => {
    expect(cssToStyle(decls, () => true).backgroundImage).toBe("new");
    expect(cssToStyle(decls, (_, v) => v !== "new").backgroundImage).toBe("old");
  });

  it("maps property names to React style keys", () => {
    expect(toReactStyleProperty("background-image")).toBe("backgroundImage");
    expect(toReactStyleProperty("-webkit-mask")).toBe("WebkitMask");
    expect(toReactStyleProperty("--x-y")).toBe("--x-y");
  });
});

describe("fitScale", () => {
  it("fits the design inside the stage with padding and never upscales", () => {
    expect(fitScale({ width: 1000, height: 500 }, { width: 584, height: 1000 })).toBeCloseTo(0.5);
    expect(fitScale({ width: 100, height: 100 }, { width: 2000, height: 2000 })).toBe(1);
  });
});
