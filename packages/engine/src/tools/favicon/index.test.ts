import { describe, expect, it } from "vitest";
import { mixHex } from "../../color";
import { shapePath } from "../../shapes";
import {
  FAVICON_PATTERNS,
  MASKABLE_CONTENT_MAX,
  PATTERN_MIX,
  faviconLayout,
  faviconOutline,
  faviconSvg,
  squirclePath,
  type FaviconOptions,
} from "./index";

const options = (patch: Partial<FaviconOptions> = {}): FaviconOptions => ({
  width: 512,
  height: 512,
  variant: "standard",
  scheme: "light",
  content: { kind: "text", text: "M", font: "sans", weight: 700, size: 70 },
  colors: {
    foreground: "#ffffff",
    background: "#4f46e5",
    darkForeground: "#111827",
    darkBackground: "#a5b4fc",
    appBackground: "#f8fafc",
  },
  backgroundType: "solid",
  gradient: { colors: ["#f97316", "#db2777"], type: "linear", angle: 135 },
  pattern: { kind: "dots", color: "#ffffff", density: 6 },
  padding: 15,
  corner: "rounded",
  radius: 22,
  ...patch,
});

describe("faviconLayout", () => {
  it("centres the icon square in the shorter edge", () => {
    const l = faviconLayout({
      width: 800,
      height: 400,
      variant: "standard",
      padding: 0,
      corner: "square",
    });
    expect(l).toMatchObject({ x: 200, y: 0, size: 400 });
    expect(l.content).toEqual({ x: 200, y: 0, size: 400 });
  });

  it("applies the padding per side and caps it", () => {
    const l = faviconLayout({
      width: 100,
      height: 100,
      variant: "standard",
      padding: 10,
      corner: "circle",
    });
    expect(l.content).toEqual({ x: 10, y: 10, size: 80 });
    const capped = faviconLayout({
      width: 100,
      height: 100,
      variant: "standard",
      padding: 90,
      corner: "circle",
    });
    expect(capped.content.size).toBeCloseTo(20);
  });

  it("keeps maskable content inside the safe zone and makes it full bleed", () => {
    const l = faviconLayout({
      width: 512,
      height: 512,
      variant: "maskable",
      padding: 0,
      corner: "circle",
    });
    expect(l.content.size).toBeCloseTo(512 * MASKABLE_CONTENT_MAX);
    // The content square's corners lie on the safe circle (radius 40 %).
    const half = l.content.size / 2;
    expect(Math.hypot(half, half)).toBeCloseTo(512 * 0.4);
    expect(l.corner).toBe("square");
    expect(l.opaque).toBe(true);
    // A larger padding than the safe zone is kept.
    const small = faviconLayout({
      width: 512,
      height: 512,
      variant: "maskable",
      padding: 30,
      corner: "square",
    });
    expect(small.content.size).toBeCloseTo(512 * 0.4);
  });

  it("makes the apple variant full bleed and opaque", () => {
    const l = faviconLayout({
      width: 180,
      height: 180,
      variant: "apple",
      padding: 12,
      corner: "circle",
    });
    expect(l.corner).toBe("square");
    expect(l.opaque).toBe(true);
    expect(l.content.size).toBeCloseTo(180 * 0.76);
  });
});

describe("faviconOutline", () => {
  const layout = faviconLayout({
    width: 100,
    height: 100,
    variant: "standard",
    padding: 0,
    corner: "square",
  });

  it("draws every corner style as closed path data", () => {
    for (const corner of ["square", "rounded", "squircle", "circle"] as const) {
      const d = faviconOutline({ ...layout, corner }, 20);
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
      expect(d).not.toMatch(/NaN|Infinity/);
    }
    expect(faviconOutline({ ...layout, corner: "rounded" }, 20)).toContain("A20 20 0 0 1");
    expect(faviconOutline({ ...layout, corner: "rounded" }, 0)).toBe("M0 0H100V100H0Z");
  });

  it("squircle stays inside the square and bulges past the circle", () => {
    const d = squirclePath(50, 50, 50);
    const nums = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(nums.length).toBe(96);
    for (const [x, y] of nums) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    }
    // At 45° a superellipse with n = 5 reaches 2^(-1/5) ≈ 0.87 of the half edge, a circle 0.71.
    const diag = nums[12] as number[];
    expect(Math.hypot((diag[0] ?? 0) - 50, (diag[1] ?? 0) - 50) / 50).toBeGreaterThan(1.2);
  });
});

