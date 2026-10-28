/**
 * Collection items as tool designs: every curated gradient and palette
 * opens in several tools (CSS Gradient, Mesh, Blurry, Striped, the colour
 * tools) with its colours filled in. The params start from the tool's own
 * defaults, so the editor shows the tool's usual look with our colours.
 * The same designs feed the editor links (share hash `#d=`), the inline
 * CSS previews, the static thumbnail SVGs under `/motifs/<toolId>/` and the
 * OG images: one render path per tool. Server only, build time.
 */
import { tailwindTheme, toCssName } from "@musterli/engine";
import { createRenderContext, registry, type AnyToolDefinition } from "@musterli/tool-registry";

import { STATIC_SEED, designSvg, toolSize, type StaticDesign } from "@/lib/seo/motifs";

import { findGradient, curatedGradients, type CuratedGradient } from "./gradients";
import { curatedPalettes, findPalette, type CuratedPalette } from "./palettes";

export const CSS_GRADIENT_TOOL = "css-gradient";
export const PALETTE_TOOL = "palette-generator";

/** Tools a gradient opens in; the first one is its home tool. */
export const GRADIENT_VARIANT_TOOLS = [
  CSS_GRADIENT_TOOL,
  "mesh-gradient",
  "blurry-gradient",
  "striped-gradient",
] as const;

/** Colour tools a palette (or a gradient's colours) opens in. */
export const PALETTE_TOOLS = ["palette-generator", "tints-shades", "tailwind-palette"] as const;

/** Gradient tools a palette opens in. */
export const PALETTE_GRADIENT_TOOLS = [
  CSS_GRADIENT_TOOL,
  "mesh-gradient",
  "blurry-gradient",
] as const;

export type VariantToolId =
  (typeof GRADIENT_VARIANT_TOOLS)[number] | (typeof PALETTE_TOOLS)[number];

/** How a variant is previewed: live CSS, a static SVG file, or not at all. */
export type VariantThumb = "css" | "svg" | "none";

export interface CollectionVariant {
  toolId: VariantToolId;
  design: StaticDesign;
  thumb: VariantThumb;
}

/** Prefix of a collection design id, also its motif file name: `gradient-alpenglow`. */
export const designIdOf = (kind: "gradient" | "palette", itemId: string) => `${kind}-${itemId}`;

const PALETTE_SLOTS = 8;

export function collectionTool(id: string): AnyToolDefinition {
  const found = registry.get(id);
  if (!found) throw new Error(`collections: tool ${id} is not registered`);
  return found;
}

function design(toolId: string, id: string, overrides: Record<string, unknown>): StaticDesign {
  return { id, params: { ...collectionTool(toolId).defaults, ...overrides }, seed: STATIC_SEED };
}

/** Background plus blobs for Mesh and Blurry: first colour as canvas, all colours as blobs. */
function softParams(colors: readonly string[]) {
  return { background: colors[0], palette: [...colors] };
}

/** Palette Generator slots: the colours first, the tool's defaults after them. */
function paletteSlots(colors: readonly string[]): Record<string, unknown> {
  const defaults = collectionTool("palette-generator").defaults;
  const slots: Record<string, unknown> = { count: colors.length };
  for (let i = 0; i < PALETTE_SLOTS; i++) {
    const key = `color${i + 1}`;
    slots[key] = colors[i] ?? defaults[key];
  }
  return slots;
}

function colourToolVariants(
  id: string,
  colors: readonly string[],
  accent: string,
): CollectionVariant[] {
  return [
    { toolId: "palette-generator", design: design("palette-generator", id, paletteSlots(colors)) },
    { toolId: "tints-shades", design: design("tints-shades", id, { base: accent }) },
    { toolId: "tailwind-palette", design: design("tailwind-palette", id, { base: accent }) },
  ].map((v) => ({ ...v, toolId: v.toolId as VariantToolId, thumb: "none" as const }));
}

/** The most colourful stop of a gradient (base for the colour scales). */
function gradientAccent(gradient: CuratedGradient): string {
  let best = 0;
  gradient.stops.forEach(([, c], i) => {
    if (c > (gradient.stops[best]?.[1] ?? 0)) best = i;
  });
  return gradient.colors[best] ?? gradient.colors[0] ?? "#000000";
}

export function gradientVariants(gradient: CuratedGradient): {
  gradient: CollectionVariant[];
  colour: CollectionVariant[];
} {
  const id = designIdOf("gradient", gradient.id);
  const [centerX, centerY] = gradient.center ?? [50, 50];
  const colors = gradient.colors;
  return {
    gradient: [
      {
        toolId: CSS_GRADIENT_TOOL,
        thumb: "css",
        design: design(CSS_GRADIENT_TOOL, id, {
          palette: [...colors],
          type: gradient.type ?? "linear",
          angle: gradient.angle ?? 135,
          centerX,
          centerY,
          loop: gradient.loop ?? false,
        }),
      },
      {
        toolId: "mesh-gradient",
        thumb: "svg",
        design: design("mesh-gradient", id, softParams(colors)),
      },
      {
        toolId: "blurry-gradient",
        thumb: "svg",
        design: design("blurry-gradient", id, softParams(colors)),
      },
      {
        toolId: "striped-gradient",
        thumb: "svg",
        design: design("striped-gradient", id, { palette: [...colors] }),
      },
    ],
    colour: colourToolVariants(id, colors, gradientAccent(gradient)),
  };
}

