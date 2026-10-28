/**
 * M4c-AP02: Favicon generator. Variants, the icon pack (files, manifest,
 * head snippet, favicon.svg), logos (sanitised, tinted, local), colours of
 * variants and the brand palette, and the render budget.
 */
import { contrastRatio, createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { applyBrandPalette } from "../brand-palette";
import { createRenderContext } from "../render";
import { clearSvgAssetCache } from "../svg-asset";
import {
  faviconGeneratorTool as tool,
  faviconHeadSnippet,
  faviconManifest,
  faviconSvgFile,
  faviconThemeColor,
  iconPackFiles,
  type FaviconParams,
} from "./index";

const render = (p: FaviconParams, size = 512): string => {
  if (tool.render.kind !== "svg") throw new Error("svg tool expected");
  return tool.render.render(p, createRenderContext(1, { width: size, height: size }));
};

const d = tool.defaults;

// The package compiles without the DOM lib; Node has `atob` all the same.
const atob = (globalThis as unknown as { atob(data: string): string }).atob;

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==";

describe("favicon-generator render", () => {
  it("keeps its logo on the device", () => {
    expect(tool.localParams).toEqual(["logo"]);
  });

  it("shows the dark colours only in the dark variant with dark mode on", () => {
    const dark = render({ ...d, variant: "dark", darkMode: true });
    expect(dark).toContain(d.darkFill);
    expect(dark).not.toContain(d.fillColor);
    // Without dark mode the dark variant is the standard icon (an advisory explains why).
    expect(render({ ...d, variant: "dark" })).toBe(render(d));
    expect(
      tool.advisories?.(
        { ...d, variant: "dark" },
        createRenderContext(1, { width: 512, height: 512 }),
      ),
    ).toEqual([{ id: "dark-off", messageKey: "tools.favicon-generator.advisories.darkOff" }]);
  });

  it("draws the apple and maskable variants full bleed and opaque", () => {
    for (const variant of ["apple", "maskable"] as const) {
      const svg = render({ ...d, variant, fill: "transparent", corner: "circle" });
      expect(svg).toContain(`<path d="M0 0H512V512H0Z" fill="${d.splash}"/>`);
      expect(svg).not.toContain("clip-path");
    }
  });

  it("falls back to the text without a logo", () => {
    expect(render({ ...d, content: "image" })).toBe(render(d));
  });

  it("draws a library shape", () => {
    expect(render({ ...d, content: "shape", shape: "heart" })).toMatch(
      /<path transform="translate\(256 256\)/,
    );
  });

  it("sanitises SVG logos again, recolours them per scheme and embeds them as images", () => {
    clearSvgAssetCache();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><script>alert(1)</script><rect width="20" height="10" fill="#123456" onclick="x()"/></svg>';
    const logo = { kind: "svg" as const, svg, width: 20, height: 10, name: "logo.svg" };
    const plain = render({ ...d, content: "image", logo });
    expect(plain).toContain('<image x="');
    // Content box 72 % of 512 (padding 14 %), the 2:1 logo fills its width.
    expect(plain).toContain('width="368.64" height="184.32"');
    const href = /href="data:image\/svg\+xml;base64,([^"]+)"/.exec(plain)?.[1] ?? "";
    const embedded = atob(href);
    expect(embedded).not.toContain("script");
    expect(embedded).not.toContain("onclick");
    expect(embedded).toContain("#123456");

    const tinted = faviconSvgFile({ ...d, content: "image", logo, logoTint: true, darkMode: true });
    const hrefs = [...tinted.matchAll(/href="data:image\/svg\+xml;base64,([^"]+)"/g)].map((m) =>
      atob(m[1] ?? ""),
    );
    expect(hrefs).toHaveLength(2);
    expect(hrefs[0]).toContain(d.color);
    expect(hrefs[1]).toContain(d.darkColor);
  });

  it("tints raster logos with a filter", () => {
    const logo = { kind: "raster" as const, href: PNG_1PX, width: 1, height: 1, name: "logo.png" };
    expect(render({ ...d, content: "image", logo })).not.toContain("<filter");
    const svg = render({ ...d, content: "image", logo, logoTint: true });
    expect(svg).toContain(`<feFlood flood-color="${d.color}"/>`);
    expect(svg).toContain(`href="${PNG_1PX}"`);
  });

  it("renders every preset and variant quickly", () => {
    const clock = (globalThis as unknown as { performance: { now(): number } }).performance;
    for (const preset of tool.presets) {
      for (const variant of ["standard", "dark", "apple", "maskable"] as const) {
        const start = clock.now();
        render({ ...preset.params, variant }, 1024);
        // Locally well under 1 ms; the budget only catches blow-ups on shared runners.
        expect(clock.now() - start).toBeLessThan(100);
      }
    }
  });
});

