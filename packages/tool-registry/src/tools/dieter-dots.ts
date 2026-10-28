/**
 * M2-AP01: Dieter Dots (docs/TOOLS.md A3). Concentric rings of dots around
 * the canvas centre, like a perforated speaker grille.
 */
import { DIETER_COLOR_MODES, dieterDotsSvg, randomPalette } from "@motivo/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "dieter-dots";

const schema = visualParamsSchema.extend({
  rings: z.int().min(1).max(40),
  /** Dots on the first ring; ring i holds i times as many. */
  dotsPerRing: z.int().min(3).max(24),
  /** Distance between rings in percent of the shorter canvas edge. */
  ringSpacing: z.number().min(1).max(20),
  /** Dot diameter relative to the ring spacing. */
  scale: z.number().min(0.1).max(1),
  falloff: z.number().min(0).max(1),
  /** Extra rotation per ring in degrees. */
  twist: z.number().min(0).max(30),
  colorMode: z.enum(DIETER_COLOR_MODES),
});

export type DieterDotsParams = z.output<typeof schema>;

const defaults: DieterDotsParams = {
  background: "#e9e6df",
  palette: ["#2b2b2b", "#d9541e"],
  rings: 12,
  dotsPerRing: 6,
  ringSpacing: 4,
  scale: 0.5,
  falloff: 0,
  twist: 0,
  colorMode: "single",
};

const preset = (id: string, params: Partial<DieterDotsParams>): Preset<DieterDotsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const dieterDotsTool = defineTool({
  id: ID,
  version: 1,
  category: ["patterns"],
  schema,
  defaults,
  presets: [
    preset("grille", {
      background: "#c9c7c2",
      palette: ["#3a3a3a", "#d9541e"],
      rings: 16,
      ringSpacing: 3,
      scale: 0.55,
    }),
    preset("radar", {
      background: "#06140d",
      palette: ["#5cf28f", "#0f5c2c"],
      rings: 14,
      dotsPerRing: 8,
      ringSpacing: 3.5,
      scale: 0.35,
      colorMode: "gradient",
    }),
    preset("swirl", {
      background: "#fdf6ec",
      palette: ["#e4572e", "#29335c"],
      rings: 18,
      dotsPerRing: 5,
      ringSpacing: 2.8,
      scale: 0.6,
      twist: 9,
      colorMode: "gradient",
    }),
    preset("target", {
      background: "#ffffff",
      palette: ["#d7263d", "#1b998b"],
      rings: 10,
      dotsPerRing: 8,
      ringSpacing: 5,
      scale: 0.7,
      colorMode: "alternate",
    }),
    preset("ripple", {
      background: "#0e1a2b",
      palette: ["#8fd3fe", "#2d5d9f"],
      rings: 24,
      dotsPerRing: 4,
      ringSpacing: 2,
      scale: 0.8,
      falloff: 0.85,
      colorMode: "gradient",
    }),
    preset("sunburst", {
      background: "#2a1a12",
      palette: ["#ffd166", "#ef476f", "#7b2cbf"],
      rings: 12,
      dotsPerRing: 10,
      ringSpacing: 4,
      scale: 0.45,
      falloff: 0.4,
      twist: 4,
      colorMode: "gradient",
    }),
    preset("mono", {
      background: "#111111",
      palette: ["#f2f2f2", "#9a9a9a"],
      rings: 30,
      dotsPerRing: 6,
      ringSpacing: 1.6,
      scale: 0.4,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.layout, COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: [
      "rings",
      "dotsPerRing",
      "ringSpacing",
      "twist",
      "scale",
      "falloff",
      "colorMode",
      "palette",
      "background",
    ],
    params: {
      rings: { group: "layout" },
      dotsPerRing: { group: "layout" },
      ringSpacing: { group: "layout", step: 0.1, unit: "%" },
      twist: { group: "layout", step: 0.5, unit: "°" },
      scale: { group: "shape", step: 0.01 },
      falloff: { group: "shape", step: 0.01 },
      colorMode: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "colorMode", DIETER_COLOR_MODES),
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const rings = rng.int(6, 24);
    const next: DieterDotsParams = {
      background: rng.bool(0.5)
        ? current.background
        : (randomPalette(rng, 2)[0] ?? current.background),
      palette: randomPalette(rng, rng.int(2, 3)),
      rings,
      dotsPerRing: rng.int(4, 12),
      // Roughly fill the shorter edge: rings * spacing ~ 50 %.
      ringSpacing: roundTo(Math.min(Math.max((50 / rings) * rng.float(0.8, 1.2), 1), 20), 1),
      scale: roundTo(rng.float(0.3, 0.8), 2),
      falloff: rng.bool(0.6) ? 0 : roundTo(rng.float(0.2, 0.9), 2),
      twist: rng.bool(0.7) ? 0 : roundTo(rng.float(2, 15), 1),
      colorMode: rng.pick(DIETER_COLOR_MODES),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width, height }) {
      const ringSpacing = (Math.min(width, height) * p.ringSpacing) / 100;
      return dieterDotsSvg({ ...p, colors: p.palette, ringSpacing, width, height });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
});
