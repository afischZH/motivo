/**
 * W3: Section dividers (docs/TOOLS.md M2). The edge between two website
 * sections: waves, arcs, a slant, peaks, an arrow, clouds or steps as one
 * SVG that stretches to any width. Code exports place it as inline SVG with
 * a responsive height; the image exports are the same SVG.
 */
import {
  DIVIDER_COUNTED,
  DIVIDER_COUNT_MAX,
  DIVIDER_LAYERS_MAX,
  DIVIDER_POSITIONS,
  DIVIDER_SHAPES,
  formatNumber,
  sectionDividerBody,
  sectionDividerSvg,
  type SectionDividerOptions,
} from "@musterli/engine";
import * as z from "zod";
import { backgroundSchema, colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext, ToolSizePreset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "section-divider";

const schema = z.object({
  shape: z.enum(DIVIDER_SHAPES),
  position: z.enum(DIVIDER_POSITIONS),
  count: z.int().min(1).max(DIVIDER_COUNT_MAX),
  layers: z.int().min(1).max(DIVIDER_LAYERS_MAX),
  flip: z.boolean(),
  invert: z.boolean(),
  /** Colour of the neighbouring section (the shape). */
  color: colorSchema,
  background: backgroundSchema,
  /** Smallest height of the responsive code export, percent of the design height. */
  minHeight: z.int().min(10).max(100),
});

export type SectionDividerParams = z.output<typeof schema>;

const defaults: SectionDividerParams = {
  shape: "wave",
  position: "bottom",
  count: 2,
  layers: 1,
  flip: false,
  invert: false,
  color: "#4f46e5",
  background: "transparent",
  minHeight: 40,
};

const preset = (
  id: string,
  params: Partial<SectionDividerParams>,
): Preset<SectionDividerParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const size = (id: string, width: number, height: number): ToolSizePreset => ({
  id,
  width,
  height,
  nameKey: `tools.${ID}.sizes.${id}`,
});

const optionsOf = (p: SectionDividerParams, ctx: RenderContext): SectionDividerOptions => ({
  ...p,
  width: ctx.width,
  height: ctx.height,
});

const f = (v: number) => formatNumber(v, 3);

/** Height as CSS: grows with the viewport like the width does, between `minHeight` % and the design height. */
export function dividerHeightCss(p: SectionDividerParams, ctx: RenderContext): string {
  const max = Math.round(ctx.height);
  const min = Math.max(1, Math.round((ctx.height * p.minHeight) / 100));
  if (min >= max) return `${max}px`;
  return `clamp(${min}px, ${f((ctx.height / ctx.width) * 100)}vw, ${max}px)`;
}

/** Inline SVG for a page: no pixel size (CSS sizes it), hidden from assistive tech. */
function inlineSvg(p: SectionDividerParams, ctx: RenderContext, cls: string): string {
  const w = formatNumber(ctx.width, 2);
  const h = formatNumber(ctx.height, 2);
  return (
    `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
    `${sectionDividerBody(optionsOf(p, ctx))}</svg>`
  );
}

const edge = (p: SectionDividerParams) => (p.position === "top" ? "top" : "bottom");

function htmlExample(p: SectionDividerParams, ctx: RenderContext): string {
  return [
    `<section class="hero">`,
    `  <!-- your content -->`,
    `  ${inlineSvg(p, ctx, "section-divider")}`,
    `</section>`,
    ``,
    `<style>`,
    `  .hero {`,
    `    position: relative;`,
    `  }`,
    `  .section-divider {`,
    `    position: absolute;`,
    `    left: 0;`,
    `    /* -1px hides the hairline gap that subpixel rounding can leave */`,
    `    ${edge(p)}: -1px;`,
    `    display: block;`,
    `    width: 100%;`,
    `    height: ${dividerHeightCss(p, ctx)};`,
    `    pointer-events: none;`,
    `  }`,
    `</style>`,
    ``,
  ].join("\n");
}

function tailwindExample(p: SectionDividerParams, ctx: RenderContext): string {
  const height = dividerHeightCss(p, ctx).replace(/ /g, "");
  const classes = `pointer-events-none absolute inset-x-0 ${edge(p)}-[-1px] block h-[${height}] w-full`;
  return [
    `<section class="relative">`,
    `  <!-- your content -->`,
    `  ${inlineSvg(p, ctx, classes)}`,
    `</section>`,
    ``,
  ].join("\n");
}

export const sectionDividerTool = defineTool({
  id: ID,
  version: 1,
  // Primary css-effects: a page element with code, not a backdrop (no "in context" view).
  category: ["css-effects", "backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1440, height: 120 },
  sizePresets: [
    size("slim", 1440, 64),
    size("regular", 1440, 120),
    size("tall", 1440, 240),
    size("mobile", 390, 60),
  ],
  presets: [
    preset("wave", {}),
    preset("layered-waves", { layers: 3, count: 3, color: "#0ea5e9" }),
    preset("arc", { shape: "curve", count: 1, color: "#111827" }),
    preset("slant", { shape: "tilt", color: "#f97316" }),
    preset("arrow", { shape: "arrow", color: "#0f172a", invert: true, background: "#f8fafc" }),
    preset("mountains", { shape: "peaks", count: 5, layers: 2, color: "#166534" }),
    preset("clouds", { shape: "clouds", count: 9, color: "#ffffff", background: "#93c5fd" }),
    preset("stairs", { shape: "steps", count: 6, color: "#7c3aed", flip: true }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.colors, COMMON_GROUPS.layout],
    order: [
      "shape",
      "count",
      "layers",
      "position",
      "flip",
      "invert",
      "color",
      "background",
      "minHeight",
    ],
    params: {
      shape: {
        group: "shape",
        kind: "thumbnails",
        optionLabelKeys: optionLabels(ID, "shape", DIVIDER_SHAPES),
        optionPreview(value, p) {
          const svg = sectionDividerSvg({
            ...p,
            shape: value as SectionDividerParams["shape"],
            count: DIVIDER_COUNTED.has(value as SectionDividerParams["shape"])
              ? Math.min(p.count, 4)
              : 1,
            width: 96,
            height: 48,
          });
          return { svg };
        },
      },
      count: {
        group: "shape",
        step: 1,
        visibleWhen: (p) => DIVIDER_COUNTED.has(p.shape),
      },
      layers: { group: "shape", step: 1 },
      position: {
        group: "layout",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "position", DIVIDER_POSITIONS),
      },
      flip: { group: "layout" },
      invert: { group: "layout" },
      color: { group: "colors" },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      minHeight: { group: "layout", step: 1, unit: "%", advanced: true },
    },
  },
  randomize(rng, current, locks) {
    // A new shape and rhythm; colours and placement stay.
    const shape = rng.pick(DIVIDER_SHAPES);
    const next: SectionDividerParams = {
      ...current,
      shape,
      count:
        shape === "clouds" ? rng.int(5, 12) : shape === "steps" ? rng.int(3, 8) : rng.int(1, 5),
      layers: rng.int(1, DIVIDER_LAYERS_MAX),
      flip: rng.bool(),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors, current) {
    return { color: colors[0] ?? current.color };
  },
  render: {
    kind: "svg",
    render: (p, ctx) => sectionDividerSvg(optionsOf(p, ctx)),
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "html-example",
      labelKey: EXTRA_EXPORT_LABELS.htmlExample,
      language: "html",
      render: htmlExample,
    },
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render: tailwindExample,
    },
  ],
});
