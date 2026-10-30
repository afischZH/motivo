/**
 * Clip-path generator (docs/TOOLS.md M4). Cuts an element (gradient or the
 * user's picture) into a polygon, star, blob, ellipse or an element with a
 * wavy, slanted, pointed or notched edge. Code exports: CSS `clip-path` in
 * percent (follows the element's size), an SVG `<clipPath>` in
 * `objectBoundingBox` units for smooth curves, and Tailwind.
 *
 * The picture is a local param: never in share links.
 */
import {
  CLIP_COUNTED,
  CLIP_DEPTHED,
  CLIP_DEPTH_MAX,
  CLIP_ROTATED,
  CLIP_SHAPES,
  CLIP_SIDED,
  CLIP_SIDES,
  CLIP_SIDES_MAX,
  CLIP_SIDES_MIN,
  CLIP_WAVES_MAX,
  clipPathCss,
  clipPathSvg,
  clipPathSvgSnippet,
  clipShape,
  createRng,
  type ClipShape,
  type ClipShapeOptions,
} from "@musterli/engine";
import * as z from "zod";
import {
  PHOTO_ASSET_RASTER_MAX_EDGE,
  backgroundSchema,
  paletteSchema,
  photoAssetSchema,
} from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import { imageAssetHref } from "../svg-asset";
import type { Preset, RenderContext } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "clip-path";

const schema = z.object({
  shape: z.enum(CLIP_SHAPES),
  sides: z.int().min(CLIP_SIDES_MIN).max(CLIP_SIDES_MAX),
  innerRadius: z.int().min(5).max(95),
  rotation: z.int().min(0).max(359),
  randomness: z.int().min(0).max(100),
  waves: z.int().min(1).max(CLIP_WAVES_MAX),
  depth: z.int().min(0).max(CLIP_DEPTH_MAX),
  side: z.enum(CLIP_SIDES),
  palette: paletteSchema,
  gradientAngle: z.int().min(0).max(359),
  background: backgroundSchema,
  showBox: z.boolean(),
  image: photoAssetSchema.nullable(),
});

export type ClipPathParams = z.output<typeof schema>;

const defaults: ClipPathParams = {
  shape: "polygon",
  sides: 6,
  innerRadius: 50,
  rotation: 0,
  randomness: 40,
  waves: 3,
  depth: 15,
  side: "bottom",
  palette: ["#6366f1", "#ec4899"],
  gradientAngle: 135,
  background: "transparent",
  showBox: true,
  image: null,
};

const preset = (id: string, params: Partial<ClipPathParams>): Preset<ClipPathParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/**
 * The blob draws from the design's rng, so the shape follows the seed (the
 * space bar gives a new blob). A fresh stream per call keeps the CSS export
 * identical to the preview.
 */
function shapeOf(p: ClipPathParams, ctx: Pick<RenderContext, "rng">): ClipShape {
  return clipShape(optionsOf(p, ctx));
}

function optionsOf(p: ClipPathParams, ctx: Pick<RenderContext, "rng">): ClipShapeOptions {
  return { ...p, rng: ctx.rng };
}

/** Declarations for the element, the same in CSS and in the HTML example. */
const declaration = (shape: ClipShape) => `clip-path: ${clipPathCss(shape)};`;

const SVG_ID = "musterli-clip";

/** Fixed seed of the small blob in the shape picker. */
const PREVIEW_SEED = 7;

