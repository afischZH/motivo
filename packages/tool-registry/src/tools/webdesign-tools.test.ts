/**
 * W3 web design tools: fluid type scale, section divider and Open Graph
 * image (docs/TOOLS.md M1 to M3).
 */
import { createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { hasLocalContent, withoutDerivedParams } from "../image-input";
import { createRenderContext } from "../render";
import { renderStatic } from "../testing";
import type { AnyToolDefinition } from "../types";
import { fluidTypeScaleTool, type FluidTypeScaleParams } from "./fluid-type-scale";
import { ogImageTool, type OgImageParams } from "./og-image";
import { sectionDividerTool, type SectionDividerParams } from "./section-divider";

function extra(
  tool: AnyToolDefinition,
  id: string,
  params: unknown,
  width: number,
  height: number,
) {
  const e = tool.extraExports?.find((x) => x.id === id);
  if (!e) throw new Error(`missing extra export ${id}`);
  return e.render(params as never, createRenderContext(1, { width, height }));
}

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("fluid-type-scale", () => {
  const p = fluidTypeScaleTool.defaults;

  it("exports CSS variables, utility classes and a Tailwind v4 theme with the same values", () => {
    const css = extra(fluidTypeScaleTool, "css-variables", p, 1280, 960);
    expect(css).toContain(":root {");
    expect(css).toContain("--step-0: clamp(1rem, 0.9511rem + 0.2174vw, 1.125rem);");
    expect(css.match(/--step-/g)).toHaveLength(8);
    const classes = extra(fluidTypeScaleTool, "utility-classes", p, 1280, 960);
    expect(classes).toContain(".step--1 {\n  font-size: var(--step--1);\n}");
    const theme = extra(
      fluidTypeScaleTool,
      "tailwind-theme",
      { ...p, naming: "tshirt" } satisfies FluidTypeScaleParams,
      1280,
      960,
    );
    expect(theme).toContain("@theme {");
    expect(theme).toContain("--text-base: clamp(1rem, 0.9511rem + 0.2174vw, 1.125rem);");
    expect(theme).toContain("--text-xs:");
    expect(theme).toContain('class="text-4xl"');
  });

  it("sanitises the prefix and falls back per naming", () => {
    const css = (prefix: string, naming: FluidTypeScaleParams["naming"]) =>
      extra(fluidTypeScaleTool, "css-variables", { ...p, prefix, naming }, 1280, 960);
    expect(css("Font Size!", "steps")).toContain("--font-size-0:");
    expect(css("", "steps")).toContain("--step-0:");
    expect(css("", "tshirt")).toContain("--text-base:");
    expect(css("};body{x:y", "steps")).toContain("--body-x-y-0:");
  });

  it("warns when a step grows too much for 200 % zoom", () => {
    const ctx = createRenderContext(1, { width: 1280, height: 960 });
    expect(fluidTypeScaleTool.advisories?.(p, ctx)).toEqual([]);
    const loud = fluidTypeScaleTool.advisories?.({ ...p, minBase: 12, maxBase: 30 }, ctx);
    expect(loud?.map((a) => a.id)).toEqual(["zoom"]);
    expect(loud?.[0]?.values?.limit).toBe("2.5");
  });

  it("shows every step in the specimen at the preview width", () => {
    const svg = renderStatic(fluidTypeScaleTool, p, 1, { width: 1280, height: 960 }) as string;
    expect(svg.match(/>--step-/g)).toHaveLength(8);
    expect(svg).toContain(">1280px<");
  });
});

describe("section-divider", () => {
  const p = sectionDividerTool.defaults;

  it("embeds inline SVG with a responsive height in the HTML example", () => {
    const html = extra(sectionDividerTool, "html-example", p, 1440, 120);
    expect(html).toContain('viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"');
    expect(html).not.toContain('width="1440"');
    expect(html).toContain("height: clamp(48px, 8.333vw, 120px);");
    expect(html).toContain("bottom: -1px;");
    const top = extra(sectionDividerTool, "html-example", { ...p, position: "top" }, 1440, 120);
    expect(top).toContain("top: -1px;");
  });

  it("writes Tailwind classes without spaces inside arbitrary values", () => {
    const tw = extra(sectionDividerTool, "tailwind", p, 1440, 120);
    expect(tw).toContain("h-[clamp(48px,8.333vw,120px)]");
    expect(tw).toContain("bottom-[-1px]");
  });

  it("uses a fixed height when the smallest height is the full height", () => {
    const html = extra(sectionDividerTool, "html-example", { ...p, minHeight: 100 }, 1440, 120);
    expect(html).toContain("height: 120px;");
  });

  it("keeps colours and placement on a new variant", () => {
    const current: SectionDividerParams = { ...p, color: "#123456", position: "top", invert: true };
    for (let s = 0; s < 20; s++) {
      const next = sectionDividerTool.randomize(createRng(s), current, new Set());
      expect(next.color).toBe("#123456");
      expect(next.position).toBe("top");
      expect(next.invert).toBe(true);
    }
  });
});

describe("og-image", () => {
  const p = ogImageTool.defaults;
  const ctx = createRenderContext(1, { width: 1200, height: 630 });
  const picture = {
    kind: "raster" as const,
    href: PNG,
    width: 1600,
    height: 900,
    name: "hero.png",
  };

  it("renders every backdrop deterministically", () => {
    for (const backdrop of ["solid", "gradient", "mesh", "blurry", "waves", "pattern"] as const) {
      const a = renderStatic(ogImageTool, { ...p, backdrop }, 7, { width: 1200, height: 630 });
      expect(a).toBe(
        renderStatic(ogImageTool, { ...p, backdrop }, 7, { width: 1200, height: 630 }),
      );
      expect(a).toContain("Ship beautiful");
    }
  });

  it("puts the user's picture over the motif and keeps it out of share links", () => {
    const withPicture: OgImageParams = { ...p, backgroundImage: picture };
    const svg = renderStatic(ogImageTool, withPicture, 1, { width: 1200, height: 630 }) as string;
    expect(svg).toContain(`href="${PNG}"`);
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(hasLocalContent(ogImageTool, withPicture)).toBe(true);
    expect(withoutDerivedParams(ogImageTool, withPicture).backgroundImage).toBeNull();
  });

  it("writes meta tags with escaped text and the image size", () => {
    const tags = extra(
      ogImageTool,
      "meta-tags",
      { ...p, title: `A "quoted" <title> & more` },
      1200,
      630,
    );
    expect(tags).toContain(
      '<meta property="og:title" content="A &quot;quoted&quot; &lt;title&gt; &amp; more">',
    );
    expect(tags).toContain('<meta property="og:image:width" content="1200">');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image">');
    const empty = extra(ogImageTool, "meta-tags", { ...p, subtitle: "", site: "" }, 1200, 630);
    expect(empty).not.toContain("og:description");
    expect(empty).not.toContain("og:site_name");
  });

  it("hints at cut text, an unchecked picture and weak contrast", () => {
    const ids = (q: OgImageParams) => ogImageTool.advisories?.(q, ctx).map((a) => a.id);
    expect(ids(p)).toEqual([]);
    expect(ids({ ...p, title: "word ".repeat(28), titleSize: 16 })).toContain("truncated");
    expect(ids({ ...p, backgroundImage: picture, panel: "none" })).toEqual(["picture-contrast"]);
    expect(ids({ ...p, backgroundImage: picture, panel: "card", panelOpacity: 80 })).toEqual([]);
    expect(
      ids({
        ...p,
        backdrop: "solid",
        background: "#ffffff",
        panel: "none",
        inkAuto: false,
        ink: "#dddddd",
      }),
    ).toEqual(["text-contrast"]);
  });

  it("chooses readable text automatically", () => {
    const light: OgImageParams = { ...p, backdrop: "solid", background: "#fafaf9", panel: "none" };
    expect(renderStatic(ogImageTool, light, 1, { width: 1200, height: 630 })).toContain(
      'fill="#111827"',
    );
    expect(ogImageTool.advisories?.(light, ctx)).toEqual([]);
  });

  it("keeps text, layout and pictures on a new variant", () => {
    const current: OgImageParams = {
      ...p,
      title: "Mine",
      layout: "split",
      backgroundImage: picture,
    };
    const next = ogImageTool.randomize(createRng(3), current, new Set());
    expect(next.title).toBe("Mine");
    expect(next.layout).toBe("split");
    expect(next.backgroundImage).toBe(picture);
  });
});
