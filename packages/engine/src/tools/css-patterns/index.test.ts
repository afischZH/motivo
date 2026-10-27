import { describe, expect, it } from "vitest";
import {
  CSS_PATTERNS,
  CSS_PATTERN_IDS,
  CSS_PATTERN_SIZE_MAX,
  CSS_PATTERN_SIZE_MIN,
  MAX_PATTERN_LAYERS,
  PATTERN_CATEGORIES,
  PATTERN_LOOKS,
  bandStops,
  cssPattern,
  cssPatternDeclarations,
  cssPatternLayers,
  cssPatternTailwind,
  declarationsToCss,
  getCssPattern,
  patternDeclarations,
  patternSvg,
  patternUsesAccent,
  type CssPatternOptions,
  type PatternSpec,
  type PatternLayer,
} from "./index";

const base: Omit<CssPatternOptions, "pattern"> = {
  background: "#f8f5ee",
  color: "#1f3a5f",
  accent: "#e07a5f",
  size: 24,
  angle: 30,
  opacity: 100,
};

function spec(id: string): PatternSpec {
  const found = getCssPattern(id);
  if (!found) throw new Error(`unknown pattern ${id}`);
  return found;
}

const paint = { color: "#112233", accent: "#445566", background: "#ffffff", opacity: 1 };

