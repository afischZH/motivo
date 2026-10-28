/**
 * M5-AP02: CMYK halftone (docs/TOOLS.md E3). The photo (or the demo
 * picture) separated into cyan, magenta, yellow and black with grey
 * component replacement, one halftone screen per ink at the classic angles
 * (editable), inks multiplied onto the paper, optionally out of register.
 * Render kind `image-effect` with an SVG export (`render.vector`,
 * docs/ARCHITECTURE.md 4.16).
 */
import {
  CMYK_CLASSIC_ANGLES,
  DEMO_PHOTO_SIZE,
  HALFTONE_SHAPES,
  applyCmykHalftone,
  cmykHalftoneSvg,
  demoPhoto,
  halftoneCellEstimate,
  type CmykHalftoneOptions,
} from "@musterli/effects";
import { hexToOklch, oklchToHex } from "@musterli/engine";
import * as z from "zod";
import { EFFECT_PHOTO_RASTER_MAX_EDGE, colorSchema, effectPhotoAssetSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext } from "../types";
import { COMMON_GROUPS, optionLabels, roundTo } from "./shared";

const ID = "cmyk-halftone";

/** Most shapes of an SVG export (all four plates together, about 1 MB). */
export const CMYK_SVG_MAX_SHAPES = 70_000;

const angleSchema = z.number().min(0).max(180);

const schema = z.object({
  /** The user's photo; `null` shows the demo picture. Local only. */
  photo: effectPhotoAssetSchema.nullable(),
  shape: z.enum(HALFTONE_SHAPES),
  /** Cell edge in design pixels. */
  cellSize: z.number().min(4).max(64),
  angleC: angleSchema,
  angleM: angleSchema,
  angleY: angleSchema,
  angleK: angleSchema,
  /** Grey component replacement, percent of the common grey printed in black. */
  gcr: z.number().min(0).max(100),
  /** Misregistration: how far cyan, magenta and yellow are shifted (design px). */
  offset: z.number().min(0).max(24),
  /** Direction of the cyan shift; magenta and yellow follow at +120° and +240°. */
  offsetAngle: z.number().min(0).max(360),
  cyan: colorSchema,
  magenta: colorSchema,
  yellow: colorSchema,
  black: colorSchema,
  paper: colorSchema,
  brightness: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  gamma: z.number().min(0.25).max(4),
});

export type CmykHalftoneParams = z.output<typeof schema>;

/** Process-like inks (own values, no colour system). */
const INKS = {
  cyan: "#00a0dc",
  magenta: "#e2007a",
  yellow: "#ffe600",
  black: "#1c1c1c",
} as const;

const defaults: CmykHalftoneParams = {
  photo: null,
  shape: "circle",
  cellSize: 10,
  angleC: CMYK_CLASSIC_ANGLES.c,
  angleM: CMYK_CLASSIC_ANGLES.m,
  angleY: CMYK_CLASSIC_ANGLES.y,
  angleK: CMYK_CLASSIC_ANGLES.k,
  gcr: 70,
  offset: 0,
  offsetAngle: 30,
  ...INKS,
  paper: "#fbf8f1",
  brightness: 0,
  contrast: 10,
  gamma: 1,
};

const preset = (id: string, params: Partial<CmykHalftoneParams>): Preset<CmykHalftoneParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Plate offsets in design pixels: C, M, Y around a circle, black stays (the key plate). */
export function cmykOffsets(p: CmykHalftoneParams, scale = 1): CmykHalftoneOptions["offsets"] {
  const at = (deg: number): readonly [number, number] => {
    const rad = ((p.offsetAngle + deg) * Math.PI) / 180;
    return [Math.cos(rad) * p.offset * scale, Math.sin(rad) * p.offset * scale];
  };
  return { c: at(0), m: at(120), y: at(240), k: [0, 0] };
}

/** Effect options for an input `scale` times the design size. */
export function cmykHalftoneOptions(p: CmykHalftoneParams, scale: number): CmykHalftoneOptions {
  return {
    cell: p.cellSize * scale,
    angles: { c: p.angleC, m: p.angleM, y: p.angleY, k: p.angleK },
    shape: p.shape,
    inks: { c: p.cyan, m: p.magenta, y: p.yellow, k: p.black },
    paper: p.paper,
    gcr: p.gcr / 100,
    offsets: cmykOffsets(p, scale),
    brightness: p.brightness,
    contrast: p.contrast,
    gamma: p.gamma,
  };
}

const scaleOf = (width: number, ctx: RenderContext): number => width / Math.max(1, ctx.width);

const byLightness = (colors: readonly string[]): string[] =>
  [...colors].sort((a, b) => hexToOklch(a).l - hexToOklch(b).l);

