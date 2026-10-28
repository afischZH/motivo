import { describe, expect, it } from "vitest";
import {
  CROP_MIN,
  cropToSource,
  initialCrop,
  moveCrop,
  resizeCrop,
  setCropField,
  withAspect,
  type CropRect,
} from "./crop";

const wide = { width: 200, height: 100 };
const tall = { width: 100, height: 400 };

/** Width and height of a crop in source units. */
const units = (c: CropRect, src: { width: number; height: number }) => ({
  w: c.w * src.width,
  h: c.h * src.height,
});

const inside = (c: CropRect) => {
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.y).toBeGreaterThanOrEqual(0);
  expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9);
  expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
};

describe("crop math", () => {
  it("starts with the whole source or the largest centred square", () => {
    expect(initialCrop(wide, "free")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    const sq = initialCrop(wide, "square");
    expect(sq).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
    expect(units(sq, wide)).toEqual({ w: 100, h: 100 });
    const tallSq = initialCrop(tall, "square");
    expect(units(tallSq, tall).w).toBeCloseTo(units(tallSq, tall).h);
    expect(tallSq.y).toBeCloseTo(0.375);
  });

  it("moves inside the source only", () => {
    const c = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    expect(moveCrop(c, -1, -1)).toMatchObject({ x: 0, y: 0 });
    expect(moveCrop(c, 1, 1)).toMatchObject({ x: 0.5, y: 0.5 });
    expect(moveCrop(c, 0.1, 0)).toMatchObject({ x: 0.2, y: 0.1 });
  });

  it("resizes freely within bounds and a minimum size", () => {
    const c = { x: 0.5, y: 0.5, w: 0.2, h: 0.2 };
    expect(resizeCrop(c, 1, 1, "free", wide)).toMatchObject({ w: 0.5, h: 0.5 });
    expect(resizeCrop(c, -1, -1, "free", wide)).toMatchObject({ w: CROP_MIN, h: CROP_MIN });
  });

  it("keeps square crops square in source units and inside the source", () => {
    const start = initialCrop(wide, "square");
    for (const d of [-0.3, -0.05, 0.05, 0.3, 2]) {
      const r = resizeCrop(start, d, 0, "square", wide);
      const u = units(r, wide);
      expect(u.w).toBeCloseTo(u.h);
      inside(r);
    }
  });

  it("switching to square keeps the centre and the shorter side", () => {
    const c = { x: 0.1, y: 0.2, w: 0.6, h: 0.4 };
    const sq = withAspect(c, "square", wide);
    const u = units(sq, wide);
    expect(u.w).toBeCloseTo(40);
    expect(u.h).toBeCloseTo(40);
    expect(sq.x + sq.w / 2).toBeCloseTo(0.4);
    expect(sq.y + sq.h / 2).toBeCloseTo(0.4);
    expect(withAspect(c, "free", wide)).toBe(c);
  });

  it("sets single fields from percent values", () => {
    const c = { x: 0, y: 0, w: 0.5, h: 0.5 };
    expect(setCropField(c, "x", 30, "free", wide)).toMatchObject({ x: 0.3 });
    expect(setCropField(c, "x", 90, "free", wide)).toMatchObject({ x: 0.5 });
    expect(setCropField(c, "h", 80, "free", wide)).toMatchObject({ h: 0.8, w: 0.5 });
    const sq = setCropField(initialCrop(wide, "square"), "h", 50, "square", wide);
    expect(units(sq, wide).w).toBeCloseTo(units(sq, wide).h);
    expect(units(sq, wide).h).toBeCloseTo(50);
  });

  it("maps to source units including a viewBox origin", () => {
    expect(cropToSource({ x: 0.5, y: 0.25, w: 0.5, h: 0.5 }, { ...wide, x: -10, y: 5 })).toEqual({
      x: 90,
      y: 30,
      width: 100,
      height: 50,
    });
  });
});
