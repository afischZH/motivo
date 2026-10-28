import { ExportError, type ExportErrorCode } from "@musterli/exporters";
import { registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import { fixtureTool } from "../test/fixture-tool";
import {
  clipboardErrorKey,
  defaultGifSettings,
  defaultJpgBackground,
  exportErrorKey,
  formatBytes,
  gifSourceLabelKey,
  listExportChoices,
  pickInitialChoice,
  planGifExport,
  planRasterSize,
  sameAspect,
  utf8Bytes,
} from "./export-model";

const ids = (toolId: string) => {
  const tool = registry.get(toolId);
  if (!tool) throw new Error(toolId);
  return listExportChoices(tool).map((c) => c.id);
};

describe("listExportChoices", () => {
  it("lists raster, vector, CSS and extra exports of SVG tools in display order", () => {
    expect(ids("blob")).toEqual(["png", "jpg", "webp", "svg", "css", "extra:clip-path", "gif"]);
    expect(ids("polka-dots")).toEqual(["png", "jpg", "webp", "svg", "css", "gif"]);
    expect(ids("svg-waves")).toEqual(["png", "jpg", "webp", "svg", "css", "gif"]);
    // No animation opt-in: no GIF.
    expect(ids("grid-patterns")).toEqual(["png", "jpg", "webp", "svg", "css"]);
  });

  it("lists the Tailwind extra for the CSS gradient", () => {
    expect(ids("css-gradient")).toEqual([
      "png",
      "jpg",
      "webp",
      "svg",
      "css",
      "extra:tailwind",
      "gif",
    ]);
  });

  it("only offers what the tool declares", () => {
    expect(listExportChoices(fixtureTool as never).map((c) => c.id)).toEqual(["svg"]);
  });

  it("groups formats into image, vector, code and animation", () => {
    const tool = registry.get("blob");
    if (!tool) throw new Error("blob");
    const categories = Object.fromEntries(listExportChoices(tool).map((c) => [c.id, c.category]));
    expect(categories).toEqual({
      png: "image",
      jpg: "image",
      webp: "image",
      svg: "vector",
      css: "code",
      "extra:clip-path": "code",
      gif: "animation",
    });
  });
});

describe("pickInitialChoice", () => {
  const tool = registry.get("blob");
  if (!tool) throw new Error("blob");
  const choices = listExportChoices(tool);

  it("uses the remembered format when offered", () => {
    expect(pickInitialChoice(choices, "svg")?.id).toBe("svg");
  });

  it("falls back to the first format", () => {
    expect(pickInitialChoice(choices, "extra:tailwind")?.id).toBe("png");
    expect(pickInitialChoice(choices, null)?.id).toBe("png");
    expect(pickInitialChoice([], "png")).toBeUndefined();
  });
});

describe("planRasterSize", () => {
  const design = { width: 1080, height: 1350 };

  it("scales the design size", () => {
    expect(planRasterSize(design, { kind: "scale", scale: 1 })).toEqual({
      render: design,
      output: design,
      recomposed: false,
      clamped: false,
    });
    expect(planRasterSize(design, { kind: "scale", scale: 4 }).output).toEqual({
      width: 4320,
      height: 5400,
    });
  });

  it("clamps to the largest edge", () => {
    const plan = planRasterSize({ width: 3840, height: 2160 }, { kind: "scale", scale: 4 });
    expect(plan.output).toEqual({ width: 8192, height: 4608 });
    expect(plan.clamped).toBe(true);
    expect(plan.render).toEqual({ width: 3840, height: 2160 });
  });

  it("scales the vector for a custom size with the same aspect ratio", () => {
    const plan = planRasterSize(design, { kind: "custom", width: 2160, height: 2700 });
    expect(plan).toEqual({
      render: design,
      output: { width: 2160, height: 2700 },
      recomposed: false,
      clamped: false,
    });
  });

  it("tolerates one pixel of rounding in the aspect ratio", () => {
    const plan = planRasterSize(
      { width: 1000, height: 333 },
      { kind: "custom", width: 500, height: 167 },
    );
    expect(plan.recomposed).toBe(false);
  });

  it("re-renders at a custom size with another aspect ratio instead of letterboxing", () => {
    const plan = planRasterSize(design, { kind: "custom", width: 1920, height: 1080 });
    expect(plan).toEqual({
      render: { width: 1920, height: 1080 },
      output: { width: 1920, height: 1080 },
      recomposed: true,
      clamped: false,
    });
  });

  it("clamps recomposed sizes too", () => {
    const plan = planRasterSize(design, { kind: "custom", width: 8192, height: 100 }, 4096);
    expect(plan.output).toEqual({ width: 4096, height: 50 });
    expect(plan.render).toEqual(plan.output);
    expect(plan.clamped).toBe(true);
  });
});

describe("sameAspect", () => {
  it("compares aspect ratios up to rounding", () => {
    expect(sameAspect({ width: 1920, height: 1080 }, 1280, 720)).toBe(true);
    expect(sameAspect({ width: 1920, height: 1080 }, 1080, 1080)).toBe(false);
  });
});

describe("GIF settings", () => {
  it("start with the tool's first source, 12 frames, 100 ms, a loop and 640 px", () => {
    const blob = registry.get("blob");
    const css = registry.get("css-patterns");
    if (!blob || !css) throw new Error("tools");
    expect(defaultGifSettings(blob)).toEqual({
      source: "seeds",
      frames: 12,
      delay: 100,
      loop: true,
      edge: 640,
    });
    expect(defaultGifSettings(css).source).toBe("colors");
    expect(gifSourceLabelKey(blob, "colors")).toBe("Editor.export.gif.sources.colors");
  });

  it("plans size and budget from the design", () => {
    const blob = registry.get("blob");
    if (!blob) throw new Error("blob");
    const plan = planGifExport(
      { width: 1920, height: 1080 },
      { ...defaultGifSettings(blob), edge: 1024, frames: 60 },
    );
    expect(plan).toMatchObject({ width: 1024, height: 576, frames: 60, overBudget: true });
  });
});

describe("error keys", () => {
  it("maps every export error code", () => {
    const cases: [ExportErrorCode, string][] = [
      ["unsupported-format", "unsupportedFormat"],
      ["unknown-extra", "unsupportedFormat"],
      ["decode-failed", "decodeFailed"],
      ["encode-unsupported", "encodeUnsupported"],
      ["encode-failed", "encodeFailed"],
      ["too-large", "tooLarge"],
      ["unavailable", "unavailable"],
      ["budget-exceeded", "gifBudget"],
      ["aborted", "aborted"],
    ];
    for (const [code, key] of cases) {
      expect(exportErrorKey(new ExportError(code, "x"))).toBe(key);
    }
    expect(exportErrorKey(new Error("boom"))).toBe("unknown");
  });

  it("maps clipboard results", () => {
    expect(clipboardErrorKey({ ok: true })).toBeNull();
    expect(clipboardErrorKey({ ok: false, reason: "denied" })).toBe("denied");
  });
});

describe("helpers", () => {
  it("uses the design background under JPG, white for transparent", () => {
    expect(defaultJpgBackground("#FF0000")).toBe("#ff0000");
    expect(defaultJpgBackground("transparent")).toBe("#ffffff");
    expect(defaultJpgBackground(undefined)).toBe("#ffffff");
  });

  it("formats byte counts", () => {
    expect(formatBytes(999)).toEqual({ value: "999", unit: "B" });
    expect(formatBytes(1500)).toEqual({ value: "1.5", unit: "KB" });
    expect(formatBytes(2_340_000)).toEqual({ value: "2.3", unit: "MB" });
    expect(utf8Bytes("ä")).toBe(2);
  });
});
