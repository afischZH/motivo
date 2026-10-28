import { SHAPE_IDS, SHAPE_PACK_IDS, createRng, shapePath, tileShapeIds } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import {
  SHAPE_OPTION_LABEL_KEYS,
  shapeLabelKey,
  shapePackGroups,
  shapePackLabelKey,
  shapePreview,
} from "./shapes";
import { checkSvg, renderStatic } from "./testing";
import { seamlessPatternsTool } from "./tools/seamless-patterns";

describe("shape control helpers", () => {
  it("labels every shape and pack", () => {
    expect(Object.keys(SHAPE_OPTION_LABEL_KEYS)).toEqual(SHAPE_IDS);
    expect(shapeLabelKey("heart")).toBe("Shapes.names.heart");
    expect(shapePackLabelKey("tiles")).toBe("Shapes.packs.tiles");
  });

  it("groups all shapes by pack, or only the given ones", () => {
    const groups = shapePackGroups();
    expect(groups.map((g) => g.id)).toEqual(SHAPE_PACK_IDS);
    expect(groups.flatMap((g) => g.values)).toEqual(SHAPE_IDS);
    const tiles = shapePackGroups(tileShapeIds());
    expect(tiles.map((g) => g.id)).toEqual(["tiles"]);
  });

  it("previews a shape as safe SVG, accent at half opacity", () => {
    const { svg } = shapePreview("cube", "#123456", "transparent");
    expect(svg).not.toContain("<rect");
    expect(svg).toContain('fill-opacity=".5"');
    const plain = shapePreview("circle", '#fff"/><script>', "#000");
    expect(plain.svg).not.toContain("<script");
    expect(plain.svg).toContain(`d="${shapePath("circle")}"`);
    expect(shapePreview("nope", "#000", "#fff").svg).toBe(
      shapePreview("circle", "#000", "#fff").svg,
    );
  });
});

describe("Seamless Patterns with the shape library", () => {
  it.each(SHAPE_IDS)("renders %s (seed 1)", (shape) => {
    const out = renderStatic(seamlessPatternsTool, { ...seamlessPatternsTool.defaults, shape }, 1, {
      width: 240,
      height: 160,
    });
    expect(typeof out).toBe("string");
    const svg = typeof out === "string" ? out : "";
    expect(checkSvg(svg)).toEqual([]);
    expect(svg).toContain(`d="${shapePath(shape)}"`);
  });

  it("lets the space bar pick any shape except tile shapes", () => {
    const tiles = new Set<string>(tileShapeIds());
    const seen = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const p = seamlessPatternsTool.randomize(
        createRng(seed),
        seamlessPatternsTool.defaults,
        new Set(),
      );
      expect(tiles.has(p.shape)).toBe(false);
      seen.add(p.shape);
    }
    expect(seen.size).toBeGreaterThan(80);
  });

  it("offers the packs in the picker and Brand Kit shapes through the upload param", () => {
    const hint = seamlessPatternsTool.controls?.params?.shape;
    expect(hint?.optionGroups?.map((g) => g.id)).toEqual(SHAPE_PACK_IDS);
    expect(hint?.brandShapesParam).toBe("upload");
    expect(seamlessPatternsTool.controls?.params?.upload?.kind).toBe("image");
  });
});
