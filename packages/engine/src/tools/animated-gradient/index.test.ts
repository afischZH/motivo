import { describe, expect, it } from "vitest";
import {
  ANIMATED_GRADIENT_CLASS,
  ANIMATED_GRADIENT_MODES,
  ANIMATED_GRADIENT_RULES,
  type AnimatedGradientOptions,
  animatedGradientBlobs,
  animatedGradientCss,
  animatedGradientHtml,
  animatedGradientPreview,
  animatedGradientSvg,
  animatedGradientTailwind,
  animatedGradientTailwindTheme,
  animationStateAt,
  blobCore,
  panGeometry,
} from "./index";

const BASE: AnimatedGradientOptions = {
  mode: "pan",
  colors: ["#4f46e5", "#db2777", "#f59e0b"],
  background: "#0f172a",
  angle: 120,
  rotateShape: "conic",
  duration: 12,
  timing: "ease-in-out",
  direction: "normal",
  motion: 70,
  blur: 50,
  intensity: 80,
  width: 600,
  height: 400,
};

const withMode = (
  mode: AnimatedGradientOptions["mode"],
  extra: Partial<AnimatedGradientOptions> = {},
) => ({
  ...BASE,
  mode,
  ...extra,
});

describe("panGeometry", () => {
  it("travels along the gradient axis across the whole background", () => {
    expect(panGeometry({ angle: 90, motion: 100, direction: "normal" })).toEqual({
      size: 400,
      from: [0, 50],
      to: [100, 50],
    });
    expect(panGeometry({ angle: 180, motion: 10, direction: "normal" })).toEqual({
      size: 130,
      from: [50, 0],
      to: [50, 100],
    });
    const diagonal = panGeometry({ angle: 135, motion: 50, direction: "normal" });
    expect(diagonal.from).toEqual([0, 0]);
    expect(diagonal.to).toEqual([100, 100]);
  });

  it("swaps the ends for reverse", () => {
    const fwd = panGeometry({ angle: 120, motion: 70, direction: "normal" });
    const back = panGeometry({ angle: 120, motion: 70, direction: "reverse" });
    expect(back.from).toEqual(fwd.to);
    expect(back.to).toEqual(fwd.from);
  });
});

describe("animatedGradientBlobs", () => {
  it("is deterministic per seed and gives one blob per colour", () => {
    const a = animatedGradientBlobs(1, BASE);
    expect(a).toHaveLength(3);
    expect(animatedGradientBlobs(1, BASE)).toEqual(a);
    expect(animatedGradientBlobs(2, BASE)).not.toEqual(a);
    expect(a.map((b) => b.color)).toEqual(BASE.colors);
  });

  it("keeps the other blobs in place when a colour is added", () => {
    const three = animatedGradientBlobs(7, BASE);
    const four = animatedGradientBlobs(7, { ...BASE, colors: [...BASE.colors, "#22c55e"] });
    expect(four.slice(0, 3).map((b) => [b.left, b.top, b.size])).toEqual(
      three.map((b) => [b.left, b.top, b.size]),
    );
  });

  it("sizes blobs from the longer edge and scales the path with motion", () => {
    for (const b of animatedGradientBlobs(3, BASE)) {
      // 45 to 80 % of the longer edge (600), in percent of the width (600).
      expect(b.size).toBeGreaterThanOrEqual(45);
      expect(b.size).toBeLessThanOrEqual(80);
    }
    const tall = animatedGradientBlobs(3, { ...BASE, width: 400, height: 800 });
    for (const b of tall) expect(b.size).toBeGreaterThanOrEqual(90);
    const still = animatedGradientBlobs(3, { ...BASE, motion: 0 });
    for (const b of still) expect(b.path.every((v) => v === 0)).toBe(true);
    const far = animatedGradientBlobs(3, { ...BASE, motion: 100 });
    for (const b of far) {
      expect(Math.hypot(b.path[0], b.path[1])).toBeLessThanOrEqual(60.1);
      expect(Math.hypot(b.path[0], b.path[1])).toBeGreaterThanOrEqual(34.9);
    }
  });
});

describe("blobCore", () => {
  it("maps blur 0 to a solid core and 100 to a pure fade", () => {
    expect(blobCore(0)).toBe(70);
    expect(blobCore(50)).toBe(35);
    expect(blobCore(100)).toBe(0);
    expect(blobCore(140)).toBe(0);
  });
});

