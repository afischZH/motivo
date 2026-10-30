import { describe, expect, it } from "vitest";
import {
  type GradientTextOptions,
  gradientTextBackground,
  gradientTextSize,
  gradientTextStops,
  gradientTextSvg,
} from "./index";

const opts = (o: Partial<GradientTextOptions> = {}): GradientTextOptions => ({
  width: 1600,
  height: 600,
  text: "Make it shine",
  font: "sans",
  fontWeight: 800,
  italic: false,
  letterSpacing: 0,
  size: 160,
  colors: ["#ff0000", "#00ff00", "#0000ff"],
  angle: 90,
  background: "#000000",
  shine: false,
  ...o,
});

describe("gradientTextStops", () => {
  it("runs there and back with shine, so the slide loops", () => {
    expect(gradientTextStops(["a", "b", "c"], false)).toEqual(["a", "b", "c"]);
    expect(gradientTextStops(["a", "b", "c"], true)).toEqual(["a", "b", "c", "b", "a"]);
  });
});

describe("gradientTextSize", () => {
  it("shrinks long text to fit and keeps short text at the chosen size", () => {
    expect(gradientTextSize(opts({ text: "Hi" }))).toBe(160);
    expect(gradientTextSize(opts({ text: "A much longer headline that cannot fit" }))).toBeLessThan(
      160,
    );
  });
});

describe("gradientTextSvg", () => {
  it("fills escaped text with the gradient", () => {
    const svg = gradientTextSvg(opts({ text: "<b>&" }));
    expect(svg).toContain("&lt;b&gt;&amp;</text>");
    expect(svg).toMatch(/fill="url\(#t[0-9a-z]+\)"/);
    expect(svg).not.toContain("gradientTransform");
  });

  it("moves the shine with the time and leaves out empty text", () => {
    const a = gradientTextSvg(opts({ shine: true, t: 0 }));
    const b = gradientTextSvg(opts({ shine: true, t: 0.5 }));
    expect(a).toContain('gradientTransform="translate(0 0) scale(2 1)"');
    expect(b).toContain("translate(-0.5 0)");
    expect(gradientTextSvg(opts({ text: "" }))).not.toContain("<text");
  });
});

describe("gradientTextBackground", () => {
  it("writes the CSS gradient with the same stops", () => {
    expect(gradientTextBackground(["#fff", "#000"], 90, false)).toBe(
      "linear-gradient(90deg, #fff, #000)",
    );
  });
});
