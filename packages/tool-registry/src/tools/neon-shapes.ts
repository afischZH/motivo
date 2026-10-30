/**
 * W5: Neon shapes (docs/TOOLS.md B6). Glowing outline shapes on a dark
 * ground; the glow is stacked strokes, not a filter, so the SVG stays
 * editable and renders the same at 8K.
 */
import {
  NEON_COUNT_MAX,
  NEON_COUNT_MIN,
  NEON_KINDS,
  neonSvg,
  oklchToHex,
  type Rng,
} from "@musterli/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels } from "./shared";

const ID = "neon-shapes";

const schema = visualParamsSchema.extend({
  kind: z.enum(NEON_KINDS),
  count: z.int().min(NEON_COUNT_MIN).max(NEON_COUNT_MAX),
  /** Shape size in percent of the shorter edge. */
  size: z.number().min(3).max(80),
  /** Random size variation in percent. */
  variance: z.number().min(0).max(100),
  /** Tube width in per mille of the shorter edge. */
  stroke: z.number().min(1).max(40),
  /** Glow strength in percent. */
  glow: z.number().min(0).max(100),
  /** White hot core inside the tubes. */
  core: z.boolean(),
  /** Coloured haze behind the shapes in percent. */
  haze: z.number().min(0).max(100),
});

export type NeonShapesParams = z.output<typeof schema>;

const defaults: NeonShapesParams = {
  background: "#0b0614",
  palette: ["#ff2bd6", "#00f0ff", "#ffe600"],
  kind: "mixed",
  count: 9,
  size: 25,
  variance: 50,
  stroke: 8,
  glow: 80,
  core: true,
  haze: 40,
};

const preset = (id: string, params: Partial<NeonShapesParams>): Preset<NeonShapesParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Bright, saturated tube colours spread round the hue wheel. */
function neonPalette(rng: Rng, count: number): string[] {
  const start = rng.float(0, 360);
  const step = rng.float(70, 150);
  return Array.from({ length: count }, (_, i) =>
    oklchToHex({ l: rng.float(0.72, 0.88), c: 0.25, h: (start + i * step) % 360 }),
  );
}

export const neonShapesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: [
    preset("arcade", {}),
    preset("sign", {
      palette: ["#ff3864", "#2de2e6"],
      kind: "rounds",
      count: 4,
      size: 45,
      variance: 40,
      stroke: 12,
      glow: 90,
      haze: 50,
    }),
    preset("geometry", {
      background: "#05050f",
      palette: ["#7df9ff", "#b388ff"],
      kind: "polygons",
      count: 12,
      size: 20,
      variance: 60,
      stroke: 6,
      glow: 70,
      haze: 25,
    }),
    preset("laser", {
      background: "#000000",
      palette: ["#39ff14", "#00e5ff"],
      kind: "lines",
      count: 16,
      size: 40,
      variance: 70,
      stroke: 4,
      glow: 85,
      core: false,
      haze: 10,
    }),
    preset("miami", {
      background: "#140022",
      palette: ["#ff6ec7", "#00d4ff", "#ffb86b"],
      count: 7,
      size: 30,
      stroke: 10,
      glow: 85,
      haze: 60,
    }),
    preset("soft", {
      background: "#1b1430",
      palette: ["#ffadf0", "#a0f0ff"],
      kind: "rounds",
      count: 6,
      size: 28,
      stroke: 14,
      glow: 55,
      core: false,
      haze: 35,
    }),
    preset("party", {
      background: "#090018",
      palette: ["#ff2bd6", "#00f0ff", "#ffe600", "#7cff4f", "#ff7a00"],
      count: 24,
      size: 12,
      variance: 60,
      stroke: 6,
      glow: 75,
      haze: 30,
    }),
    preset("minimal", {
      background: "#07070b",
      palette: ["#ff3df5", "#ff7ae9"],
      kind: "rounds",
      count: 1,
      size: 55,
      variance: 0,
      stroke: 14,
      glow: 100,
      haze: 45,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.shape,
      { id: "glow", labelKey: `tools.${ID}.groups.glow` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "kind",
      "count",
      "size",
      "variance",
      "stroke",
      "glow",
      "core",
      "haze",
      "palette",
      "background",
    ],
    params: {
      kind: { group: "shape", optionLabelKeys: optionLabels(ID, "kind", NEON_KINDS) },
      count: { group: "shape", step: 1 },
      size: { group: "shape", step: 1, unit: "%" },
      variance: { group: "shape", step: 1, unit: "%" },
      stroke: { group: "glow", step: 0.5, unit: "‰" },
      glow: { group: "glow", step: 1, unit: "%" },
      core: { group: "glow" },
      haze: { group: "glow", step: 1, unit: "%" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const next: NeonShapesParams = {
      background: oklchToHex({ l: rng.float(0.08, 0.18), c: 0.04, h: rng.float(0, 360) }),
      palette: neonPalette(rng, rng.int(2, 4)),
      kind: rng.pick(NEON_KINDS),
      count: rng.int(3, 18),
      size: rng.int(10, 45),
      variance: rng.int(0, 80),
      stroke: rng.int(4, 14),
      glow: rng.int(55, 100),
      core: rng.bool(0.7),
      haze: rng.int(0, 60),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      return neonSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        kind: p.kind,
        count: p.count,
        size: p.size / 100,
        variance: p.variance / 100,
        stroke: p.stroke / 1000,
        glow: p.glow / 100,
        core: p.core,
        haze: p.haze / 100,
        rng,
      });
    },
  },
  exports: ["png", "jpg", "webp", "svg"],
  animation: SEED_AND_COLOR_ANIMATION,
});
