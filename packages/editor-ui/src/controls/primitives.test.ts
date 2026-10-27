import { describe, expect, it } from "vitest";
import { toLongHex } from "./color";
import { clampNumber, cx, parseLocaleNumber, stepDecimals } from "./primitives";

describe("stepDecimals", () => {
  it.each([
    [1, 0],
    [10, 0],
    [0.5, 1],
    [0.05, 2],
    [0.01, 2],
    [0.001, 3],
    [1 / 3, 4],
    [0, 0],
    [Number.NaN, 0],
  ])("%s -> %s", (step, decimals) => {
    expect(stepDecimals(step)).toBe(decimals);
  });
});

describe("parseLocaleNumber", () => {
  it("parses dots and commas, rejects empty and partial input", () => {
    expect(parseLocaleNumber("1.5")).toBe(1.5);
    expect(parseLocaleNumber(" 1,5 ")).toBe(1.5);
    expect(parseLocaleNumber("-3")).toBe(-3);
    expect(parseLocaleNumber("")).toBeNaN();
    expect(parseLocaleNumber("-")).toBeNaN();
    expect(parseLocaleNumber("abc")).toBeNaN();
  });
});

describe("clampNumber", () => {
  it("clamps to optional bounds", () => {
    expect(clampNumber(5, 0, 3)).toBe(3);
    expect(clampNumber(-1, 0)).toBe(0);
    expect(clampNumber(9)).toBe(9);
  });
});

describe("toLongHex and cx", () => {
  it("expands short hex and lower-cases", () => {
    expect(toLongHex("#ABC")).toBe("#aabbcc");
    expect(toLongHex("#A1B2C3")).toBe("#a1b2c3");
  });

  it("joins truthy class names", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });
});
