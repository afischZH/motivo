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
    }
    expect(new Set(SIZE_PRESETS.map((p) => p.id)).size).toBe(SIZE_PRESETS.length);
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
