/**
 * M1-AP09: SVG Waves (docs/TOOLS.md D3). Stacked wave layers with colours
 * blended across the palette.
 */
import { WAVE_DIRECTIONS, randomPalette, wavesSvg } from "@motivo/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "svg-waves";

const schema = visualParamsSchema.extend({
  layers: z.int().min(1).max(5),
  points: z.int().min(2).max(16),
  amplitude: z.number().min(0).max(1),
  smoothness: z.number().min(0).max(1),
  coverage: z.number().min(0.1).max(1),
  direction: z.enum(WAVE_DIRECTIONS),
});

export type SvgWavesParams = z.output<typeof schema>;

const defaults: SvgWavesParams = {
  background: "#ffffff",
  palette: ["#90e0ef", "#023e8a"],
  layers: 3,
  points: 6,
  amplitude: 0.6,
  smoothness: 1,
  coverage: 0.6,
  direction: "up",
};

const preset = (id: string, params: Partial<SvgWavesParams>): Preset<SvgWavesParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const svgWavesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1920, height: 1080 },
  presets: [
    preset("tide", { palette: ["#caf0f8", "#0077b6", "#03045e"], layers: 4 }),
    preset("dunes", {
      palette: ["#f6bd60", "#e76f51"],
      background: "#fefae0",
      points: 4,
      amplitude: 0.8,
      coverage: 0.5,
    }),
    preset("aurora", {
      palette: ["#80ffdb", "#5390d9", "#7400b8"],
      background: "#0b090a",
      direction: "down",
      layers: 5,
      amplitude: 0.9,
      coverage: 0.8,
    }),
    preset("shallows", { palette: ["#b7e4c7", "#40916c"], layers: 2, points: 10, amplitude: 0.35 }),
    preset("ridges", {
      palette: ["#adb5bd", "#212529"],
      background: "#f8f9fa",
      layers: 5,
      points: 9,
      smoothness: 0,
      amplitude: 0.8,
    }),
    preset("storm", {
      palette: ["#8d99ae", "#2b2d42"],
      background: "#edf2f4",
      layers: 4,
      points: 12,
      amplitude: 1,
      smoothness: 0.7,
    }),
    preset("ribbon", {
      palette: ["#ff006e", "#ffbe0b"],
      background: "transparent",
      layers: 1,
      points: 5,
      coverage: 0.35,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: [
      "layers",
      "points",
      "amplitude",
      "smoothness",
      "coverage",
      "direction",
      "palette",
      "background",
    ],
    params: {
      layers: { group: "shape" },
      points: { group: "shape" },
      amplitude: { group: "shape", step: 0.01 },
      smoothness: { group: "shape", step: 0.01 },
      coverage: { group: "shape", step: 0.01 },
      direction: {
        group: "shape",
        optionLabelKeys: optionLabels(ID, "direction", WAVE_DIRECTIONS),
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const next: SvgWavesParams = {
      background: current.background,
      palette: randomPalette(rng, rng.int(2, 3)),
      layers: rng.int(1, 5),
      points: rng.int(3, 12),
      amplitude: roundTo(rng.float(0.2, 1), 2),
      smoothness: rng.bool(0.8) ? roundTo(rng.float(0.6, 1), 2) : roundTo(rng.float(0, 0.6), 2),
      coverage: roundTo(rng.float(0.3, 0.8), 2),
      direction: current.direction,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      return wavesSvg({ ...p, colors: p.palette, width, height, rng });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  gating: {},
});
