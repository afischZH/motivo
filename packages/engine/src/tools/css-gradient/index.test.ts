import { describe, expect, it } from "vitest";
import {
  CONIC_WEDGES,
  type CssGradientOptions,
  cssGradient,
  cssGradientCss,
  cssGradientLayers,
  cssGradientTailwind,
  gradientColorAt,
  gradientStops,
  tailwindArbitrary,
} from "./index";

const base: CssGradientOptions = {
  type: "linear",
  colors: ["#ff0000", "#0000ff"],
  angle: 90,
  centerX: 50,
  centerY: 50,
  shape: "ellipse",
  interpolation: "oklch",
  hue: "shorter",
  easing: "linear",
  steps: 3,
  loop: false,
  width: 200,
  height: 100,
};

describe("gradientStops", () => {
  it("places palette colours evenly with intermediate stops between", () => {
    const stops = gradientStops({ ...base, colors: ["#ff0000", "#00ff00", "#0000ff"] });
    expect(stops).toHaveLength(3 + 2 * 3);
    expect(stops[0]).toEqual({ color: "#ff0000", offset: 0 });
    expect(stops[4]).toEqual({ color: "#00ff00", offset: 0.5 });
    expect(stops.at(-1)).toEqual({ color: "#0000ff", offset: 1 });
    const offsets = stops.map((s) => s.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });

  it("skips redundant stops for linear easing in sRGB", () => {
    expect(gradientStops({ ...base, interpolation: "srgb" })).toHaveLength(2);
  });

  it("appends the first colour when looping", () => {
    const stops = gradientStops({ ...base, steps: 0, loop: true });
    expect(stops.map((s) => s.color)).toEqual(["#ff0000", "#0000ff", "#ff0000"]);
  });

  it("applies the easing to the colour, not the position", () => {
    const linear = gradientStops({ ...base, interpolation: "srgb", easing: "ease-in", steps: 1 });
    expect(linear[1]?.offset).toBe(0.5);
    // ease-in at 0.5 is about 0.29: still closer to red than blue.
    expect(linear[1]?.color).toBe("#b4004b");
  });

  it("throws with fewer than two colours", () => {
    expect(() => gradientStops({ ...base, colors: ["#fff"] })).toThrow(RangeError);
  });
});

describe("gradientColorAt", () => {
  it("returns the stop colours at the ends", () => {
    expect(gradientColorAt(base, 0)).toBe("#ff0000");
    expect(gradientColorAt(base, 1)).toBe("#0000ff");
    expect(gradientColorAt({ ...base, loop: true }, 1)).toBe("#ff0000");
  });
});

describe("cssGradientCss", () => {
  it("emits a fallback and an `in oklch` declaration", () => {
    const css = cssGradientCss(base);
    const lines = css.split("\n");
    expect(lines[0]).toBe("background-color: #ff0000;");
    expect(lines[1]).toMatch(
      /^background-image: linear-gradient\(90deg, #ff0000 0%, .+, #0000ff 100%\);$/,
    );
    expect(lines[2]).toBe(
      "background-image: linear-gradient(90deg in oklch, #ff0000 0%, #0000ff 100%);",
    );
  });

  it("emits a single declaration for sRGB", () => {
    const css = cssGradientCss({ ...base, interpolation: "srgb" });
    expect(css.split("\n")).toHaveLength(2);
    expect(css).not.toContain(" in ");
  });

  it("keeps eased stops in the native declaration and supports longer hue", () => {
    const css = cssGradientCss({ ...base, easing: "ease-out", hue: "longer" });
    const native = css.split("\n")[2] ?? "";
    expect(native).toContain("in oklch longer hue");
    expect(native.match(/%/g)).toHaveLength(5);
  });

  it("formats radial and conic preludes", () => {
    expect(cssGradientCss({ ...base, type: "radial", shape: "circle", centerX: 30 })).toContain(
      "radial-gradient(circle at 30% 50% in oklch,",
    );
    expect(cssGradientCss({ ...base, type: "conic", angle: 45 })).toContain(
      "conic-gradient(from 45deg at 50% 50% in oklch,",
    );
    expect(cssGradientCss({ ...base, interpolation: "oklab" })).toContain("90deg in oklab,");
  });
});

describe("cssGradientLayers", () => {
  it("matches the declarations of cssGradientCss", () => {
    const layers = cssGradientLayers(base);
    expect(cssGradientCss(base)).toBe(
      [
        `background-color: ${layers.color};`,
        `background-image: ${layers.fallback};`,
        `background-image: ${layers.native ?? ""};`,
      ].join("\n"),
    );
    expect(cssGradientLayers({ ...base, interpolation: "srgb" }).native).toBeUndefined();
  });
});

describe("tailwindArbitrary", () => {
  it("replaces whitespace with underscores and escapes underscores", () => {
    expect(tailwindArbitrary(" a  b\nc_d ")).toBe("a_b_c\\_d");
  });
});

describe("cssGradientTailwind", () => {
  it("emits a colour and an image class without spaces", () => {
    const tw = cssGradientTailwind({ ...base, interpolation: "srgb" });
    expect(tw).toBe("bg-[#ff0000] bg-[linear-gradient(90deg,_#ff0000_0%,_#0000ff_100%)]");
  });

  it("uses the precomputed fallback stops", () => {
    const tw = cssGradientTailwind({ ...base, type: "conic", easing: "ease-in" });
    const [color, image] = tw.split(" ");
    expect(color).toBe("bg-[#ff0000]");
    expect(image).toMatch(/^bg-\[conic-gradient\(from_90deg_at_50%_50%,_#ff0000_0%,_.+\)\]$/);
    expect(image).not.toContain("oklch");
  });
});

describe("cssGradient preview SVG", () => {
  it("matches the CSS gradient line for linear gradients", () => {
    const { previewSvg } = cssGradient({ ...base, angle: 90 });
    expect(previewSvg).toContain('x1="0" y1="50" x2="200" y2="50"');
    const diag = cssGradient({ ...base, angle: 0 }).previewSvg;
    expect(diag).toContain('x1="100" y1="100" x2="100" y2="0"');
  });

  it("uses farthest-corner sizing for radial gradients", () => {
    const ellipse = cssGradient({ ...base, type: "radial" }).previewSvg;
    expect(ellipse).toContain("matrix(141.42 0 0 70.71 100 50)");
    const circle = cssGradient({ ...base, type: "radial", shape: "circle" }).previewSvg;
    expect(circle).toContain("matrix(111.8 0 0 111.8 100 50)");
  });

  it("references its gradient by a content-derived id", () => {
    const { previewSvg } = cssGradient(base);
    const id = /id="([^"]+)"/.exec(previewSvg)?.[1];
    expect(id).toBeDefined();
    expect(previewSvg).toContain(`fill="url(#${id ?? ""})"`);
    expect(cssGradient({ ...base, angle: 10 }).previewSvg).not.toContain(`id="${id ?? ""}"`);
  });

  it("approximates conic gradients with at most one wedge per step", () => {
    const { previewSvg } = cssGradient({ ...base, type: "conic", loop: true });
    const wedges = previewSvg.match(/<path /g) ?? [];
    expect(wedges.length).toBeGreaterThan(10);
    expect(wedges.length).toBeLessThanOrEqual(CONIC_WEDGES);
  });

  it("covers the full circle when all colours are equal", () => {
    const { previewSvg } = cssGradient({ ...base, type: "conic", colors: ["#123456", "#123456"] });
    expect(previewSvg.match(/<path /g)).toHaveLength(1);
    // 4 quarter-turn segments plus the start point.
    expect(previewSvg.match(/ L/g)).toHaveLength(5);
  });

  it("is deterministic and leaks no invalid numbers", () => {
    for (const type of ["linear", "radial", "conic"] as const) {
      const a = cssGradient({ ...base, type, easing: "ease-in-out" });
      expect(a).toEqual(cssGradient({ ...base, type, easing: "ease-in-out" }));
      expect(a.previewSvg + a.css).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
