import { describe, expect, it } from "vitest";
import { catmullRomToBezier, cubicPathToSvg, formatNumber } from "./curves";
import type { Vec2 } from "./vec";

const zigzag: Vec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 10 },
  { x: 20, y: 0 },
  { x: 30, y: 10 },
];

describe("catmullRomToBezier", () => {
  it("creates n - 1 segments for open curves and preserves endpoints", () => {
    const path = catmullRomToBezier(zigzag);
    expect(path.closed).toBe(false);
    expect(path.segments).toHaveLength(3);
    expect(path.start).toEqual(zigzag[0]);
    expect(path.segments.at(-1)?.to).toEqual(zigzag[3]);
  });

  it("passes through every input point", () => {
    const path = catmullRomToBezier(zigzag);
    expect(path.segments.map((s) => s.to)).toEqual(zigzag.slice(1));
  });

  it("creates n segments for closed curves ending at the start point", () => {
    const path = catmullRomToBezier(zigzag, { closed: true });
    expect(path.closed).toBe(true);
    expect(path.segments).toHaveLength(4);
    expect(path.segments.at(-1)?.to).toEqual(zigzag[0]);
  });

  it("degenerates to straight lines with tension 0", () => {
    const path = catmullRomToBezier(zigzag, { tension: 0 });
    for (const [i, s] of path.segments.entries()) {
      expect(s.c1).toEqual(zigzag[i]);
      expect(s.c2).toEqual(zigzag[i + 1]);
    }
  });

  it("handles tiny inputs", () => {
    expect(catmullRomToBezier([{ x: 1, y: 2 }]).segments).toHaveLength(0);
    expect(catmullRomToBezier([{ x: 1, y: 2 }], { closed: true }).closed).toBe(false);
    expect(
      catmullRomToBezier([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]).segments,
    ).toHaveLength(1);
    expect(() => catmullRomToBezier([])).toThrow(RangeError);
  });
});

describe("formatNumber", () => {
  it("rounds, trims zeros and avoids negative zero", () => {
    expect(formatNumber(1.005, 2)).toBe("1");
    expect(formatNumber(3.14159)).toBe("3.14");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(10)).toBe("10");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(-0.001)).toBe("0");
    expect(formatNumber(-1.236)).toBe("-1.24");
    expect(formatNumber(1.23456, 4)).toBe("1.2346");
    expect(formatNumber(7.6, 0)).toBe("8");
  });
});

describe("cubicPathToSvg", () => {
  it("formats an open path", () => {
    expect(cubicPathToSvg(catmullRomToBezier(zigzag))).toMatchInlineSnapshot(
      `"M0 0 C1.67 1.67 6.67 10 10 10 C13.33 10 16.67 0 20 0 C23.33 0 28.33 8.33 30 10"`,
    );
  });

  it("formats a closed path", () => {
    expect(cubicPathToSvg(catmullRomToBezier(zigzag, { closed: true }))).toMatchInlineSnapshot(
      `"M0 0 C-3.33 0 6.67 10 10 10 C13.33 10 16.67 0 20 0 C23.33 0 33.33 10 30 10 C26.67 10 3.33 0 0 0 Z"`,
    );
  });

  it("honours the precision argument and never emits -0", () => {
    const d = cubicPathToSvg(
      {
        start: { x: -0.0001, y: 1 / 3 },
        segments: [{ c1: { x: -0, y: 0 }, c2: { x: 1, y: 2 }, to: { x: 3, y: 4 } }],
        closed: false,
      },
      3,
    );
    expect(d).toBe("M0 0.333 C0 0 1 2 3 4");
    expect(d).not.toMatch(/-0(?![.\d])/);
  });
});
