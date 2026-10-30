import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, syncHsv } from "./hsv";

describe("hsv", () => {
  it.each([
    ["#ff0000", { h: 0, s: 1, v: 1 }],
    ["#00ff00", { h: 120, s: 1, v: 1 }],
    ["#0000ff", { h: 240, s: 1, v: 1 }],
    ["#ffffff", { h: 0, s: 0, v: 1 }],
    ["#000000", { h: 0, s: 0, v: 0 }],
  ])("converts %s", (hex, hsv) => {
    expect(hexToHsv(hex)).toEqual(hsv);
    expect(hsvToHex(hsv)).toBe(hex);
  });

  it("accepts short hex and round-trips arbitrary colours", () => {
    expect(hsvToHex(hexToHsv("#abc"))).toBe("#aabbcc");
    for (const hex of ["#3b82f6", "#7c2d12", "#fef08a", "#123456", "#808080"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("keeps hue and saturation where the colour has none", () => {
    const blue = hexToHsv("#3b82f6");
    expect(syncHsv(blue, "#000000")).toEqual({ h: blue.h, s: blue.s, v: 0 });
    expect(syncHsv(blue, "#808080")).toEqual({ h: blue.h, s: 0, v: hexToHsv("#808080").v });
  });

  it("returns the previous state when it already produces the colour", () => {
    const state = { h: 200, s: 0.5, v: 0.5 };
    expect(syncHsv(state, hsvToHex(state))).toBe(state);
    expect(syncHsv(state, "#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    const white = hexToHsv("#ffffff");
    expect(syncHsv(white, "#fff")).toBe(white);
  });
});