export function paletteVariants(palette: CuratedPalette): {
  gradient: CollectionVariant[];
  colour: CollectionVariant[];
} {
  const id = designIdOf("palette", palette.id);
  const colors = palette.colors;
  return {
    gradient: [
      {
        toolId: CSS_GRADIENT_TOOL,
        thumb: "css",
        design: design(CSS_GRADIENT_TOOL, id, { palette: [...colors], type: "linear", angle: 135 }),
      },
      {
        toolId: "mesh-gradient",
        thumb: "svg",
        design: design("mesh-gradient", id, softParams(colors)),
      },
      {
        toolId: "blurry-gradient",
        thumb: "svg",
        design: design("blurry-gradient", id, softParams(colors)),
      },
    ],
    colour: colourToolVariants(id, colors, colors[palette.accent] ?? colors[0] ?? "#000000"),
  };
}

/** The design of a curated gradient in the CSS Gradient tool (its preview and code). */
export function gradientDesign(gradient: CuratedGradient): StaticDesign {
  const first = gradientVariants(gradient).gradient[0];
  if (!first) throw new Error(`collections: no design for ${gradient.id}`);
  return first.design;
}

export interface CssCode {
  css: string;
  tailwind: string;
  /** React inline style: the first value of each property (the sRGB fallback). */
  style: Readonly<Record<string, string>>;
}

/** Turns `prop: value;` lines into a React style; repeated properties keep the first value. */
export function cssToStyle(css: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const line of css.split("\n")) {
    const match = /^\s*([a-z-]+)\s*:\s*(.+?);?\s*$/.exec(line);
    if (!match) continue;
    const [, prop = "", value = ""] = match;
    const key = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    if (!(key in style)) style[key] = value;
  }
  return style;
}

/** CSS and Tailwind code of a CSS Gradient design, rendered by the tool itself. */
export function cssGradientCode(gradientDesign: StaticDesign): CssCode {
  const t = collectionTool(CSS_GRADIENT_TOOL);
  const ctx = createRenderContext(gradientDesign.seed, toolSize(t));
  // Collection designs start from the tool's defaults (checked by the schema test).
  const params = gradientDesign.params as Parameters<typeof t.randomize>[1];
  if (t.render.kind !== "css") throw new Error("collections: css-gradient must render CSS");
  const css = t.render.render(params, ctx).css;
  const tailwind = t.extraExports?.find((e) => e.id === "tailwind")?.render(params, ctx) ?? "";
  return { css, tailwind, style: cssToStyle(css) };
}

/**
 * Every collection design of a tool that has a static SVG thumbnail, for
 * `app/motifs/[toolId]/[file]/route.ts`.
 */
export function collectionMotifs(toolId: string): StaticDesign[] {
  const fromGradients = curatedGradients().flatMap((g) => gradientVariants(g).gradient);
  const fromPalettes = curatedPalettes().flatMap((p) => paletteVariants(p).gradient);
  return [...fromGradients, ...fromPalettes]
    .filter((v) => v.thumb === "svg" && v.toolId === toolId)
    .map((v) => v.design);
}

export function findCollectionMotif(toolId: string, designId: string): StaticDesign | undefined {
  const [kind, ...rest] = designId.split("-");
  const itemId = rest.join("-");
  const variants =
    kind === "gradient"
      ? (() => {
          const g = findGradient(itemId);
          return g ? gradientVariants(g).gradient : [];
        })()
      : kind === "palette"
        ? (() => {
            const p = findPalette(itemId);
            return p ? paletteVariants(p).gradient : [];
          })()
        : [];
  return variants.find((v) => v.thumb === "svg" && v.toolId === toolId)?.design;
}

/** SVG of a collection design in a tool (thumbnails, OG images). */
export function collectionSvg(toolId: string, d: StaticDesign): string | undefined {
  return designSvg(collectionTool(toolId), d);
}

export interface PaletteCode {
  cssVariables: string;
  tailwind: string;
}

/**
 * Code of a palette: the Palette Generator's own CSS variables export, plus
 * a Tailwind CSS v4 theme in OKLCH named after the palette (engine helper).
 */
export function paletteCode(palette: CuratedPalette): PaletteCode {
  const variant = paletteVariants(palette).colour.find((v) => v.toolId === "palette-generator");
  const t = collectionTool("palette-generator");
  const ctx = createRenderContext(STATIC_SEED, toolSize(t));
  const params = (variant?.design.params ?? t.defaults) as Parameters<typeof t.randomize>[1];
  const cssVariables =
    t.extraExports?.find((e) => e.id === "css-variables")?.render(params, ctx) ?? "";
  const named = palette.colors.map((color, i) => ({ name: String(i + 1), color }));
  return { cssVariables, tailwind: tailwindTheme(toCssName(palette.id, "palette"), named) };
}
