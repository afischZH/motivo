import { describe, expect, it } from "vitest";
import { hexToOklch } from "../color";
import { createRng } from "../rng";
import {
  HARMONIES,
  SCALE_METHODS,
  TAILWIND_STEPS,
  bestTextColor,
  colorList,
  contrastRatio,
  contrastText,
  cssVariables,
  formatColor,
  formatHsl,
  formatOklch,
  formatRatio,
  formatRgb,
  harmonyOffsets,
  harmonyPalette,
  normalizeHex,
  relativeLuminance,
  swatchValue,
  swatchesSvg,
  tailwindConfig,
  tailwindScale,
  tailwindTheme,
  tintsAndShades,
  toCssName,
  wcagLevel,
} from "./index";

const hueDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe("WCAG contrast", () => {
  it("computes relative luminance at the extremes", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 10);
    expect(relativeLuminance("#ff0000")).toBeCloseTo(0.2126, 4);
  });

  it.each([
    ["#000000", "#ffffff", 21],
    ["#ffffff", "#000000", 21],
    ["#777777", "#ffffff", 4.48],
    ["#767676", "#ffffff", 4.54],
    ["#ff0000", "#ffffff", 4.0],
    ["#0000ff", "#ffffff", 8.59],
    ["#00ff00", "#000000", 15.3],
    ["#1e90ff", "#1e90ff", 1],
  ])("%s on %s is %s:1", (a, b, expected) => {
    expect(contrastRatio(a, b)).toBeCloseTo(expected, 2);
  });

  it("maps ratios to WCAG levels", () => {
    expect(wcagLevel(21)).toBe("aaa");
    expect(wcagLevel(7)).toBe("aaa");
    expect(wcagLevel(4.5)).toBe("aa");
    expect(wcagLevel(4.49)).toBe("aa-large");
    expect(wcagLevel(3)).toBe("aa-large");
    expect(wcagLevel(2.99)).toBe("fail");
  });

  it("rounds displayed ratios down so they never overstate a pass", () => {
    expect(formatRatio(contrastRatio("#000000", "#ffffff"))).toBe("21.0");
    expect(formatRatio(contrastRatio("#777777", "#ffffff"))).toBe("4.4");
    expect(contrastText(contrastRatio("#777777", "#ffffff"))).toBe("4.4:1");
    expect(contrastText(4.54)).toBe("4.5:1 AA");
    expect(contrastText(8.59)).toBe("8.5:1 AAA");
  });

  it("picks the more readable text colour", () => {
    expect(bestTextColor("#ffff00").color).toBe("#000000");
    expect(bestTextColor("#000080").color).toBe("#ffffff");
    expect(bestTextColor("#777777").ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("colour formats", () => {
  it("formats hex, rgb, hsl and oklch", () => {
    expect(normalizeHex("#F0A")).toBe("#ff00aa");
    expect(formatRgb("#1e90ff")).toBe("rgb(30, 144, 255)");
    expect(formatHsl("#1e90ff")).toBe("hsl(210, 100%, 55.9%)");
    expect(formatHsl("#808080")).toBe("hsl(0, 0%, 50.2%)");
    expect(formatOklch("#ffffff")).toBe("oklch(100% 0 0)");
    expect(formatOklch("#000000")).toBe("oklch(0% 0 0)");
    expect(formatOklch("#ff0000")).toBe("oklch(62.8% 0.258 29.2)");
    expect(formatColor("#ABC", "hex")).toBe("#aabbcc");
  });

  it("shortens values for swatch labels", () => {
    expect(swatchValue("#1e90ff", "rgb")).toBe("30 144 255");
    expect(swatchValue("#1e90ff", "hsl")).toBe("210 100% 55.9%");
    expect(swatchValue("#ff0000", "oklch")).toBe("62.8% 0.258 29.2");
  });

  it("turns free text into CSS-safe names", () => {
    expect(toCssName("Brand Blau", "x")).toBe("brand-blau");
    expect(toCssName("Grün 2!", "x")).toBe("grun-2");
    expect(toCssName("42", "brand")).toBe("brand");
    expect(toCssName("  ", "brand")).toBe("brand");
    expect(toCssName("a".repeat(50), "x")).toHaveLength(32);
  });
});

describe("harmonies", () => {
  it("returns the classic hue offsets", () => {
    expect(harmonyOffsets("complementary", 4)).toEqual([0, 180, 0, 180]);
    expect(harmonyOffsets("triadic", 3)).toEqual([0, 120, 240]);
    expect(harmonyOffsets("split", 3)).toEqual([0, 150, 210]);
    expect(harmonyOffsets("tetradic", 5)).toEqual([0, 90, 180, 270, 0]);
    expect(harmonyOffsets("analogous", 3, 20)).toEqual([-20, 0, 20]);
  });

  it.each(HARMONIES)("generates a deterministic %s palette of valid hex colours", (harmony) => {
    const a = harmonyPalette({ harmony, count: 5, rng: createRng(1) });
    expect(a).toHaveLength(5);
    for (const c of a) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(harmonyPalette({ harmony, count: 5, rng: createRng(1) })).toEqual(a);
  });

  it("places complementary colours about 180 degrees apart in OKLCH", () => {
    const [a, b] = harmonyPalette({ harmony: "complementary", count: 2, rng: createRng(3) });
    const ha = hexToOklch(a as string).h;
    const hb = hexToOklch(b as string).h;
    // Gamut mapping keeps hue; jitter and hex rounding allow a few degrees.
    expect(hueDistance(ha, hb)).toBeGreaterThan(160);
  });

  it("aligns the palette with an anchor colour", () => {
    const anchor = { index: 2, color: "#1e90ff" };
    const out = harmonyPalette({ harmony: "triadic", count: 3, rng: createRng(5), anchor });
    const anchorHue = hexToOklch(anchor.color).h;
    // Slot 2 sits at +240 degrees of the base hue, i.e. on the anchor hue (up to jitter).
    expect(hueDistance(hexToOklch(out[2] as string).h, anchorHue)).toBeLessThan(10);
    expect(hueDistance(hexToOklch(out[0] as string).h, anchorHue - 240)).toBeLessThan(10);
  });
});

describe("tints and shades", () => {
  it.each(SCALE_METHODS)("orders %s steps from light to dark around the base", (method) => {
    const scale = tintsAndShades({ base: "#1E90FF", tints: 4, shades: 3, range: 0.9, method });
    expect(scale).toHaveLength(8);
    expect(scale[4]).toEqual({ color: "#1e90ff", role: "base", index: 0 });
    expect(scale.map((s) => s.role)).toEqual([
      "tint",
      "tint",
      "tint",
      "tint",
      "base",
      "shade",
      "shade",
      "shade",
    ]);
    const lightness = scale.map((s) => hexToOklch(s.color).l);
    for (let i = 1; i < lightness.length; i++) {
      expect(lightness[i]).toBeLessThan(lightness[i - 1] as number);
    }
    expect(scale[0]?.color).not.toBe("#ffffff");
    expect(scale.at(-1)?.color).not.toBe("#000000");
  });

  it("mixes with white in sRGB like a classic tint", () => {
    const [tint] = tintsAndShades({
      base: "#000000",
      tints: 1,
      shades: 0,
      range: 1,
      method: "srgb",
    });
    expect(tint?.color).toBe("#808080");
  });

  it("returns only the base without steps", () => {
    expect(
      tintsAndShades({ base: "#123456", tints: 0, shades: 0, range: 1, method: "oklch" }),
    ).toEqual([{ color: "#123456", role: "base", index: 0 }]);
  });
});

describe("tailwindScale", () => {
  const options = { lightest: 0.975, darkest: 0.27, chromaFalloff: 0.3, hueShift: 0 };

  it("anchors the base at 500 and spans 50 to 950", () => {
    const scale = tailwindScale({ ...options, base: "#3B82F6" });
    expect(scale.map((s) => s.step)).toEqual([...TAILWIND_STEPS]);
    expect(scale.find((s) => s.step === 500)?.color).toBe("#3b82f6");
    expect(hexToOklch(scale[0]?.color as string).l).toBeCloseTo(0.975, 2);
    expect(hexToOklch(scale[10]?.color as string).l).toBeCloseTo(0.27, 2);
  });

  it.each(["#3b82f6", "#ef4444", "#22c55e", "#fde047", "#111827", "#f5f5f5"])(
    "is strictly monotonic in lightness for %s",
    (base) => {
      const l = tailwindScale({ ...options, base }).map((s) => hexToOklch(s.color).l);
      for (let i = 1; i < l.length; i++) expect(l[i]).toBeLessThan(l[i - 1] as number);
    },
  );

  it("reduces chroma towards the ends", () => {
    const scale = tailwindScale({ ...options, base: "#3b82f6", chromaFalloff: 1 });
    const c = scale.map((s) => hexToOklch(s.color).c);
    expect(c[0]).toBeLessThan(0.02);
    expect(c[10]).toBeLessThan(0.02);
    expect(c[5]).toBeGreaterThan(0.15);
  });

  it("shifts the hue in opposite directions at the ends", () => {
    const scale = tailwindScale({ ...options, base: "#3b82f6", chromaFalloff: 0, hueShift: 20 });
    const h = scale.map((s) => hexToOklch(s.color).h);
    const base = h[5] as number;
    expect((h[1] as number) - base).toBeGreaterThan(10);
    expect(base - (h[9] as number)).toBeGreaterThan(10);
  });

  it("keeps grey bases grey", () => {
    for (const s of tailwindScale({ ...options, base: "#808080", hueShift: 30 })) {
      expect(hexToOklch(s.color).c).toBeLessThan(0.002);
    }
  });
});

describe("code exports", () => {
  const colors = [
    { name: "50", color: "#eff6ff" },
    { name: "500", color: "#3b82f6" },
  ];

  it("builds CSS variables and lists", () => {
    expect(cssVariables("brand", colors)).toBe(
      ":root {\n  --brand-50: #eff6ff;\n  --brand-500: #3b82f6;\n}\n",
    );
    expect(cssVariables("brand", [{ name: "", color: "#3b82f6" }], "rgb")).toBe(
      ":root {\n  --brand: rgb(59, 130, 246);\n}\n",
    );
    expect(colorList(colors, "hex")).toBe("#eff6ff\n#3b82f6\n");
  });

  it("builds a tailwind.config.js", () => {
    expect(tailwindConfig("brand", colors)).toBe(
      [
        "/** @type {import('tailwindcss').Config} */",
        "module.exports = {",
        "  theme: {",
        "    extend: {",
        "      colors: {",
        "        brand: {",
        "          50: '#eff6ff',",
        "          500: '#3b82f6',",
        "        },",
        "      },",
        "    },",
        "  },",
        "};",
        "",
      ].join("\n"),
    );
    expect(tailwindConfig("brand-blue", colors)).toContain("        'brand-blue': {");
  });

  it("builds a Tailwind v4 @theme block", () => {
    expect(tailwindTheme("brand", colors)).toBe(
      "@theme {\n  --color-brand-50: oklch(97% 0.014 254.6);\n  --color-brand-500: oklch(62.3% 0.188 259.8);\n}\n",
    );
    expect(tailwindTheme("brand", colors, "hex")).toContain("--color-brand-500: #3b82f6;");
  });
});

describe("swatchesSvg", () => {
  const swatches = [
    { color: "#ffffff", title: "50" },
    { color: "#000000", marked: true },
  ];

  it("draws one rect per swatch with readable labels in one font size", () => {
    const svg = swatchesSvg({ width: 400, height: 200, swatches, label: "hex", contrast: true });
    expect(svg.match(/<rect /g)).toHaveLength(2);
    expect(svg).toContain(">#ffffff</text>");
    expect(svg).toContain(">21.0:1 AAA</text>");
    expect(svg).toContain('<g fill="#000000">');
    expect(svg).toContain("<circle ");
    expect(svg).toContain('font-weight="700"');
  });

  it("stacks swatches on portrait canvases", () => {
    const svg = swatchesSvg({ width: 200, height: 400, swatches, label: "none", contrast: false });
    expect(svg).toContain('<rect x="0" y="200" width="200" height="200" fill="#000000"/>');
    expect(svg).not.toContain(">#");
  });

  it("adds an n × n contrast matrix", () => {
    const three = [...swatches, { color: "#1e90ff" }];
    const svg = swatchesSvg({
      width: 600,
      height: 600,
      swatches: three,
      label: "none",
      contrast: false,
      matrix: true,
    });
    expect(svg.match(/<rect /g)).toHaveLength(3 + 3);
    // Six off-diagonal cells, each with a ratio.
    expect(svg.match(/:1/g)).toHaveLength(6);
  });

  it("splits long values into one component per line on narrow swatches", () => {
    const svg = swatchesSvg({
      width: 600,
      height: 300,
      swatches: Array.from({ length: 8 }, () => ({ color: "#ff0000" })),
      label: "oklch",
      contrast: false,
    });
    expect(svg).toContain(">62.8%</text>");
  });
});
