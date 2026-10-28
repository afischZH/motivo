import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
  backgroundSchema,
  CANVAS_EDGE_MAX,
  CANVAS_EDGE_MIN,
  canvasSizeSchema,
  colorSchema,
  controlKindRegistry,
  DEFAULT_CANVAS_SIZE,
  paletteSchema,
  seedSchema,
  SIZE_PRESETS,
  SIZE_PRESET_GROUPS,
  visualParamsSchema,
  visualParamsShape,
} from "./common";

describe("colorSchema", () => {
  it.each(["#fff", "#FFF", "#1e90ff", "#1E90FF", "#000000"])("accepts %s", (c) => {
    expect(colorSchema.safeParse(c).success).toBe(true);
  });

  it.each([
    "fff",
    "#ff",
    "#ffff",
    "#12345",
    "#1234567",
    "#1e90ff80",
    "#ggg",
    "red",
    "",
    " #fff",
    "rgb(0,0,0)",
  ])("rejects %j", (c) => {
    expect(colorSchema.safeParse(c).success).toBe(false);
  });
});

describe("paletteSchema", () => {
  const colors = (n: number) => Array.from({ length: n }, () => "#abcdef");

  it("accepts 2 to 10 colours", () => {
    expect(paletteSchema.safeParse(colors(2)).success).toBe(true);
    expect(paletteSchema.safeParse(colors(10)).success).toBe(true);
  });

  it("rejects fewer than 2, more than 10 or invalid colours", () => {
    expect(paletteSchema.safeParse(colors(1)).success).toBe(false);
    expect(paletteSchema.safeParse(colors(11)).success).toBe(false);
    expect(paletteSchema.safeParse(["#fff", "blue"]).success).toBe(false);
  });
});

describe("backgroundSchema", () => {
  it("accepts a colour or transparent", () => {
    expect(backgroundSchema.parse("transparent")).toBe("transparent");
    expect(backgroundSchema.parse("#123")).toBe("#123");
  });

  it("rejects other strings", () => {
    expect(backgroundSchema.safeParse("none").success).toBe(false);
    expect(backgroundSchema.safeParse("Transparent").success).toBe(false);
  });
});

describe("canvasSizeSchema", () => {
  it("accepts integer edges within bounds", () => {
    expect(canvasSizeSchema.parse(DEFAULT_CANVAS_SIZE)).toEqual(DEFAULT_CANVAS_SIZE);
    expect(
      canvasSizeSchema.safeParse({ width: CANVAS_EDGE_MIN, height: CANVAS_EDGE_MAX }).success,
    ).toBe(true);
  });

  it("rejects out-of-range or fractional edges", () => {
    expect(canvasSizeSchema.safeParse({ width: CANVAS_EDGE_MIN - 1, height: 100 }).success).toBe(
      false,
    );
    expect(canvasSizeSchema.safeParse({ width: 100, height: CANVAS_EDGE_MAX + 1 }).success).toBe(
      false,
    );
    expect(canvasSizeSchema.safeParse({ width: 100.5, height: 100 }).success).toBe(false);
  });

  it("accepts every size preset", () => {
    for (const p of SIZE_PRESETS) {
      expect(canvasSizeSchema.safeParse(p).success, p.id).toBe(true);
      expect(Math.max(p.width, p.height), p.id).toBeLessThanOrEqual(CANVAS_EDGE_MAX);
      expect(p.id, p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.nameKey).toBe(`sizes.${p.id}`);
    }
    expect(new Set(SIZE_PRESETS.map((p) => p.id)).size).toBe(SIZE_PRESETS.length);
  });

  it("keeps the ids of the first size presets stable", () => {
    const ids = new Set(SIZE_PRESETS.map((p) => p.id));
    for (const id of [
      "square",
      "portrait",
      "story",
      "landscape",
      "banner",
      "full-hd",
      "qhd",
      "uhd-4k",
      "phone",
      "tablet",
      "a4-portrait",
      "a4-landscape",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(SIZE_PRESETS.find((p) => p.id === "a4-portrait")).toMatchObject({
      width: 2480,
      height: 3508,
    });
  });

  it("fills every group in order, without a size twice in one group", () => {
    const groups = SIZE_PRESETS.map((p) => p.group);
    expect([...new Set(groups)]).toEqual([...SIZE_PRESET_GROUPS]);
    for (const group of SIZE_PRESET_GROUPS) {
      const sizes = SIZE_PRESETS.filter((p) => p.group === group).map(
        (p) => `${p.width}x${p.height}`,
      );
      expect(new Set(sizes).size, group).toBe(sizes.length);
    }
  });

  it("matches the paper sizes at 300 dpi", () => {
    const px = (mm: number) => Math.round((mm / 25.4) * 300);
    const paper = Object.fromEntries(SIZE_PRESETS.map((p) => [p.id, [p.width, p.height]]));
    expect(paper["a3-portrait"]).toEqual([px(297), px(420)]);
    expect(paper["a4-portrait"]).toEqual([px(210), px(297)]);
    expect(paper["a5-portrait"]).toEqual([px(148), px(210)]);
    expect(paper["a6-portrait"]).toEqual([px(105), px(148)]);
    expect(paper["letter-portrait"]).toEqual([8.5 * 300, 11 * 300]);
  });
});

describe("seedSchema", () => {
  it("accepts uint32 values", () => {
    expect(seedSchema.parse(0)).toBe(0);
    expect(seedSchema.parse(0xffffffff)).toBe(0xffffffff);
  });

  it("rejects negatives, fractions and values above 2^32 - 1", () => {
    for (const v of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(seedSchema.safeParse(v).success, String(v)).toBe(false);
    }
  });
});

describe("visual params", () => {
  it("can be extended by a tool schema", () => {
    const schema = visualParamsSchema.extend({ size: z.number().min(1).max(10) });
    const params = { background: "transparent", palette: ["#000", "#fff"], size: 3 };
    expect(schema.parse(params)).toEqual(params);
    expect(Object.keys(schema.shape)).toEqual(["background", "palette", "size"]);
  });

  it("can be spread into a new object schema", () => {
    const schema = z.object({ ...visualParamsShape, angle: z.number() });
    expect(schema.safeParse({ background: "#fff", palette: ["#000"], angle: 0 }).success).toBe(
      false,
    );
  });

  it("registers control kinds for shared schemas and keeps them through extend", () => {
    const schema = visualParamsSchema.extend({ accent: colorSchema });
    expect(controlKindRegistry.get(schema.shape.accent)).toEqual({ kind: "color" });
    expect(controlKindRegistry.get(schema.shape.palette)).toEqual({ kind: "palette" });
    expect(controlKindRegistry.get(schema.shape.background)).toEqual({ kind: "background" });
    expect(controlKindRegistry.get(z.string())).toBeUndefined();
  });
});
