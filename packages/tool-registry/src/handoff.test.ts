import { describe, expect, it } from "vitest";
import * as z from "zod";
import { PALETTE_MAX } from "./common";
import {
  brandPaletteOutput,
  findImageTarget,
  imageTargetsOf,
  isImageTargetParam,
  listImageTargets,
} from "./handoff";
import { defineTool } from "./registry";
import { registry } from "./index";
import type { AnyToolDefinition } from "./types";

const HEX = /^#[0-9a-f]{6}$/;

const tool = (id: string) => registry.get(id) as AnyToolDefinition;

/** The expected targets: every tool that takes a picture, with its slot. */
const EXPECTED = [
  "glass-effects:backgroundImage",
  "bento-grid:backgroundImage",
  "screenshot-beautifier:screenshot",
  "duotone:photo",
  "ascii-art:photo",
  "halftone:photo",
  "cmyk-halftone:photo",
  "dither:photo",
  "god-rays:photo",
  "fractal-glass:photo",
  "pixelate:photo",
  "og-image:backgroundImage",
  "palette-from-image:<image-input>",
];

const key = (toolId: string, slot: ReturnType<typeof imageTargetsOf>[number]) =>
  `${toolId}:${slot.kind === "param" ? slot.param : "<image-input>"}`;

describe("image targets", () => {
  it("derives the targets of the built-in tools", () => {
    const found = registry
      .list()
      .flatMap((t) => imageTargetsOf(t).map((slot) => key(t.id, slot)))
      .sort();
    expect(found).toEqual([...EXPECTED].sort());
  });

  it("only offers local image params, so a picture never reaches a share link", () => {
    for (const t of registry.list()) {
      for (const target of t.imageTargets ?? []) {
        expect(isImageTargetParam(t, target.param), `${t.id}.${target.param}`).toBe(true);
      }
      for (const slot of imageTargetsOf(t)) {
        if (slot.kind !== "param") continue;
        expect(t.localParams ?? [], t.id).toContain(slot.param);
      }
    }
  });

  it("derives the photo param of photo tools without a line in the definition", () => {
    expect(tool("halftone").imageTargets).toBeUndefined();
    expect(imageTargetsOf(tool("halftone"))).toEqual([
      { kind: "param", param: "photo", labelKey: "tools.halftone.params.photo.label" },
    ]);
  });

  it("drops declared params that are not local image params", () => {
    const fake = defineTool({
      ...tool("glass-effects"),
      id: "fake-glass",
      imageTargets: [{ param: "backgroundImage" }, { param: "blur" }, { param: "missing" }],
    } as AnyToolDefinition);
    expect(imageTargetsOf(fake).map((s) => (s.kind === "param" ? s.param : ""))).toEqual([
      "backgroundImage",
    ]);
    const notLocal = defineTool({
      ...tool("glass-effects"),
      id: "fake-glass-2",
      localParams: [],
      imageTargets: [{ param: "backgroundImage" }],
    } as AnyToolDefinition);
    expect(imageTargetsOf(notLocal)).toEqual([]);
  });

  it("lists every target except the source tool itself", () => {
    const fromMesh = listImageTargets(registry.list(), "mesh-gradient");
    expect(fromMesh).toHaveLength(EXPECTED.length);
    const fromHalftone = listImageTargets(registry.list(), "halftone");
    expect(fromHalftone.map((e) => e.toolId)).not.toContain("halftone");
    expect(fromHalftone.map((e) => e.toolId)).toContain("duotone");
  });

  it("finds a slot by param or as the image picker", () => {
    expect(findImageTarget(tool("screenshot-beautifier"), "screenshot")?.kind).toBe("param");
    expect(findImageTarget(tool("screenshot-beautifier"), "url")).toBeUndefined();
    expect(findImageTarget(tool("palette-from-image"), null)?.kind).toBe("image-input");
    expect(findImageTarget(tool("mesh-gradient"), null)).toBeUndefined();
  });
});

const COLOUR_TOOLS = [
  "palette-generator",
  "tints-shades",
  "tailwind-palette",
  "palette-from-image",
  "contrast-checker",
];

describe("palette output", () => {
  it("is declared by exactly the colour tools", () => {
    const declared = registry
      .list()
      .filter((t) => t.paletteOutput)
      .map((t) => t.id);
    expect(declared.sort()).toEqual([...COLOUR_TOOLS].sort());
  });

  for (const id of COLOUR_TOOLS) {
    it(`${id}: defaults and every preset give 2 to 10 distinct hex colours`, () => {
      const t = tool(id);
      for (const params of [t.defaults, ...t.presets.map((p) => p.params)]) {
        const colors = brandPaletteOutput(t, params as Record<string, unknown>);
        expect(colors, id).not.toBeNull();
        expect(colors?.length).toBeGreaterThanOrEqual(2);
        expect(colors?.length).toBeLessThanOrEqual(PALETTE_MAX);
        expect(new Set(colors).size).toBe(colors?.length);
        for (const c of colors ?? []) expect(c).toMatch(HEX);
      }
    });
  }

  it("palette generator: exactly the shown colours", () => {
    const t = tool("palette-generator");
    const p = { ...t.defaults, count: 3 } as Record<string, unknown>;
    expect(brandPaletteOutput(t, p)).toEqual([p.color1, p.color2, p.color3]);
  });

  it("tailwind scale: 11 steps become 10, lightest and darkest kept", () => {
    const t = tool("tailwind-palette");
    const all = t.paletteOutput?.(t.defaults as never) ?? [];
    expect(all).toHaveLength(11);
    const out = brandPaletteOutput(t, t.defaults as Record<string, unknown>) ?? [];
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(all[0]?.toLowerCase());
    expect(out[9]).toBe(all[10]?.toLowerCase());
  });

  it("contrast checker: text and background, plus the pairs when shown", () => {
    const t = tool("contrast-checker");
    const base = t.defaults as Record<string, unknown>;
    expect(brandPaletteOutput(t, { ...base, pairs: false })).toEqual([
      base.foreground,
      base.background,
    ]);
    expect(brandPaletteOutput(t, { ...base, pairs: true })?.length).toBeGreaterThan(2);
  });

  it("normalises, drops repeats and refuses fewer than two colours", () => {
    const make = (colors: readonly string[]) =>
      ({
        ...tool("palette-generator"),
        id: "fake",
        schema: z.object({}),
        paletteOutput: () => colors,
      }) as unknown as AnyToolDefinition;
    expect(brandPaletteOutput(make(["#ABC", "#aabbcc", "#123456", "nope"]), {})).toEqual([
      "#aabbcc",
      "#123456",
    ]);
    expect(brandPaletteOutput(make(["#ffffff", "#FFFFFF"]), {})).toBeNull();
    const throwing = {
      ...make([]),
      paletteOutput: () => {
        throw new Error("x");
      },
    };
    expect(brandPaletteOutput(throwing as AnyToolDefinition, {})).toBeNull();
    expect(brandPaletteOutput(tool("mesh-gradient"), {})).toBeNull();
  });
});
