import { describe, expect, it } from "vitest";
import { pngDataUri } from "../../png";
import { createRng } from "../../rng";
import {
  BORDER_ANGLE_PROPERTY,
  BORDER_SPIN_KEYFRAMES,
  GLASS_BACKDROPS,
  borderConic,
  cardRect,
  glassCss,
  glassEffect,
  glassGrainTile,
  glassHtml,
  glassStageColors,
  glassTailwind,
  glassTextContrast,
  hexAlpha,
  type GlassOptions,
} from "./index";

const base: GlassOptions = {
  width: 800,
  height: 500,
  effect: "glass",
  backdrop: "aurora",
  backdropPalette: ["#1e1b4b", "#f472b6", "#38bdf8"],
  cardWidth: 50,
  cardHeight: 40,
  radius: 24,
  shadow: 40,
  textColor: "#ffffff",
  blur: 16,
  tint: "#ffffff",
  tintOpacity: 20,
  saturation: 160,
  border: 30,
  noise: 0,
  borderPalette: ["#ff0000", "#0000ff"],
  borderWidth: 4,
  borderAngle: 30,
  animated: false,
  speed: 6,
  surface: "#0f172a",
  glowColor: "#38bdf8",
  glowSize: 40,
  glowIntensity: 70,
};

const decl = (r: ReturnType<typeof glassEffect>, prop: string) =>
  r.card.declarations.filter(([p]) => p === prop).map(([, v]) => v);