export const clipPathTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects"],
  schema,
  defaults,
  defaultSize: { width: 800, height: 800 },
  localParams: ["image"],
  imageTargets: [{ param: "image" }],
  presets: [
    preset("hexagon", {}),
    preset("triangle", { sides: 3, palette: ["#f97316", "#facc15"] }),
    preset("star", {
      shape: "star",
      sides: 5,
      innerRadius: 45,
      palette: ["#facc15", "#f97316"],
    }),
    preset("burst", {
      shape: "star",
      sides: 12,
      innerRadius: 78,
      palette: ["#ef4444", "#f43f5e"],
    }),
    preset("blob", { shape: "blob", sides: 6, randomness: 45, palette: ["#14b8a6", "#6366f1"] }),
    preset("circle", { shape: "ellipse", palette: ["#0ea5e9", "#22d3ee"] }),
    preset("wave-bottom", {
      shape: "wave",
      waves: 3,
      depth: 12,
      palette: ["#1e3a8a", "#3b82f6"],
    }),
    preset("hero-slant", { shape: "slant", depth: 18, palette: ["#0f172a", "#334155"] }),
    preset("arrow-right", {
      shape: "chevron",
      side: "right",
      depth: 25,
      palette: ["#16a34a", "#84cc16"],
    }),
    preset("cut-corners", { shape: "notch", depth: 12, palette: ["#7c3aed", "#c026d3"] }),
    preset("speech-bubble", {
      shape: "bubble",
      depth: 18,
      palette: ["#2563eb", "#7c3aed"],
    }),
    preset("diamond", { sides: 4, palette: ["#e11d48", "#9333ea"] }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: [
      "shape",
      "sides",
      "innerRadius",
      "rotation",
      "randomness",
      "side",
      "waves",
      "depth",
      "image",
      "palette",
      "gradientAngle",
      "background",
      "showBox",
    ],
    params: {
      shape: {
        group: "shape",
        kind: "thumbnails",
        optionLabelKeys: optionLabels(ID, "shape", CLIP_SHAPES),
        optionPreview(value, p) {
          const svg = clipPathSvg({
            ...optionsOf(
              { ...p, shape: value as ClipPathParams["shape"] },
              { rng: createRng(PREVIEW_SEED) },
            ),
            width: 48,
            height: 48,
            colors: p.palette,
            gradientAngle: p.gradientAngle,
            background: "transparent",
            showBox: false,
            imageHref: null,
          });
          return { svg };
        },
      },
      sides: { group: "shape", step: 1, visibleWhen: (p) => CLIP_COUNTED.has(p.shape) },
      innerRadius: { group: "shape", step: 1, unit: "%", visibleWhen: (p) => p.shape === "star" },
      rotation: {
        group: "shape",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => CLIP_ROTATED.has(p.shape),
      },
      randomness: { group: "shape", step: 1, unit: "%", visibleWhen: (p) => p.shape === "blob" },
      side: {
        group: "shape",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "side", CLIP_SIDES),
        visibleWhen: (p) => CLIP_SIDED.has(p.shape),
      },
      waves: { group: "shape", step: 1, visibleWhen: (p) => p.shape === "wave" },
      depth: { group: "shape", step: 1, unit: "%", visibleWhen: (p) => CLIP_DEPTHED.has(p.shape) },
      image: {
        group: "colors",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.image.description`,
        image: { maxEdge: PHOTO_ASSET_RASTER_MAX_EDGE, photo: true },
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      gradientAngle: { group: "colors", kind: "angle", step: 1, unit: "°" },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      showBox: { group: "colors" },
    },
  },
  randomize(rng, current, locks) {
    // A new shape and its settings; colours and the picture stay.
    const shape = rng.pick(CLIP_SHAPES);
    const next: ClipPathParams = {
      ...current,
      shape,
      sides: rng.int(CLIP_SIDES_MIN, shape === "blob" ? 9 : CLIP_SIDES_MAX),
      innerRadius: rng.int(30, 80),
      rotation: rng.pick([0, 0, 15, 30, 45, 90]),
      randomness: rng.int(20, 70),
      waves: rng.int(1, 6),
      depth: rng.int(8, 30),
      side: rng.pick(CLIP_SIDES),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    const [first, second] = colors;
    if (!first) return {};
    return { palette: [first, second ?? first] };
  },
  render: {
    kind: "svg",
    render: (p, ctx) =>
      clipPathSvg({
        ...optionsOf(p, ctx),
        width: ctx.width,
        height: ctx.height,
        colors: p.palette,
        gradientAngle: p.gradientAngle,
        background: p.background,
        showBox: p.showBox,
        imageHref: p.image ? imageAssetHref(p.image) : null,
      }),
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "css",
      labelKey: EXTRA_EXPORT_LABELS.css,
      language: "css",
      render: (p, ctx) => `.clipped {\n  ${declaration(shapeOf(p, ctx))}\n}\n`,
    },
    {
      id: "svg-clip-path",
      labelKey: EXTRA_EXPORT_LABELS.svgClipPath,
      language: "html",
      render(p, ctx) {
        const shape = shapeOf(p, ctx);
        return [
          `<!-- Once per page, e.g. at the end of <body> -->`,
          clipPathSvgSnippet(shape, SVG_ID),
          ``,
          `<img class="clipped" src="your-image.jpg" alt="">`,
          ``,
          `<style>`,
          `  /* Smooth curves at any size; the element's box is the 0 to 1 range */`,
          `  .clipped {`,
          `    clip-path: url(#${SVG_ID});`,
          `  }`,
          `</style>`,
          ``,
        ].join("\n");
      },
    },
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render(p, ctx) {
        const value = clipPathCss(shapeOf(p, ctx)).replace(/ /g, "_");
        return `<img class="[clip-path:${value}]" src="your-image.jpg" alt="">\n`;
      },
    },
  ],
});