describe("animationStateAt", () => {
  it("starts at the beginning of the first segment", () => {
    for (const mode of ANIMATED_GRADIENT_MODES) {
      expect(animationStateAt(withMode(mode), 0)).toEqual({ segment: 0, progress: 0 });
    }
  });

  it("plays the pan there and back in one loop", () => {
    const o = withMode("pan", { timing: "linear" });
    expect(animationStateAt(o, 0.25).progress).toBeCloseTo(0.5, 9);
    expect(animationStateAt(o, 0.5).progress).toBeCloseTo(1, 9);
    expect(animationStateAt(o, 0.75).progress).toBeCloseTo(0.5, 9);
    // The timing function runs on the directed progress (Web Animations).
    const eased = withMode("pan", { timing: "ease-in" });
    expect(animationStateAt(eased, 0.75).progress).toBeCloseTo(
      animationStateAt(eased, 0.25).progress,
      9,
    );
  });

  it("splits shift and blobs into segments with the timing per segment", () => {
    const shift = withMode("shift", { timing: "ease-in-out" });
    expect(animationStateAt(shift, 1 / 6)).toEqual({
      segment: 0,
      progress: expect.closeTo(0.5, 6),
    });
    expect(animationStateAt(shift, 0.5).segment).toBe(1);
    const blobs = withMode("blobs", { timing: "linear" });
    expect(animationStateAt(blobs, 0.5)).toEqual({ segment: 1, progress: expect.closeTo(0.5, 9) });
  });

  it("runs backwards for reverse and wraps the loop time", () => {
    const o = withMode("rotate", { direction: "reverse", timing: "linear" });
    expect(animationStateAt(o, 0.25).progress).toBeCloseTo(0.75, 9);
    expect(animationStateAt(o, 1.25)).toEqual(animationStateAt(o, 0.25));
    expect(animationStateAt(o, Number.NaN)).toEqual(animationStateAt(o, 0));
  });
});

describe("animatedGradientSvg", () => {
  it.each(ANIMATED_GRADIENT_MODES)("%s: t = 0 is the calm state and later times move", (mode) => {
    const o = withMode(mode);
    const blobs = animatedGradientBlobs(1, o);
    const calm = animatedGradientSvg(o, blobs);
    expect(
      calm.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"'),
    ).toBe(true);
    expect(animatedGradientSvg(o, blobs, 0)).toBe(calm);
    expect(animatedGradientSvg(o, blobs, 0.3)).not.toBe(calm);
    expect(calm).not.toContain("foreignObject");
  });

  it("closes the loop for rotate, shift and blobs", () => {
    for (const mode of ["shift", "blobs"] as const) {
      const o = withMode(mode, { timing: "linear" });
      const blobs = animatedGradientBlobs(1, o);
      expect(animatedGradientSvg(o, blobs, 1)).toBe(animatedGradientSvg(o, blobs, 0));
    }
    // A full turn of the conic gradient draws the same wedges.
    const rotate = withMode("rotate", { direction: "reverse" });
    expect(animatedGradientSvg(rotate, [], 0)).toBe(
      animatedGradientSvg({ ...rotate, direction: "normal" }, [], 0),
    );
  });

  it("places the pan background like CSS background-position", () => {
    const o = withMode("pan", { angle: 90, motion: 100, timing: "linear" });
    // 400 % size: 2400 × 1600; at 0 % the image starts at the left edge.
    // Vertically centred: (400 - 1600) × 50 % = -600.
    expect(animatedGradientSvg(o, [], 0)).toContain('transform="translate(0 -600)"');
    // Halfway through the loop the pan reached 100 % 50 %: x = 600 - 2400.
    expect(animatedGradientSvg(o, [], 0.5)).toContain('transform="translate(-1800 -600)"');
  });

  it("shift mixes the slot colours in sRGB between keyframes", () => {
    const o = withMode("shift", { colors: ["#000000", "#ffffff"], timing: "linear" });
    // Quarter of the loop: halfway from (black, white) to (white, black).
    const svg = animatedGradientSvg(o, [], 0.25);
    expect(svg.match(/stop-color="#808080"/g)).toHaveLength(2);
  });

  it("draws blobs as soft circles with the intensity as opacity", () => {
    const o = withMode("blobs");
    const svg = animatedGradientSvg(o, animatedGradientBlobs(1, o));
    expect(svg.match(/<circle /g)).toHaveLength(3);
    expect(svg).toContain('opacity="0.8"');
    expect(svg).toContain('<stop offset="0.35" stop-color="#4f46e5"/>');
    expect(svg).toContain('stop-opacity="0"');
    const full = animatedGradientSvg({ ...o, intensity: 100 }, animatedGradientBlobs(1, o));
    expect(full).not.toContain(" opacity=");
  });
});

/** Replaces `var(--name)` with the value of `--name` in the declarations. */
function substitute(text: string, decls: readonly (readonly [string, string])[]): string {
  const vars = new Map(decls.filter(([p]) => p.startsWith("--")));
  return text.replace(/var\((--[a-z0-9-]+)\)/g, (m, name: string) => vars.get(name) ?? m);
}

