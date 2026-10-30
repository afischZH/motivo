import { describe, expect, it } from "vitest";
import { estimateTextWidth } from "../avatar";
import {
  STARBURST_SHAPES,
  type StarburstOptions,
  starburstPath,
  starburstSvg,
  starburstText,
} from "./index";

const opts = (o: Partial<StarburstOptions> = {}): StarburstOptions => ({
  width: 800,
  height: 800,
  background: "#ffffff",
  shape: "spiky",
  points: 16,
  depth: 0.2,
  rotation: 0,
  tilt: -12,
  size: 0.8,
  fill: "#ef4444",
  ink: "#ffffff",
  ring: "dashed",
  border: 0.05,
  borderColor: "#ffffff",
  shadow: 0.06,
  shadowColor: "#111111",
  line1: "-20%",
  line2: "SALE",
  font: "sans",
  fontWeight: 800,
  textSize: 0.6,
  ...o,
});

describe("starburstPath", () => {
  it("draws a closed path for every shape", () => {
    for (const shape of STARBURST_SHAPES) {
      expect(starburstPath(shape, 12, 100, 0.2)).toMatch(/Z$/);
    }
  });

  it("puts one outer point per spike", () => {
    const d = starburstPath("spiky", 10, 100, 0.3);
    expect(d.match(/[ML]/g)).toHaveLength(20);
  });

  it("clamps the number of points", () => {
    expect(starburstPath("spiky", 999, 100, 0.2)).toBe(starburstPath("spiky", 60, 100, 0.2));
  });
});

describe("starburstText", () => {
  it("keeps long text inside the inner circle", () => {
    const t = starburstText({
      line1: "A very long headline",
      line2: "",
      font: "sans",
      inner: 100,
      textSize: 1,
    });
    expect(t.line1).not.toBeNull();
    expect(
      (t.line1?.size ?? 0) * estimateTextWidth("A very long headline", "sans"),
    ).toBeLessThanOrEqual(160.01);
  });

  it("stacks two lines around the centre", () => {
    const t = starburstText({
      line1: "50%",
      line2: "OFF",
      font: "sans",
      inner: 100,
      textSize: 0.6,
    });
    expect(t.line1?.y ?? 0).toBeLessThan(t.line2?.y ?? 0);
  });

  it("has no lines without text", () => {
    expect(
      starburstText({ line1: " ", line2: "", font: "sans", inner: 100, textSize: 0.6 }),
    ).toEqual({
      line1: null,
      line2: null,
    });
  });
});

describe("starburstSvg", () => {
  it("escapes the text", () => {
    expect(starburstSvg(opts({ line1: "<b>&" }))).toContain("&lt;b&gt;&amp;");
  });

  it("turns by one point over a loop", () => {
    expect(starburstSvg(opts({ t: 0 }))).toBe(starburstSvg(opts()));
    expect(starburstSvg(opts({ t: 0.5 }))).not.toBe(starburstSvg(opts()));
  });

  it("adds a gradient only with a second colour", () => {
    expect(starburstSvg(opts())).not.toContain("linearGradient");
    expect(starburstSvg(opts({ fill2: "#f97316" }))).toContain("linearGradient");
  });
});