/** Parentheses balance and never go negative. */
function balanced(value: string): boolean {
  let depth = 0;
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

const IMAGE = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/;

describe("library", () => {
  it("has at least 30 patterns with unique kebab-case ids", () => {
    expect(CSS_PATTERNS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CSS_PATTERN_IDS).size).toBe(CSS_PATTERN_IDS.length);
    for (const id of CSS_PATTERN_IDS) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it.each(PATTERN_CATEGORIES)("has at least 6 patterns in %s", (category) => {
    expect(CSS_PATTERNS.filter((p) => p.category === category).length).toBeGreaterThanOrEqual(6);
  });

  it("gives every pattern a showcase within the size range", () => {
    for (const p of CSS_PATTERNS) {
      expect(PATTERN_LOOKS[p.look]).toBeDefined();
      expect(p.size).toBeGreaterThanOrEqual(CSS_PATTERN_SIZE_MIN);
      expect(p.size).toBeLessThanOrEqual(CSS_PATTERN_SIZE_MAX);
    }
  });

  it("looks patterns up by id", () => {
    expect(getCssPattern("polka")?.category).toBe("dots");
    expect(getCssPattern("nope")).toBeUndefined();
    expect(getCssPattern("constructor")).toBeUndefined();
  });

  it("knows which patterns use the accent colour", () => {
    expect(patternUsesAccent(spec("polka"))).toBe(false);
    expect(patternUsesAccent(spec("dots-duo"))).toBe(true);
  });
});

describe.each(CSS_PATTERN_IDS)("pattern %s", (pattern) => {
  const p = spec(pattern);
  const cases = [
    { size: CSS_PATTERN_SIZE_MIN, angle: 0, opacity: 100 },
    { size: p.size, angle: p.angle, opacity: 55 },
    { size: CSS_PATTERN_SIZE_MAX, angle: 359, opacity: 100 },
    { size: 37, angle: 17.5, opacity: 0 },
  ];

  it.each(cases)("renders valid, bounded CSS at %o", (c) => {
    const d = cssPatternDeclarations({ ...base, ...c, pattern });
    const css = declarationsToCss(d);
    expect(css).not.toMatch(/NaN|undefined|Infinity|null/);
    expect(css.length).toBeLessThan(4000);
    expect(css.split("\n")).toEqual([
      `background-color: ${base.background};`,
      expect.stringMatching(/^background-image: .+;$/),
      expect.stringMatching(/^background-size: .+;$/),
      expect.stringMatching(/^background-position: .+;$/),
    ]);
    expect(balanced(d.backgroundImage)).toBe(true);
    const images = d.backgroundImage.split(/,\s(?=(?:repeating-)?(?:linear|radial|conic)-)/);
    for (const image of images) expect(image).toMatch(IMAGE);
    expect(images.length).toBeLessThanOrEqual(MAX_PATTERN_LAYERS);
    expect(d.backgroundSize.split(", ")).toHaveLength(images.length);
    expect(d.backgroundPosition.split(", ")).toHaveLength(images.length);
    for (const size of d.backgroundSize.split(", ")) {
      expect(size).toMatch(/^(?:100% 100%|\d+(?:\.\d+)?px \d+(?:\.\d+)?px)$/);
      const edge = Math.max(...size.split(" ").map((v) => (v.endsWith("px") ? parseFloat(v) : 0)));
      expect(edge).toBeLessThanOrEqual(5 * CSS_PATTERN_SIZE_MAX);
    }
  });

  it("renders a matching, well-formed SVG", () => {
    const { svg, declarations } = cssPattern({ ...base, pattern, width: 300, height: 200 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"')).toBe(
      true,
    );
    expect(svg).not.toMatch(/NaN|undefined|Infinity|script|foreignObject|href/i);
    expect(svg.length).toBeLessThan(20_000);
    // One <pattern> per tiled layer; each full-element layer paints the canvas directly.
    const sizes = declarations.backgroundSize.split(", ");
    const tiled = sizes.filter((s) => s !== "100% 100%").length;
    expect(svg.match(/<pattern /g)?.length ?? 0).toBe(tiled);
    const topLevel = svg
      .replace(/<pattern [\s\S]*?<\/pattern>/g, "")
      .replace(/<defs>.*<\/defs>/, "");
    expect(topLevel.match(/fill="url\(#[gp]/g)?.length ?? 0).toBe(sizes.length);
    expect(sizes).toHaveLength(declarations.backgroundImage.match(IMAGE_GLOBAL)?.length ?? 0);
  });

  it("is deterministic", () => {
    const o = { ...base, pattern, width: 120, height: 90 };
    expect(cssPattern(o)).toEqual(cssPattern(o));
  });

  it(`${p.rotatable ? "reacts" : "does not react"} to the angle`, () => {
    const a = cssPatternDeclarations({ ...base, pattern, angle: 0 });
    const b = cssPatternDeclarations({ ...base, pattern, angle: 30 });
    if (p.rotatable) expect(b).not.toEqual(a);
    else expect(b).toEqual(a);
  });

  it("changes with the size", () => {
    const a = cssPatternDeclarations({ ...base, pattern, size: 20 });
    const b = cssPatternDeclarations({ ...base, pattern, size: 40 });
    expect(b).not.toEqual(a);
  });
});

const IMAGE_GLOBAL = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/g;

describe("colours and opacity", () => {
  it("rejects anything that is not a hex colour (no CSS or markup injection)", () => {
    const attacks = [
      "red",
      "#fff;background:url(https://evil.example/x)",
      "#ffffff) , url(x",
      '#fff"/><script>alert(1)</script>',
      "#ffff",
      "#12345g",
      "",
      " #ffffff",
    ];
    for (const color of attacks) {
      expect(() => cssPattern({ ...base, pattern: "polka", color, width: 10, height: 10 })).toThrow(
        RangeError,
      );
      expect(() => cssPatternDeclarations({ ...base, pattern: "polka", accent: color })).toThrow(
        RangeError,
      );
      expect(() =>
        cssPatternDeclarations({ ...base, pattern: "polka", background: color }),
      ).toThrow(RangeError);
    }
  });

  it("rejects unknown patterns and non-finite numbers", () => {
    expect(() => cssPatternLayers({ pattern: "__proto__", size: 10, angle: 0 })).toThrow(
      RangeError,
    );
    expect(() => cssPatternLayers({ pattern: "polka", size: Number.NaN, angle: 0 })).toThrow(
      RangeError,
    );
    expect(() => cssPatternLayers({ pattern: "stripes", size: 10, angle: Infinity })).toThrow(
      RangeError,
    );
  });

  it("clamps the size to the supported range", () => {
    expect(cssPatternLayers({ pattern: "polka", size: 1, angle: 0 })).toEqual(
      cssPatternLayers({ pattern: "polka", size: CSS_PATTERN_SIZE_MIN, angle: 0 }),
    );
    expect(cssPatternLayers({ pattern: "polka", size: 10_000, angle: 0 })).toEqual(
      cssPatternLayers({ pattern: "polka", size: CSS_PATTERN_SIZE_MAX, angle: 0 }),
    );
  });

  it("normalises short hex and applies opacity as an alpha channel in CSS and SVG", () => {
    const o = { ...base, pattern: "polka", color: "#ABC", opacity: 50 };
    const d = cssPatternDeclarations(o);
    expect(d.backgroundImage).toContain("#aabbcc80");
    const { svg } = cssPattern({ ...o, width: 50, height: 50 });
    expect(svg).toContain('stop-color="#aabbcc" stop-opacity="0.502"');
  });

  it("omits the background colour when transparent", () => {
    const d = cssPatternDeclarations({ ...base, pattern: "polka", background: "transparent" });
    expect(d.backgroundColor).toBeUndefined();
    const { svg } = cssPattern({
      ...base,
      pattern: "polka",
      background: "transparent",
      width: 9,
      height: 9,
    });
    expect(svg).not.toContain('fill="#f8f5ee"');
  });

  it("renders Tailwind arbitrary values without spaces", () => {
    const tw = cssPatternTailwind({ ...base, pattern: "zigzag" });
    expect(tw.startsWith("bg-[#f8f5ee] [background-image:linear-gradient(")).toBe(true);
    expect(tw).toContain("[background-size:");
    expect(tw).toContain("[background-position:");
    expect(tw.split(" ")).toHaveLength(4);
  });
});

describe("layers to CSS and SVG", () => {
  it("merges same-coloured stops into two-position stops", () => {
    const layers: PatternLayer[] = [
      {
        image: {
          kind: "linear",
          angle: 45,
          unit: "%",
          stops: [
            { ink: "a", at: 0 },
            { ink: "a", at: 25 },
            { ink: null, at: 25 },
            { ink: null, at: 100 },
          ],
        },
        tile: { w: 20, h: 20 },
        offset: { x: 10, y: 0 },
      },
    ];
    const d = patternDeclarations(layers, paint);
    expect(d.backgroundImage).toBe("linear-gradient(45deg, #112233 0% 25%, transparent 25% 100%)");
    expect(d.backgroundSize).toBe("20px 20px");
    expect(d.backgroundPosition).toBe("10px 0px");
  });

  it("places a linear gradient line like CSS does", () => {
    // 90deg in a 100 x 50 box: from the middle of the left edge to the right.
    const svg = patternSvg(
      [
        {
          image: {
            kind: "repeating-linear",
            angle: 90,
            unit: "px",
            stops: [
              { ink: "a", at: 0 },
              { ink: "a", at: 4 },
              { ink: null, at: 4 },
              { ink: null, at: 10 },
            ],
          },
        },
      ],
      paint,
      100,
      50,
    );
    expect(svg).toContain('spreadMethod="repeat" x1="0" y1="25" x2="10" y2="25"');
    // Transparent stops borrow the neighbouring colour at alpha 0 (no dark fringes in SVG).
    expect(svg).toContain('<stop offset="0.4" stop-color="#112233" stop-opacity="0"/>');
  });

  it("draws conic sectors as polygons from the centre", () => {
    const svg = patternSvg(
      [
        {
          image: {
            kind: "conic",
            from: 270,
            at: { x: 5, y: 6 },
            stops: [
              { ink: "a", at: 90 },
              { ink: null, at: 360 },
            ],
          },
          tile: { w: 20, h: 20 },
        },
      ],
      paint,
      40,
      40,
    );
    // Centre, then far points at 270 (left), 315 and 360 (up) degrees.
    expect(svg).toContain('<path d="M5 6 L-75 6 L-51.57 -50.57 L5 -74Z" fill="#112233"/>');
    expect(svg).toContain('patternUnits="userSpaceOnUse" x="0" y="0" width="20" height="20"');
  });

  it("paints the first layer on top", () => {
    const layer = (ink: "a" | "b"): PatternLayer => ({
      image: {
        kind: "radial",
        at: { x: 5, y: 5 },
        stops: [
          { ink, at: 0 },
          { ink, at: 3 },
        ],
      },
      tile: { w: 10, h: 10 },
    });
    const svg = patternSvg([layer("a"), layer("b")], paint, 10, 10);
    expect(svg.lastIndexOf("#112233")).toBeGreaterThan(svg.lastIndexOf("#445566"));
    expect(svg.indexOf('fill="url(#p')).toBeLessThan(svg.lastIndexOf('fill="url(#p'));
  });

  it("rejects empty layer lists and bad tiles", () => {
    expect(() => patternDeclarations([], paint)).toThrow(RangeError);
    expect(() =>
      patternSvg(
        [{ image: { kind: "radial", at: { x: 0, y: 0 }, stops: [] }, tile: { w: 0, h: 5 } }],
        paint,
        5,
        5,
      ),
    ).toThrow(RangeError);
  });
});

describe("bandStops", () => {
  it("lays hard bands out from 0", () => {
    expect(
      bandStops(
        [
          ["a", 2],
          [null, 8],
        ],
        false,
      ),
    ).toEqual([
      { ink: "a", at: 0 },
      { ink: "a", at: 2 },
      { ink: null, at: 2 },
      { ink: null, at: 10 },
    ]);
  });

  it("splits the first band around 0 for soft edges", () => {
    const stops = bandStops(
      [
        ["a", 4, 0.5],
        ["b", 6],
      ],
      true,
    );
    expect(stops[0]).toEqual({ ink: "a", at: 0, alpha: 0.5 });
    expect(stops.at(-1)).toEqual({ ink: "a", at: 10, alpha: 0.5 });
    expect(stops.map((s) => s.at)).toEqual([0, 1.5, 2.5, 7.5, 8.5, 10]);
  });

  it("returns nothing for no bands", () => {
    expect(bandStops([], true)).toEqual([]);
  });
});