/** The steps of one `@keyframes` block: selector -> declarations text. */
function keyframeSteps(css: string, name: string): string[] {
  const start = css.indexOf(`@keyframes ${name} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("\n}", start);
  return css
    .slice(start, end)
    .split("\n")
    .slice(1)
    .map((line) => line.trim());
}

describe("preview and export describe the same animation", () => {
  it("keeps the preview rules constant (no colours or positions)", () => {
    expect(ANIMATED_GRADIENT_RULES).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(ANIMATED_GRADIENT_RULES).not.toMatch(/\d%\s+\d/);
    expect(ANIMATED_GRADIENT_RULES).toContain("@keyframes musterli-ag-shift-6");
  });

  it("pan: the preview variables are the export keyframes", () => {
    const o = withMode("pan");
    const preview = animatedGradientPreview(o, []);
    const rules = keyframeSteps(ANIMATED_GRADIENT_RULES, "musterli-ag-pan").map((l) =>
      substitute(l, preview.declarations),
    );
    expect(keyframeSteps(animatedGradientCss(o, []), "gradient-pan")).toEqual(rules);
    expect(preview.motion).toEqual([
      ["animation", "musterli-ag-pan 12s ease-in-out infinite alternate"],
    ]);
  });

  it("shift: the preview keyframes resolve to the export colours", () => {
    const o = withMode("shift", { direction: "reverse" });
    const preview = animatedGradientPreview(o, []);
    const rules = keyframeSteps(ANIMATED_GRADIENT_RULES, "musterli-ag-shift-3").map((l) =>
      substitute(l, preview.declarations).replaceAll("--musterli-ag-c", "--gradient-color-"),
    );
    const css = animatedGradientCss(o, []);
    expect(keyframeSteps(css, "gradient-shift")).toEqual(rules);
    expect(css).toContain("animation: gradient-shift 12s ease-in-out infinite reverse;");
  });

  it("blobs: the boxes carry the export path and placement", () => {
    const o = withMode("blobs");
    const blobs = animatedGradientBlobs(1, o);
    const preview = animatedGradientPreview(o, blobs);
    const css = animatedGradientCss(o, blobs);
    preview.boxes.forEach((box, i) => {
      const b = blobs[i];
      if (!b) throw new Error("missing blob");
      expect(box.x).toBeCloseTo((b.left / 100) * o.width, 1);
      expect(box.width).toBeCloseTo((b.size / 100) * o.width, 1);
      expect(box.width).toBe(box.height);
      const x1 = box.declarations.find(([p]) => p === "--musterli-ag-x1")?.[1];
      expect(css).toContain(`--blob-x1: ${x1 ?? "?"};`);
      expect(box.motion).toEqual([["animation", "musterli-ag-float 12s ease-in-out infinite"]]);
    });
    expect(preview.motion).toEqual([]);
    expect(preview.declarations).toEqual([["background-color", "#0f172a"]]);
  });

  it("rotate: the angle variable and keyframes match", () => {
    const o = withMode("rotate", { angle: 0, rotateShape: "linear" });
    const preview = animatedGradientPreview(o, []);
    expect(preview.declarations).toContainEqual([
      "background-image",
      "linear-gradient(var(--musterli-ag-angle), #4f46e5, #db2777, #f59e0b)",
    ]);
    const css = animatedGradientCss(o, []);
    expect(css).toContain("background-image: linear-gradient(var(--gradient-angle), ");
    expect(css).toContain("to { --gradient-angle: 360deg; }");
    expect(css).toContain('syntax: "<angle>";');
  });
});

describe("code exports", () => {
  it.each(ANIMATED_GRADIENT_MODES)(
    "%s: CSS has a reduced motion rule and readable names",
    (mode) => {
      const o = withMode(mode);
      const blobs = animatedGradientBlobs(1, o);
      const css = animatedGradientCss(o, blobs);
      expect(css).toContain("@media (prefers-reduced-motion: reduce) {");
      expect(css).toContain("animation: none;");
      expect(css).toContain(`.${ANIMATED_GRADIENT_CLASS}`);
      expect(css).not.toContain("musterli");
      const html = animatedGradientHtml(o, blobs);
      expect(html).toContain("aspect-ratio: 600 / 400;");
      expect(html).toContain(`<div class="${ANIMATED_GRADIENT_CLASS}">`);
      expect((html.match(/class="blob"/g) ?? []).length).toBe(mode === "blobs" ? 3 : 0);
    },
  );

  it.each(ANIMATED_GRADIENT_MODES)("%s: Tailwind classes have no spaces inside values", (mode) => {
    const o = withMode(mode);
    const blobs = animatedGradientBlobs(1, o);
    const tw = animatedGradientTailwind(o, blobs);
    expect(tw).toContain("motion-reduce:animate-none");
    for (const [, classes] of tw.matchAll(/class="([^"]+)"/g)) {
      for (const c of (classes ?? "").split(" ")) expect(c).toMatch(/^[^\s]+$/);
    }
    const theme = animatedGradientTailwindTheme(o, blobs);
    expect(theme).toMatch(/^(@property[\s\S]*)?@theme \{\n {2}--animate-/m);
    expect(theme).toContain("  @keyframes ");
    expect(theme).not.toContain("musterli");
  });

  it("writes @property rules only where needed", () => {
    expect(animatedGradientCss(withMode("pan"), [])).not.toContain("@property");
    expect(animatedGradientCss(withMode("rotate"), [])).toContain("@property --gradient-angle");
    const shift = animatedGradientCss(withMode("shift"), []);
    expect(shift.match(/@property --gradient-color-\d/g)).toHaveLength(3);
    expect(shift).toContain("initial-value: #f59e0b;");
  });
});