export const cmykHalftoneTool = defineTool({
  id: ID,
  version: 1,
  category: ["image-effects"],
  schema,
  defaults,
  defaultSize: { ...DEMO_PHOTO_SIZE },
  localParams: ["photo"],
  photoSource: { param: "photo", sample: demoPhoto },
  presets: [
    preset("classic", {}),
    preset("comic", { cellSize: 18, gcr: 100, contrast: 30, offset: 2 }),
    preset("misprint", { cellSize: 12, offset: 7, offsetAngle: 200, contrast: 15 }),
    preset("fine", { cellSize: 5, gcr: 50 }),
    preset("newsprint", {
      cellSize: 8,
      paper: "#e7e1d2",
      black: "#2a2723",
      gcr: 90,
      contrast: 20,
      offset: 1.5,
    }),
    preset("pastel", {
      cellSize: 14,
      cyan: "#7fd1f0",
      magenta: "#f48fc5",
      yellow: "#ffef8a",
      black: "#5d6475",
      paper: "#fffaf3",
      contrast: -10,
      brightness: 10,
    }),
    preset("squares", { shape: "square", cellSize: 12, contrast: 20 }),
  ],
  brandPalette(colors) {
    const sorted = byLightness(colors);
    const dark = sorted[0] ?? INKS.black;
    const light = sorted[sorted.length - 1] ?? defaults.paper;
    const middle = sorted.length > 2 ? sorted.slice(1, -1) : sorted;
    const pick = (i: number) => middle[i % middle.length] ?? dark;
    return { black: dark, paper: light, cyan: pick(0), magenta: pick(1), yellow: pick(2) };
  },
  randomize(rng, current, locks) {
    // Turning all screens together keeps the angles between them (no new moiré).
    const turn = rng.pick([0, 5, 10, 15, 20, 30]);
    const angle = (a: number) => roundTo((a + turn) % 180, 1);
    const paper = oklchToHex({
      l: rng.float(0.93, 0.985),
      c: rng.float(0, 0.03),
      h: rng.float(0, 360),
    });
    const next: CmykHalftoneParams = {
      ...current,
      angleC: angle(CMYK_CLASSIC_ANGLES.c),
      angleM: angle(CMYK_CLASSIC_ANGLES.m),
      angleY: angle(CMYK_CLASSIC_ANGLES.y),
      angleK: angle(CMYK_CLASSIC_ANGLES.k),
      offsetAngle: roundTo(rng.float(0, 360), 0),
      paper,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "image-effect",
    render(input, p, ctx) {
      return applyCmykHalftone(input, cmykHalftoneOptions(p, scaleOf(input.width, ctx)));
    },
    vector: {
      maxShapes: CMYK_SVG_MAX_SHAPES,
      shapes: (p, design) => 4 * halftoneCellEstimate(design.width, design.height, p.cellSize),
      render: (input, p, ctx) =>
        cmykHalftoneSvg(input, cmykHalftoneOptions(p, scaleOf(input.width, ctx)), ctx),
    },
  },
  exports: ["png", "jpg", "webp", "svg"],
  controls: {
    groups: [
      { id: "photo", labelKey: `tools.${ID}.groups.photo` },
      { id: "screen", labelKey: `tools.${ID}.groups.screen` },
      { id: "angles", labelKey: `tools.${ID}.groups.angles` },
      COMMON_GROUPS.colors,
      { id: "tone", labelKey: `tools.${ID}.groups.tone` },
    ],
    order: [
      "photo",
      "shape",
      "cellSize",
      "gcr",
      "offset",
      "offsetAngle",
      "angleC",
      "angleM",
      "angleY",
      "angleK",
      "cyan",
      "magenta",
      "yellow",
      "black",
      "paper",
      "brightness",
      "contrast",
      "gamma",
    ],
    params: {
      photo: {
        group: "photo",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.photo.description`,
        image: { maxEdge: EFFECT_PHOTO_RASTER_MAX_EDGE, photo: true, rasterOnly: true },
      },
      shape: {
        group: "screen",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "shape", HALFTONE_SHAPES),
      },
      cellSize: { group: "screen", step: 1, unit: "px" },
      gcr: { group: "screen", step: 1, unit: "%" },
      offset: { group: "screen", step: 0.5, unit: "px" },
      offsetAngle: { group: "screen", step: 1, unit: "°", visibleWhen: (p) => p.offset > 0 },
      angleC: { group: "angles", step: 1, unit: "°" },
      angleM: { group: "angles", step: 1, unit: "°" },
      angleY: { group: "angles", step: 1, unit: "°" },
      angleK: { group: "angles", step: 1, unit: "°" },
      cyan: { group: "colors" },
      magenta: { group: "colors" },
      yellow: { group: "colors" },
      black: { group: "colors" },
      paper: { group: "colors" },
      brightness: { group: "tone", step: 1 },
      contrast: { group: "tone", step: 1 },
      gamma: { group: "tone", step: 0.05 },
    },
  },
});
