import { describe, expect, it } from "vitest";
import {
  boxShadowEntries,
  dropShadowValue,
  shadowAutoColor,
  shadowColor,
  shadowEase,
  shadowElementBox,
  shadowLayers,
  shadowStage,
  shadowSvg,
  shadowTailwindClass,
  type ShadowOptions,
} from "./index";
import { hexToOklch } from "../../color";

const base: ShadowOptions = {
  layers: 4,
  distance: 32,
  blur: 64,
  spread: 0,
  angle: 0,
  opacity: 0.2,
  easing: "linear",
};

describe("shadowLayers", () => {
  it("gives a single layer the full size and opacity", () => {
    expect(shadowLayers({ ...base, layers: 1, spread: -4 })).toEqual([
      { x: 0, y: 32, blur: 64, spread: -4, alpha: 0.2 },
    ]);
  });

  it("grows offset and blur linearly and ends at the maximum", () => {
    const layers = shadowLayers(base);
    expect(layers.map((l) => l.y)).toEqual([8, 16, 24, 32]);
    expect(layers.map((l) => l.blur)).toEqual([16, 32, 48, 64]);
  });

  it("doubles from layer to layer with exponential easing", () => {
    const layers = shadowLayers({ ...base, easing: "exponential" });
    expect(layers.map((l) => l.y)).toEqual([4, 8, 16, 32]);
    expect(shadowEase("exponential", 0.5, 4)).toBe(0.25);
  });

  it("splits the opacity, slightly favouring the close layers", () => {
    const layers = shadowLayers({ ...base, layers: 5, opacity: 0.3 });
    const sum = layers.reduce((s, l) => s + l.alpha, 0);
    expect(sum).toBeCloseTo(0.3, 2);
    for (let i = 1; i < layers.length; i++) {
      expect((layers[i] as { alpha: number }).alpha).toBeLessThanOrEqual(
        (layers[i - 1] as { alpha: number }).alpha,
      );
    }
  });

  it("casts the shadow away from the light", () => {
    const one = { ...base, layers: 1 };
    expect(shadowLayers({ ...one, angle: 0 })[0]).toMatchObject({ x: 0, y: 32 });
    expect(shadowLayers({ ...one, angle: 90 })[0]).toMatchObject({ x: -32, y: 0 });
    expect(shadowLayers({ ...one, angle: 180 })[0]).toMatchObject({ x: 0, y: -32 });
    expect(shadowLayers({ ...one, angle: 270 })[0]).toMatchObject({ x: 32, y: 0 });
  });

  it("rounds lengths to 0.1 px", () => {
    for (const l of shadowLayers({ ...base, layers: 7, distance: 33.33, blur: 51.7, angle: 33 })) {
      for (const v of [l.x, l.y, l.blur, l.spread]) expect(Math.round(v * 10) / 10).toBe(v);
    }
  });

  it("clamps the layer count", () => {
    expect(shadowLayers({ ...base, layers: 20 })).toHaveLength(8);
    expect(shadowLayers({ ...base, layers: 0 })).toHaveLength(1);
  });
});

describe("CSS values", () => {
  const layers = shadowLayers({ ...base, layers: 2 });

  it("writes box-shadow entries with rgb alpha", () => {
    expect(boxShadowEntries(layers, "#0f172a", false)).toEqual([
      "0 16px 32px 0 rgb(15 23 42 / 0.12)",
      "0 32px 64px 0 rgb(15 23 42 / 0.08)",
    ]);
    expect(boxShadowEntries(layers, "#0f172a", true)[0]).toMatch(/^inset 0 16px/);
  });

  it("halves the blur for drop-shadow (standard deviation) and drops spread", () => {
    const value = dropShadowValue(shadowLayers({ ...base, layers: 1, spread: 8 }), "#000000");
    expect(value).toBe("drop-shadow(0 32px 32px rgb(0 0 0 / 0.2))");
  });

  it("builds a Tailwind arbitrary value without spaces", () => {
    const cls = shadowTailwindClass(layers, "#0f172a", false);
    expect(cls).toBe(
      "shadow-[0_16px_32px_0_rgb(15_23_42_/_0.12),0_32px_64px_0_rgb(15_23_42_/_0.08)]",
    );
    expect(cls).not.toMatch(/\s/);
  });

  it("formats colours with alpha", () => {
    expect(shadowColor("#ffffff", 0.0456)).toBe("rgb(255 255 255 / 0.046)");
  });
});

describe("shadowAutoColor", () => {
  it("is a dark tone of the surface hue, not black", () => {
    const c = shadowAutoColor("#e8edf5");
    expect(c).not.toBe("#000000");
    expect(hexToOklch(c).l).toBeCloseTo(0.24, 2);
    const hue = hexToOklch("#fed7aa").h;
    const dh = Math.abs(hexToOklch(shadowAutoColor("#fed7aa")).h - hue);
    expect(Math.min(dh, 360 - dh)).toBeLessThan(10);
  });
});

describe("stage and SVG twin", () => {
  it("builds every stage as CSS plus SVG", () => {
    for (const stage of ["solid", "gradient", "dots", "grid"] as const) {
      const out = shadowStage(stage, "#e8edf5", 400, 300);
      expect(out.css).toMatch(/background/);
      expect(out.svg.startsWith("<")).toBe(true);
    }
  });

  it("centres the element", () => {
    const box = shadowElementBox("card", 960, 640);
    expect(box.x * 2 + box.width).toBe(960);
    expect(box.y * 2 + box.height).toBe(640);
    const button = shadowElementBox("button", 960, 640);
    expect(button.height).toBeLessThan(button.width);
  });

  it("blurs each layer with a standard deviation of half the blur radius", () => {
    const layers = shadowLayers({ ...base, layers: 2 });
    const svg = shadowSvg({
      width: 400,
      height: 300,
      layers,
      color: "#0f172a",
      inset: false,
      radius: 12,
      element: shadowElementBox("card", 400, 300),
      elementColor: "#ffffff",
      stageSvg: shadowStage("solid", "#eeeeee", 400, 300).svg,
    });
    expect(svg).toContain('stdDeviation="16"');
    expect(svg).toContain('stdDeviation="32"');
    expect(svg).toContain('fill-opacity="0.12"');
    expect(svg).not.toContain("foreignObject");
  });

  it("clips inner shadows to the element", () => {
    const svg = shadowSvg({
      width: 400,
      height: 300,
      layers: shadowLayers({ ...base, layers: 1 }),
      color: "#000000",
      inset: true,
      radius: 12,
      element: shadowElementBox("card", 400, 300),
      elementColor: "#ffffff",
      stageSvg: "",
    });
    expect(svg).toContain("<clipPath");
    expect(svg).toContain('fill-rule="evenodd"');
  });
});
