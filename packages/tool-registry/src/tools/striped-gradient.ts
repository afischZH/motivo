/**
 * M3-AP07: Striped Gradients (docs/TOOLS.md C3). Vertical bands, each with
 * its own vertical gradient through the palette, slightly shifted against
 * each other; optional shading per band and grain.
 *
 * Render approach: rects and linear gradients only (no filter), grain is the
 * shared raster tile. One SVG for preview and export.
 */
import { STRIPES_MAX, STRIPES_MIN, randomPalette, stripedGradientSvg } from "@musterli/engine";
import * as z from "zod";
import { paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { gradientGrain } from "./grain";
import { COMMON_GROUPS, COMMON_LABELS } from "./shared";

const ID = "striped-gradient";

// No `background`: the bands always cover the canvas.
const schema = z.object({
  /** Gradient stops of every band, top to bottom. */
  palette: paletteSchema,
  stripes: z.int().min(STRIPES_MIN).max(STRIPES_MAX),
  /** Shift between the bands' gradients in percent of the height. */
  offset: z.number().min(0).max(100),
  /** Random variation of the band widths in percent. */
  variance: z.number().min(0).max(100),
  /** Light and shadow on every band in percent. */
  shading: z.number().min(0).max(100),
  /** Every second band runs the other way. */
  alternate: z.boolean(),
  /** Grain strength in percent (opacity of the grain layer). */
  grain: z.number().min(0).max(100),
});

export type StripedGradientParams = z.output<typeof schema>;

const defaults: StripedGradientParams = {
  palette: ["#ff7e5f", "#feb47b", "#86a8e7", "#5f2c82"],
  stripes: 8,
  offset: 30,
  variance: 0,
  shading: 20,
  alternate: false,
  grain: 0,
};

const preset = (
  id: string,
  params: Partial<StripedGradientParams>,
): Preset<StripedGradientParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const stripedGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["gradients", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("fluted", {
      palette: ["#caf0f8", "#48cae4", "#0077b6", "#03045e"],
      stripes: 16,
      offset: 15,
      shading: 55,
    }),
    preset("candy", {
      palette: ["#ffafcc", "#cdb4db", "#a2d2ff"],
      stripes: 6,
      offset: 60,
      shading: 0,
      alternate: true,
    }),
    preset("dusk", {
      palette: ["#0d1b2a", "#415a77", "#e0a458", "#f4d58d"],
      stripes: 10,
      offset: 40,
      variance: 50,
      shading: 25,
      grain: 10,
    }),
    preset("forest", {
      palette: ["#081c15", "#2d6a4f", "#95d5b2"],
      stripes: 24,
      offset: 25,
      variance: 70,
      shading: 35,
    }),
    preset("retro", {
      palette: ["#f94144", "#f8961e", "#f9c74f", "#90be6d", "#577590"],
      stripes: 5,
      offset: 80,
      shading: 10,
      grain: 12,
    }),
    preset("silk", {
      palette: ["#f8edeb", "#fcd5ce", "#9d8189"],
      stripes: 30,
      offset: 10,
      shading: 40,
      alternate: true,
    }),
    preset("ink", {
      palette: ["#000000", "#3a0ca3", "#4cc9f0"],
      stripes: 12,
      offset: 50,
      variance: 30,
      shading: 30,
      grain: 14,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.layout,
      { id: "effects", labelKey: `tools.${ID}.groups.effects` },
      COMMON_GROUPS.colors,
    ],
    order: ["stripes", "variance", "offset", "alternate", "shading", "grain", "palette"],
    params: {
      stripes: { group: "layout", step: 1 },
      variance: { group: "layout", step: 1, unit: "%" },
      offset: { group: "layout", step: 1, unit: "%" },
      alternate: { group: "layout" },
      shading: { group: "effects", step: 1, unit: "%" },
      grain: { group: "effects", step: 1, unit: "%" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
    },
  },
  randomize(rng, current, locks) {
    const next: StripedGradientParams = {
      palette: randomPalette(rng, rng.int(2, 5)),
      stripes: rng.int(4, 24),
      offset: rng.int(5, 70),
      variance: rng.bool(0.6) ? 0 : rng.int(10, 70),
      shading: rng.int(0, 50),
      alternate: rng.bool(0.3),
      // Grain is a deliberate finish: a new variant keeps it.
      grain: current.grain,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, seed, width, height }) {
      return stripedGradientSvg({
        width,
        height,
        colors: p.palette,
        stripes: p.stripes,
        offset: p.offset / 100,
        variance: p.variance / 100,
        shading: p.shading / 100,
        alternate: p.alternate,
        rng,
        grain: gradientGrain(seed, p.grain),
      });
    },
  },
  exports: ["png", "jpg", "webp", "svg", "css"],
});
