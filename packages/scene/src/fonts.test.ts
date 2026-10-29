import { describe, expect, it } from "vitest";
import { createTextLayer } from "./factory";
import {
  LIBRARY_FONTS,
  SYSTEM_FONT_STACKS,
  brandFamilyName,
  fontFamilyFor,
  fontRefSchema,
  libraryFont,
  libraryFontRef,
  nearestWeight,
  systemFontOf,
} from "./fonts";
import { sceneFormat } from "./formats";
import { textLayerSchema } from "./schema";
import { gradientLine, highlightRects, textBlockTop } from "./text-effects";

describe("font catalogue", () => {
  it("has unique ids, names and sorted weights", () => {
    expect(LIBRARY_FONTS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(LIBRARY_FONTS.map((f) => f.id)).size).toBe(LIBRARY_FONTS.length);
    expect(new Set(LIBRARY_FONTS.map((f) => f.name)).size).toBe(LIBRARY_FONTS.length);
    for (const font of LIBRARY_FONTS) {
      expect(font.weights.length, font.id).toBeGreaterThan(0);
      expect([...font.weights].sort((a, b) => a - b)).toEqual(font.weights);
      expect(fontRefSchema.safeParse(libraryFontRef(font.id)).success, font.id).toBe(true);
    }
    // Every category of the picker has at least one font.
    for (const category of ["sans", "serif", "display", "mono", "handwriting"]) {
      expect(
        LIBRARY_FONTS.some((f) => f.category === category),
        category,
      ).toBe(true);
    }
  });

  it("builds family lists with internal names and a fallback", () => {
    expect(fontFamilyFor(libraryFontRef("inter"))).toBe(
      `musterli-inter, ${SYSTEM_FONT_STACKS.sans}`,
    );
    expect(fontFamilyFor(libraryFontRef("fraunces"))).toBe(
      `musterli-fraunces, ${SYSTEM_FONT_STACKS.serif}`,
    );
    expect(fontFamilyFor({ kind: "brand", id: "abc123", name: "Hausschrift" })).toBe(
      `${brandFamilyName("abc123")}, ${SYSTEM_FONT_STACKS.sans}`,
    );
    expect(libraryFont("nope")).toBeUndefined();
    expect(systemFontOf(SYSTEM_FONT_STACKS.mono)).toBe("mono");
    expect(systemFontOf("musterli-inter, sans-serif")).toBeNull();
  });

  it("rejects odd references", () => {
    expect(fontRefSchema.safeParse({ kind: "library", id: "Inter Bold", name: "x" }).success).toBe(
      false,
    );
    expect(fontRefSchema.safeParse({ kind: "brand", id: "a b", name: "x" }).success).toBe(false);
    expect(fontRefSchema.safeParse({ kind: "google", id: "inter", name: "x" }).success).toBe(false);
    expect(fontRefSchema.safeParse({ kind: "brand", id: "a", name: "x".repeat(121) }).success).toBe(
      false,
    );
  });

  it("matches weights like CSS", () => {
    expect(nearestWeight([400, 700], 700)).toBe(700);
    expect(nearestWeight([400, 700], 500)).toBe(400);
    expect(nearestWeight([400, 700], 600)).toBe(700);
    expect(nearestWeight([400, 700], 900)).toBe(700);
    expect(nearestWeight([400, 700], 300)).toBe(400);
    expect(nearestWeight([400], 900)).toBe(400);
    expect(nearestWeight([400, 500], 450)).toBe(500);
    expect(nearestWeight([], 600)).toBe(600);
  });

  it("gives new text layers the default library font; old layers stay valid", () => {
    const layer = createTextLayer("t", sceneFormat("square"), "Hallo");
    expect(layer.font).toEqual({ kind: "library", id: "inter", name: "Inter" });
    expect(layer.fontFamily.startsWith("musterli-inter, ")).toBe(true);
    const old = { ...layer };
    delete old.font;
    expect(textLayerSchema.safeParse({ ...old, fontFamily: SYSTEM_FONT_STACKS.sans }).success).toBe(
      true,
    );
  });
});

describe("text effect geometry", () => {
  const layer = {
    align: "left" as const,
    valign: "top" as const,
    fontSize: 100,
    lineHeight: 1.2,
    width: 1000,
    height: 400,
  };

  it("places the text block like the renderer", () => {
    expect(textBlockTop("top", 400, 2, 120)).toBe(0);
    expect(textBlockTop("middle", 400, 2, 120)).toBe(80);
    expect(textBlockTop("bottom", 400, 2, 120)).toBe(160);
  });

  it("puts one bar behind each line, aligned like the text", () => {
    const lines = [{ width: 500 }, { width: 0 }, { width: 300 }];
    expect(highlightRects(lines, layer, 20)).toEqual([
      { x: -20, y: 0, width: 540, height: 120 },
      { x: -20, y: 240, width: 340, height: 120 },
    ]);
    const centred = highlightRects([{ width: 500 }], { ...layer, align: "center" }, 0);
    expect(centred).toEqual([{ x: 250, y: 10, width: 500, height: 100 }]);
    const right = highlightRects(
      [{ width: 500 }],
      { ...layer, align: "right", valign: "bottom" },
      10,
    );
    expect(right).toEqual([{ x: 490, y: 400 - 120 + 10 - 5, width: 520, height: 110 }]);
  });

  it("runs the gradient like CSS linear-gradient", () => {
    expect(gradientLine(90, 200, 100)).toEqual({ start: { x: 0, y: 50 }, end: { x: 200, y: 50 } });
    expect(gradientLine(180, 200, 100)).toEqual({
      start: { x: 100, y: 0 },
      end: { x: 100, y: 100 },
    });
    expect(gradientLine(0, 200, 100)).toEqual({ start: { x: 100, y: 100 }, end: { x: 100, y: 0 } });
    expect(gradientLine(-270, 200, 100)).toEqual(gradientLine(90, 200, 100));
    // 45°: the corners get the end colours exactly (the line spans the box diagonal projection).
    const diagonal = gradientLine(45, 100, 100);
    expect(diagonal.start.x).toBeCloseTo(0);
    expect(diagonal.start.y).toBeCloseTo(100);
    expect(diagonal.end.x).toBeCloseTo(100);
    expect(diagonal.end.y).toBeCloseTo(0);
  });
});
