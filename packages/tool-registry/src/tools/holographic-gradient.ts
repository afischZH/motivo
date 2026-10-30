/**
 * W5: Holographic gradient (docs/TOOLS.md C5). Iridescent foil from a
 * mirrored band gradient and seeded ring layers in blend modes, with
 * creases, sheen and grain.
 *
 * Render approach: gradients and blend modes only (no filter), grain is the
 * shared raster tile. One SVG for preview and export.
 */
import {
  HOLO_BANDS_MAX,
  HOLO_BANDS_MIN,
  HOLO_LAYERS_MAX,
  holographicSvg,
  oklchToHex,
  type Rng,
} from "@musterli/engine";
import * as z from "zod";
import { paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { gradientGrain } from "./grain";
import { COMMON_GROUPS, COMMON_LABELS } from "./shared";

const ID = "holographic-gradient";

// No `background`: the foil always covers the canvas.
const schema = z.object({
  /** Foil colours, repeated across the canvas. */
  palette: paletteSchema,
  /** Direction of the bands in degrees. */
  angle: z.number().min(0).max(360),
  /** How often the colours repeat across the canvas. */
  bands: z.int().min(HOLO_BANDS_MIN).max(HOLO_BANDS_MAX),
  /** Ring layers on top of the bands. */
  layers: z.int().min(0).max(HOLO_LAYERS_MAX),
  /** Strength of the ring layers in percent. */
  rings: z.number().min(0).max(100),
  /** Soft white folds in percent. */
  creases: z.number().min(0).max(100),
  /** Bright spots in percent. */
  sheen: z.number().min(0).max(100),
  /** Grain strength in percent (opacity of the grain layer). */
  grain: z.number().min(0).max(100),
});

export type HolographicGradientParams = z.output<typeof schema>;

const defaults: HolographicGradientParams = {
  palette: ["#ff5fd2", "#5fd4ff", "#7dffa8", "#ffe45f", "#a77bff"],
  angle: 60,
  bands: 4,
  layers: 3,
  rings: 100,
  creases: 50,
  sheen: 20,
  grain: 8,
};

const preset = (
  id: string,
  params: Partial<HolographicGradientParams>,
): Preset<HolographicGradientParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/**
 * Iridescent palette: hues evenly round the wheel from a seeded start,
 * light and fairly saturated, like foil under light.
 */
function foilPalette(rng: Rng, count: number): string[] {
  const start = rng.float(0, 360);
  const lightness = rng.float(0.78, 0.9);
  const chroma = rng.float(0.1, 0.17);
  return Array.from({ length: count }, (_, i) =>
    oklchToHex({ l: lightness, c: chroma, h: (start + (i * 360) / count) % 360 }),
  );
}

export const holographicGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["gradients", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("foil", {}),
    preset("pearl", {
      palette: ["#eaa6ff", "#8fd3ff", "#a6ffc9", "#ffe08f"],
      bands: 3,
      rings: 80,
      creases: 70,
      sheen: 25,
      grain: 6,
    }),
    preset("oil", {
      palette: ["#1a0b3d", "#3a86ff", "#06d6a0", "#ffd166", "#ef476f"],
      angle: 20,
      bands: 6,
      rings: 90,
      creases: 20,
      sheen: 0,
      grain: 10,
    }),
    preset("chrome", {
      palette: ["#d9d9e3", "#a3b5ff", "#ffffff", "#ffb3e6", "#9fa3b3"],
      angle: 100,
      bands: 5,
      layers: 2,
      rings: 70,
      creases: 80,
      sheen: 30,
    }),
    preset("sticker", {
      palette: ["#ff6ad5", "#c774e8", "#ad8cff", "#8795e8", "#94d0ff"],
      angle: 135,
      bands: 8,
      layers: 3,
      rings: 100,
      creases: 40,
      sheen: 10,
      grain: 0,
    }),
    preset("opal", {
      palette: ["#8ff0ff", "#9fb4ff", "#ffa8c5", "#c69cff", "#93f0c9"],
      angle: 200,
      bands: 2,
      layers: 3,
      rings: 100,
      creases: 30,
      sheen: 30,
      grain: 4,
    }),
    preset("sunset", {
      palette: ["#ff7b54", "#ffb26b", "#ffd56f", "#ff6f91", "#c86bfa"],
      angle: 300,
      bands: 4,
      layers: 2,
      rings: 85,
      creases: 35,
      sheen: 15,
    }),
    preset("aurora", {
      palette: ["#00f5d4", "#00bbf9", "#9b5de5", "#f15bb5", "#fee440"],
      angle: 160,
      bands: 3,
      layers: 3,
      rings: 75,
      creases: 0,
      sheen: 25,
      grain: 12,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.layout,
      { id: "effects", labelKey: `tools.${ID}.groups.effects` },
      COMMON_GROUPS.colors,
    ],
    order: ["angle", "bands", "layers", "rings", "creases", "sheen", "grain", "palette"],
    params: {
      angle: { group: "layout", step: 1, unit: "°" },
      bands: { group: "layout", step: 1 },
      layers: { group: "layout", step: 1 },
      rings: { group: "layout", step: 1, unit: "%", visibleWhen: (p) => p.layers > 0 },
      creases: { group: "effects", step: 1, unit: "%" },
      sheen: { group: "effects", step: 1, unit: "%" },
      grain: { group: "effects", step: 1, unit: "%" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
    },
  },
  randomize(rng, current, locks) {
    const next: HolographicGradientParams = {
      palette: foilPalette(rng, rng.int(4, 6)),
      angle: rng.int(0, 359),
      bands: rng.int(2, 7),
      layers: rng.int(1, HOLO_LAYERS_MAX),
      rings: rng.int(60, 100),
      creases: rng.int(0, 80),
      sheen: rng.int(0, 45),
      // Grain is a deliberate finish: a new variant keeps it.
      grain: current.grain,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, seed, width, height }) {
      return holographicSvg({
        width,
        height,
        colors: p.palette,
        angle: p.angle,
        bands: p.bands,
        layers: p.layers,
        rings: p.rings / 100,
        creases: p.creases / 100,
        sheen: p.sheen / 100,
        rng,
        grain: gradientGrain(seed, p.grain),
      });
    },
  },
  exports: ["png", "jpg", "webp", "svg"],
  animation: SEED_AND_COLOR_ANIMATION,
});