describe("faviconSvg", () => {
  it("renders text centred, escaped and in a system font", () => {
    const svg = faviconSvg(
      options({ content: { kind: "text", text: "<&>", font: "mono", weight: 600, size: 80 } }),
    );
    expect(svg).toContain("&lt;&amp;&gt;");
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain("ui-monospace");
    expect(svg).toContain('font-weight="600"');
    expect(svg).toContain('x="256" y="256"');
  });

  it("shrinks several characters to fit", () => {
    const size = (text: string) => {
      const m = /font-size="([\d.]+)"/.exec(
        faviconSvg(
          options({ content: { kind: "text", text, font: "sans", weight: 700, size: 70 } }),
        ),
      );
      return Number(m?.[1]);
    };
    expect(size("AB")).toBeLessThan(size("A"));
    expect(size("ABCD")).toBeLessThan(size("AB"));
  });

  it("draws nothing for empty text", () => {
    const svg = faviconSvg(
      options({ content: { kind: "text", text: "", font: "sans", weight: 700, size: 70 } }),
    );
    expect(svg).not.toContain("<text");
  });

  it("places a library shape in the content box", () => {
    const svg = faviconSvg(
      options({ content: { kind: "shape", path: shapePath("star") }, padding: 0 }),
    );
    expect(svg).toContain('transform="translate(256 256) scale(5.12)"');
  });

  it("fits a picture with its aspect ratio and tints it on request", () => {
    const href = "data:image/png;base64,AAAA";
    const svg = faviconSvg(
      options({
        padding: 0,
        corner: "square",
        content: { kind: "image", href, aspect: 2, tint: true },
      }),
    );
    expect(svg).toContain('<image x="0" y="128" width="512" height="256"');
    expect(svg).toContain('<feFlood flood-color="#ffffff"/>');
    expect(svg).toMatch(/filter="url\(#ft[a-z0-9]+\)"/);
  });

  it("clips the content to a visible outline only", () => {
    expect(faviconSvg(options({ corner: "circle" }))).toContain("clip-path=");
    expect(faviconSvg(options({ corner: "square" }))).not.toContain("clip-path=");
    expect(faviconSvg(options({ corner: "circle", backgroundType: "transparent" }))).not.toContain(
      "clip-path=",
    );
  });

  it("draws gradients with perceptual midpoints and every pattern", () => {
    const linear = faviconSvg(options({ backgroundType: "gradient" }));
    expect(linear).toContain("<linearGradient");
    expect((linear.match(/<stop /g) ?? []).length).toBe(4);
    expect(
      faviconSvg(
        options({
          backgroundType: "gradient",
          gradient: { colors: ["#000000", "#ffffff"], type: "radial", angle: 0 },
        }),
      ),
    ).toContain("<radialGradient");
    for (const kind of FAVICON_PATTERNS) {
      const svg = faviconSvg(
        options({ backgroundType: "pattern", pattern: { kind, color: "#ff0000", density: 4 } }),
      );
      expect(svg).toContain('<pattern id="fp');
      expect(svg).toContain('width="128" height="128"');
      expect(svg).toContain('fill="#ff0000"');
    }
  });

  it("derives the pattern colour per scheme when none is given", () => {
    const pattern = { kind: "grid" as const, density: 4 };
    const light = faviconSvg(options({ backgroundType: "pattern", pattern }));
    const dark = faviconSvg(options({ backgroundType: "pattern", pattern, scheme: "dark" }));
    const ink = (svg: string) => /<pattern [^>]+><[^>]+fill="(#[0-9a-f]{6})"/.exec(svg)?.[1];
    expect(ink(light)).toBe(mixHex("#4f46e5", "#ffffff", PATTERN_MIX, "oklab"));
    expect(ink(dark)).toBe(mixHex("#a5b4fc", "#111827", PATTERN_MIX, "oklab"));
  });

  it("fills a transparent background only in opaque variants", () => {
    expect(faviconSvg(options({ backgroundType: "transparent" }))).not.toContain("#f8fafc");
    for (const variant of ["apple", "maskable"] as const) {
      const svg = faviconSvg(options({ backgroundType: "transparent", variant }));
      expect(svg).toContain('fill="#f8fafc"');
      expect(svg).toContain('d="M0 0H512V512H0Z"');
    }
  });

  it("switches colours for the dark scheme", () => {
    const svg = faviconSvg(options({ scheme: "dark" }));
    expect(svg).toContain('fill="#a5b4fc"');
    expect(svg).toContain('fill="#111827"');
    expect(svg).not.toContain("#4f46e5");
  });

  it("holds both schemes behind a media query when adaptive, defs once", () => {
    const svg = faviconSvg(
      options({ scheme: "adaptive", backgroundType: "gradient", corner: "circle" }),
    );
    expect(svg).toContain("@media (prefers-color-scheme:dark)");
    expect(svg).toContain('<g class="l">');
    expect(svg).toContain('<g class="d">');
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic", () => {
    expect(faviconSvg(options())).toBe(faviconSvg(options()));
  });
});