describe("glass", () => {
  it("writes backdrop-filter with the -webkit- prefix first", () => {
    const r = glassEffect(createRng(1), base);
    const props = r.card.declarations.map(([p]) => p);
    expect(decl(r, "backdrop-filter")).toEqual(["blur(16px) saturate(160%)"]);
    expect(decl(r, "-webkit-backdrop-filter")).toEqual(["blur(16px) saturate(160%)"]);
    expect(props.indexOf("-webkit-backdrop-filter")).toBeLessThan(props.indexOf("backdrop-filter"));
    expect(decl(r, "background-color")).toEqual(["#ffffff33"]);
    expect(decl(r, "box-shadow")[0]).toMatch(/^inset 0 0 0 1px rgb\(255 255 255 \/ 0\.3\), /);
    expect(r.rules).toBe("");
    expect(r.card.motion).toEqual([]);
  });

  it("centres the card", () => {
    expect(cardRect(base)).toEqual({ x: 200, y: 150, w: 400, h: 200 });
  });

  it("adds the grain tile as a background layer", () => {
    const href = pngDataUri(glassGrainTile(createRng(1), 0.4), "rgba");
    const r = glassEffect(createRng(1), { ...base, noise: 40, grainHref: href });
    expect(decl(r, "background-image")).toEqual([`url("${href}")`]);
    expect(r.svg).toContain(href);
  });

  it("scales grain alpha with the amount and keeps it neutral at zero", () => {
    const strong = glassGrainTile(createRng(3), 1);
    const weak = glassGrainTile(createRng(3), 0.25);
    const none = glassGrainTile(createRng(3), 0);
    const alpha = (t: { data: Uint8ClampedArray }) => {
      let s = 0;
      for (let i = 3; i < t.data.length; i += 4) s += t.data[i] as number;
      return s;
    };
    expect(alpha(none)).toBe(0);
    expect(alpha(weak)).toBeLessThan(alpha(strong) * 0.3);
    expect(strong.width).toBe(64);
  });

  it("matches CSS numbers in the SVG twin (blur sigma, saturate matrix)", () => {
    const r = glassEffect(createRng(1), base);
    expect(r.svg).toContain('stdDeviation="16" edgeMode="duplicate"');
    expect(r.svg).toContain('type="saturate" values="1.6"');
    expect(r.svg).toContain('fill="#ffffff" fill-opacity="0.2"');
    expect(r.svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("draws every stage and keeps ids unique", () => {
    for (const backdrop of GLASS_BACKDROPS) {
      const r = glassEffect(createRng(1), { ...base, backdrop });
      const ids = [...r.svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, backdrop).toBe(ids.length);
      expect(r.stageCss, backdrop).toMatch(/background/);
    }
  });

  it("rates text contrast against the tint over each stage colour", () => {
    const colors = glassStageColors(createRng(1), base);
    const white = glassTextContrast(base, colors);
    expect(white).toBeLessThan(4.5);
    const darkTint = glassTextContrast({ ...base, tint: "#000000", tintOpacity: 80 }, colors);
    expect(darkTint).toBeGreaterThan(white);
    expect(darkTint).toBeGreaterThanOrEqual(4.5);
  });
});

describe("gradient border", () => {
  const border: GlassOptions = { ...base, effect: "gradient-border" };

  it("uses padding-box and border-box layers", () => {
    const r = glassEffect(createRng(1), border);
    expect(decl(r, "border")).toEqual(["4px solid transparent"]);
    expect(decl(r, "background")[0]).toMatch(
      /^linear-gradient\(#0f172a, #0f172a\) padding-box, conic-gradient\(from 30deg at 50% 50%, .*\) border-box$/,
    );
    expect(r.rules).toBe("");
  });

  it("rotates via a registered custom property when animated", () => {
    const r = glassEffect(createRng(1), { ...border, animated: true, speed: 4 });
    expect(borderConic({ ...border, animated: true }, 100, 50)).toMatch(
      new RegExp(`^conic-gradient\\(from calc\\(30deg \\+ var\\(${BORDER_ANGLE_PROPERTY}\\)\\)`),
    );
    expect(decl(r, BORDER_ANGLE_PROPERTY)).toEqual(["0deg"]);
    expect(r.card.motion).toEqual([["animation", `${BORDER_SPIN_KEYFRAMES} 4s linear infinite`]]);
    expect(r.rules).toContain(`@property ${BORDER_ANGLE_PROPERTY}`);
    expect(r.rules).toContain('syntax: "<angle>"');
    const css = glassCss(r, "gradient-border", "#fff");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(
      /@keyframes musterli-border-spin \{\n {2}to \{ --musterli-border-angle: 360deg; \}/,
    );
  });

  it("clips a conic twin to the card in SVG", () => {
    const r = glassEffect(createRng(1), border);
    expect(r.svg).toMatch(
      /<clipPath id="c[a-z0-9]+"><rect x="200" y="150" width="400" height="200" rx="24"/,
    );
    // Inner fill with the padding-box radius (24 - 4).
    expect(r.svg).toContain(
      '<rect x="204" y="154" width="392" height="192" rx="20" fill="#0f172a"/>',
    );
  });
});

describe("glow", () => {
  it("layers coloured shadows and mirrors them as blurred rects", () => {
    const r = glassEffect(createRng(1), { ...base, effect: "glow", shadow: 0 });
    const shadow = decl(r, "box-shadow")[0] ?? "";
    expect(shadow.split("), ")).toHaveLength(3);
    expect(shadow).toContain("0px 0px 8px 0px rgb(56 189 248 / 0.63)");
    // box-shadow blur 8 => Gaussian sigma 4.
    expect(r.svg).toContain('stdDeviation="4"');
    expect(r.svg).toMatch(/<mask id="m[a-z0-9]+"/);
  });

  it("drops the glow at zero intensity", () => {
    const r = glassEffect(createRng(1), { ...base, effect: "glow", shadow: 0, glowIntensity: 0 });
    expect(decl(r, "box-shadow")).toEqual([]);
  });
});

describe("code exports", () => {
  it("writes a class with colour, Tailwind and an HTML example", () => {
    const r = glassEffect(createRng(1), base);
    const css = glassCss(r, "glass", "#ffffff");
    expect(css).toMatch(/^\.glass-card \{\n {2}background-color: #ffffff33;/);
    expect(css).toContain("  color: #ffffff;");
    const tw = glassTailwind(r, base);
    expect(tw).toContain("backdrop-blur-[16px] backdrop-saturate-[1.6]");
    expect(tw).toContain("rounded-[24px]");
    expect(tw).not.toContain("-webkit-");
    const html = glassHtml(r, base);
    expect(html).toContain('<div class="glass-card">');
    expect(html).toContain(".stage {");
    expect(html).toContain("min(400px, 90vw)");
  });

  it("marks the rotating border in Tailwind", () => {
    const o = { ...base, effect: "gradient-border" as const, animated: true };
    const tw = glassTailwind(glassEffect(createRng(1), o), o);
    expect(tw).toContain("motion-reduce:[animation:none]");
    expect(tw).toContain("<!-- Add the @property");
  });

  it("formats alpha hex", () => {
    expect(hexAlpha("#ABCDEF", 1)).toBe("#abcdef");
    expect(hexAlpha("#000000", 0.5)).toBe("#00000080");
    expect(hexAlpha("#000000", 2)).toBe("#000000");
  });
});
