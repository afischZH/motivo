/**
 * M4b-AP02: Low-Poly and Voronoi (docs/TOOLS.md K3). Delaunay triangles or
 * Voronoi cells over Poisson-disk or jittered grid points, coloured by a
 * gradient through the palette sampled at each face, with optional relief
 * shading, outlines, gaps and rounded corners.
 */
import {
  LOW_POLY_DISTRIBUTIONS,
  LOW_POLY_GRADIENTS,
  LOW_POLY_MODES,
  lowPolySvg,
  randomPalette,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, TRANSPARENT, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { AnimationSupport, Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "low-poly";

const schema = visualParamsSchema.extend({
  mode: z.enum(LOW_POLY_MODES),
  distribution: z.enum(LOW_POLY_DISTRIBUTIONS),
  /** Distance between points in percent of the shorter canvas edge. */
  spacing: z.number().min(1).max(30),
  /** Grid only: random offset of each point, 0 to 1 of the spacing. */
  jitter: z.number().min(0).max(1),
  gradient: z.enum(LOW_POLY_GRADIENTS),
  /** Linear gradient direction in degrees (CSS convention). */
  angle: z.number().min(0).max(360),
  /** Random lightness change per face, 0 to 1. */
  variance: z.number().min(0).max(1),
  /** Light and shadow on a random relief, 0 to 1. */
  lighting: z.number().min(0).max(1),
  /** Direction the light comes from, degrees (0 = top). */
  lightAngle: z.number().min(0).max(360),
  /** Outline width in px, 0 = none. */
  strokeWidth: z.number().min(0).max(8),
  strokeColor: colorSchema,
  strokeOpacity: z.number().min(0).max(1),
  /** Space between faces in px. */
  gap: z.number().min(0).max(24),
  /** Corner rounding in px. */
  rounding: z.number().min(0).max(40),
});

export type LowPolyParams = z.output<typeof schema>;

const defaults: LowPolyParams = {
  background: "#0f172a",
  palette: ["#1e3a8a", "#2563eb", "#38bdf8", "#e0f2fe"],
  mode: "delaunay",
  distribution: "poisson",
  spacing: 7,
  jitter: 0.5,
  gradient: "linear",
  angle: 135,
  variance: 0.25,
  lighting: 0.5,
  lightAngle: 315,
  strokeWidth: 0,
  strokeColor: "#ffffff",
  strokeOpacity: 0.35,
  gap: 0,
  rounding: 0,
};

const preset = (id: string, params: Partial<LowPolyParams>): Preset<LowPolyParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Seeds, colour cycling and drifting points (time). */
const LOW_POLY_ANIMATION = {
  sources: ["seeds", "colors", "time"],
} as const satisfies AnimationSupport<LowPolyParams>;

const isGrid = (p: LowPolyParams): boolean => p.distribution === "grid";
const hasOutline = (p: LowPolyParams): boolean => p.strokeWidth > 0;

export const lowPolyTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  presets: [
    preset("crystal", {}),
    preset("ember", {
      background: "#2b0a1e",
      palette: ["#fff1a8", "#ffb347", "#ff5e3a", "#8b1e3f", "#2b0a1e"],
      gradient: "radial",
      spacing: 6,
      lighting: 0.6,
      variance: 0.2,
    }),
    preset("glacier", {
      background: "#f0f9ff",
      palette: ["#f0f9ff", "#bae6fd", "#7dd3fc", "#0369a1"],
      distribution: "grid",
      jitter: 0.35,
      angle: 180,
      lighting: 0.7,
      lightAngle: 300,
      variance: 0.1,
    }),
    preset("wireframe", {
      background: "#0b0f19",
      palette: ["#0b1220", "#1f2937"],
      strokeWidth: 1,
      strokeColor: "#5eead4",
      strokeOpacity: 0.8,
      lighting: 0.2,
      variance: 0.1,
      spacing: 8,
    }),
    preset("mosaic", {
      background: "#fdf6ec",
      palette: ["#f4a261", "#e76f51", "#2a9d8f", "#264653"],
      mode: "voronoi",
      gradient: "mesh",
      gap: 6,
      rounding: 10,
      variance: 0.15,
      lighting: 0,
      spacing: 8,
    }),
    preset("stained-glass", {
      background: "#1b1b1b",
      palette: ["#ffbe0b", "#fb5607", "#ff006e", "#8338ec", "#3a86ff"],
      mode: "voronoi",
      gradient: "mesh",
      strokeWidth: 4,
      strokeColor: "#1b1b1b",
      strokeOpacity: 1,
      variance: 0.35,
      lighting: 0.3,
      spacing: 9,
    }),
    preset("cells", {
      background: "#081c15",
      palette: ["#d8f3dc", "#95d5b2", "#52b788", "#2d6a4f", "#081c15"],
      mode: "voronoi",
      angle: 30,
      strokeWidth: 1,
      strokeColor: "#081c15",
      strokeOpacity: 0.4,
      spacing: 4,
      lighting: 0.2,
    }),
    preset("dusk", {
      background: "#2e1065",
      palette: ["#2e1065", "#7c3aed", "#f472b6", "#fb923c"],
      gradient: "mesh",
      spacing: 10,
      lighting: 0.6,
      variance: 0.15,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.layout,
      COMMON_GROUPS.colors,
      { id: "lines", labelKey: `tools.${ID}.groups.lines` },
    ],
    order: [
      "mode",
      "distribution",
      "spacing",
      "jitter",
      "gap",
      "rounding",
      "gradient",
      "angle",
      "palette",
      "variance",
      "lighting",
      "lightAngle",
      "background",
      "strokeWidth",
      "strokeColor",
      "strokeOpacity",
    ],
    params: {
      mode: {
        group: "layout",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "mode", LOW_POLY_MODES),
      },
      distribution: {
        group: "layout",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "distribution", LOW_POLY_DISTRIBUTIONS),
      },
      spacing: { group: "layout", step: 0.5, unit: "%" },
      jitter: { group: "layout", step: 0.01, visibleWhen: isGrid },
      gap: { group: "layout", step: 0.5, unit: "px", advanced: true },
      rounding: { group: "layout", step: 0.5, unit: "px", advanced: true },
      gradient: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "gradient", LOW_POLY_GRADIENTS),
      },
      angle: {
        group: "colors",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.gradient === "linear",
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      variance: { group: "colors", step: 0.01 },
      lighting: { group: "colors", step: 0.01 },
      lightAngle: {
        group: "colors",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.lighting > 0,
      },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      strokeWidth: { group: "lines", step: 0.25, unit: "px" },
      strokeColor: { group: "lines", visibleWhen: hasOutline },
      strokeOpacity: { group: "lines", step: 0.01, visibleWhen: hasOutline },
    },
  },
  randomize(rng, current, locks) {
    const colors = randomPalette(rng, rng.int(3, 5));
    const next: LowPolyParams = {
      ...current,
      background:
        current.background === TRANSPARENT
          ? TRANSPARENT
          : (colors[colors.length - 1] ?? current.background),
      palette: colors,
      spacing: roundTo(rng.float(4, 12), 1),
      jitter: roundTo(rng.float(0.2, 0.8), 2),
      gradient: rng.pick(LOW_POLY_GRADIENTS),
      angle: rng.int(0, 359),
      variance: roundTo(rng.float(0.05, 0.4), 2),
      lighting: roundTo(rng.float(0, 0.8), 2),
      lightAngle: rng.int(0, 359),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height, t }) {
      return lowPolySvg({
        width,
        height,
        rng,
        background: p.background,
        colors: p.palette,
        mode: p.mode,
        distribution: p.distribution,
        spacing: (Math.min(width, height) * p.spacing) / 100,
        jitter: p.jitter,
        gradient: p.gradient,
        angle: p.angle,
        variance: p.variance,
        lighting: p.lighting,
        lightAngle: p.lightAngle,
        strokeWidth: p.strokeWidth,
        strokeColor: p.strokeColor,
        strokeOpacity: p.strokeOpacity,
        gap: p.gap,
        rounding: p.rounding,
        ...(t === undefined ? {} : { t }),
      });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  animation: LOW_POLY_ANIMATION,
});