describe("favicon-generator icon pack", () => {
  it("lists the files with their sizes and variants", () => {
    const files = iconPackFiles({ ...d, variant: "maskable" });
    expect(files.map((f) => f.path)).toEqual([
      "favicon.ico",
      "favicon.svg",
      "apple-touch-icon.png",
      "icon-192.png",
      "icon-512.png",
      "icon-512-maskable.png",
      "site.webmanifest",
      "head-snippet.html",
    ]);
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(byPath["favicon.ico"]).toMatchObject({ kind: "ico", sizes: [16, 32, 48] });
    // The variant in the editor never leaks into the pack.
    expect(byPath["favicon.ico"]).toMatchObject({ params: { variant: "standard" } });
    expect(byPath["icon-192.png"]).toMatchObject({ width: 192, params: { variant: "standard" } });
    expect(byPath["apple-touch-icon.png"]).toMatchObject({
      width: 180,
      height: 180,
      params: { variant: "apple" },
    });
    expect(byPath["icon-512-maskable.png"]).toMatchObject({ params: { variant: "maskable" } });
  });

  it("writes a valid manifest with a maskable icon and escaped names", () => {
    const manifest = JSON.parse(
      faviconManifest({ ...d, appName: 'Café "Zürich" <3', shortName: "Café" }),
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      name: 'Café "Zürich" <3',
      short_name: "Café",
      theme_color: d.fillColor,
      background_color: d.splash,
      display: "standalone",
    });
    expect(manifest.icons).toEqual([
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
    // Without names the text names the app.
    expect(JSON.parse(faviconManifest(d))).toMatchObject({ name: "M", short_name: "M" });
  });

  it("writes the head tags, with two theme colours in dark mode", () => {
    const html = faviconHeadSnippet({ ...d, shortName: '<b>"x"' });
    expect(html).toContain('<link rel="icon" href="/favicon.ico" sizes="32x32">');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest">');
    expect(html).toContain('content="&lt;b&gt;&quot;x&quot;"');
    expect(html).toContain(`<meta name="theme-color" content="${d.fillColor}">`);
    const dark = faviconHeadSnippet({ ...d, darkMode: true });
    expect(dark).toContain('media="(prefers-color-scheme: light)"');
    expect(dark).toContain(`content="${d.darkFill}" media="(prefers-color-scheme: dark)"`);
  });

  it("derives the theme colour from the fill", () => {
    expect(faviconThemeColor(d)).toBe(d.fillColor);
    expect(faviconThemeColor({ ...d, fill: "gradient", gradient: ["#ABCDEF", "#000000"] })).toBe(
      "#abcdef",
    );
    expect(faviconThemeColor({ ...d, fill: "transparent" })).toBe(d.splash);
    const dark = faviconHeadSnippet({ ...d, fill: "transparent", darkMode: true });
    expect(dark).toContain(`content="${d.darkColor}" media="(prefers-color-scheme: dark)"`);
  });

  it("derives the pattern colour per scheme", () => {
    const light = render({ ...d, fill: "pattern" });
    const dark = render({ ...d, fill: "pattern", variant: "dark", darkMode: true });
    const ink = (svg: string) => /<pattern [^>]+><[^>]+fill="(#[0-9a-f]{6})"/.exec(svg)?.[1];
    expect(ink(light)).toMatch(/^#/);
    expect(ink(light)).not.toBe(d.fillColor);
    expect(ink(dark)).not.toBe(ink(light));
  });

  it("makes favicon.svg adaptive only in dark mode", () => {
    expect(faviconSvgFile(d)).not.toContain("prefers-color-scheme");
    const svg = faviconSvgFile({ ...d, darkMode: true });
    expect(svg).toContain("@media (prefers-color-scheme:dark)");
    expect(svg).toContain(d.darkFill);
    expect(svg).toContain('viewBox="0 0 512 512"');
  });
});

describe("favicon-generator colours", () => {
  it("rolls a readable foreground and keeps the content", () => {
    for (let s = 0; s < 40; s++) {
      const out = tool.randomize(createRng(s), { ...d, text: "Q", content: "text" }, new Set());
      expect(out.text).toBe("Q");
      expect(out.content).toBe("text");
      expect(contrastRatio(out.fillColor, out.color)).toBeGreaterThanOrEqual(4.5);
      expect(out.gradient.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("rolls a new shape only for shape content", () => {
    const shapes = new Set(
      Array.from(
        { length: 10 },
        (_, s) => tool.randomize(createRng(s), { ...d, content: "shape" }, new Set()).shape,
      ),
    );
    expect(shapes.size).toBeGreaterThan(1);
    expect(tool.randomize(createRng(1), d, new Set()).shape).toBe(d.shape);
  });

  it("maps a brand palette to fill, readable colour and gradient", () => {
    const result = applyBrandPalette(tool, d, ["#0f766e", "#99f6e4", "#f59e0b"], new Set());
    const out = result?.params as FaviconParams;
    expect(out.fillColor).toBe("#0f766e");
    expect(out.gradient).toEqual(["#0f766e", "#99f6e4", "#f59e0b"]);
    expect(contrastRatio(out.fillColor, out.color)).toBeGreaterThanOrEqual(4.5);
  });
});
