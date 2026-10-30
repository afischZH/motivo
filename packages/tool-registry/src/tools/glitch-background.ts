/**
 * W5: Glitch background (docs/TOOLS.md C6). A palette gradient torn into
 * shifted slices with RGB-split fringes, stray blocks, scanlines and grain.
 *
 * Render approach: rects, gradients and one line pattern (no filter), grain
 * is the shared raster tile. One SVG for preview and export; a new seed per
 * frame makes a flickering GIF.
 */
import { GLITCH_BLOCKS_MAX, GLITCH_SLICES_MAX, glitchSvg, randomPalette } from "@musterli/engine";
import * as z from "zod";
import { paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { gradientGrain } from "./grain";
import { COMMON_GROUPS, COMMON_LABELS } from "./shared";

const ID = "glitch-background";

// No `background`: the gradient always covers the canvas.
const schema = z.object({
  palette: paletteSchema,
  /** Direction of the base gradient in degrees. */
  angle: z.number().min(0).max(360),
  slices: z.int().min(0).max(GLITCH_SLICES_MAX),
  /** Largest sideways shift in percent of the width. */
  shift: z.number().min(0).max(100),
  /** RGB split strength in percent. */
  split: z.number().min(0).max(100),
  blocks: z.int().min(0).max(GLITCH_BLOCKS_MAX),
  /** Scanline strength in percent. */
  scanlines: z.number().min(0).max(100),
  /** Grain strength in percent (opacity of the grain layer). */
  grain: z.number().min(0).max(100),
});

export type GlitchBackgroundParams = z.output<typeof schema>;

const defaults: GlitchBackgroundParams = {
  palette: ["#120024", "#7b2ff7", "#f107a3", "#ffb347"],
  angle: 135,
  slices: 18,
  shift: 30,
  split: 60,
  blocks: 20,
  scanlines: 50,
  grain: 10,
};

const preset = (
  id: string,
  params: Partial<GlitchBackgroundParams>,
): Preset<GlitchBackgroundParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const glitchBackgroundTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "gradients"],
  schema,
  defaults,
  presets: [
    preset("signal", {}),
    preset("vhs", {
      palette: ["#1d3557", "#457b9d", "#f1faee", "#e63946"],
      angle: 90,
      slices: 12,
      shift: 15,
      split: 80,
      blocks: 8,
      scanlines: 80,
      grain: 25,
    }),
    preset("cyber", {
      palette: ["#000000", "#00ff9f", "#00b8ff", "#001eff"],
      angle: 180,
      slices: 28,
      shift: 45,
      split: 50,
      blocks: 35,
      scanlines: 40,
      grain: 8,
    }),
    preset("soft", {
      palette: ["#ffd6e0", "#c1e1ff", "#d4ffe4"],
      angle: 45,
      slices: 10,
      shift: 20,
      split: 30,
      blocks: 6,
      scanlines: 0,
      grain: 6,
    }),
    preset("error", {
      palette: ["#0a0a0a", "#ff0033", "#0a0a0a"],
      angle: 90,
      slices: 34,
      shift: 60,
      split: 90,
      blocks: 45,
      scanlines: 60,
      grain: 15,
    }),
    preset("sunset", {
      palette: ["#2d0b3a", "#ff5e5b", "#ffbd59", "#fff1a8"],
      angle: 0,
      slices: 16,
      shift: 25,
      split: 55,
      blocks: 14,
      scanlines: 45,
      grain: 10,
    }),
    preset("mono", {
      palette: ["#111111", "#eeeeee"],
      angle: 160,
      slices: 22,
      shift: 35,
      split: 0,
      blocks: 25,
      scanlines: 70,
      grain: 20,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.layout,
      { id: "effects", labelKey: `tools.${ID}.groups.effects` },
      COMMON_GROUPS.colors,
    ],
    order: ["slices", "shift", "blocks", "split", "scanlines", "grain", "angle", "palette"],
    params: {
      slices: { group: "layout", step: 1 },
      shift: { group: "layout", step: 1, unit: "%", visibleWhen: (p) => p.slices > 0 },
      blocks: { group: "layout", step: 1 },
      split: { group: "effects", step: 1, unit: "%", visibleWhen: (p) => p.slices > 0 },
      scanlines: { group: "effects", step: 1, unit: "%" },
      grain: { group: "effects", step: 1, unit: "%" },
      angle: { group: "colors", step: 1, unit: "°" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
    },
  },
  randomize(rng, current, locks) {
    const next: GlitchBackgroundParams = {
      palette: randomPalette(rng, rng.int(2, 5)),
      angle: rng.int(0, 359),
      slices: rng.int(6, 32),
      shift: rng.int(10, 55),
      split: rng.int(20, 90),
      blocks: rng.int(0, 40),
      scanlines: rng.int(0, 80),
      // Grain is a deliberate finish: a new variant keeps it.
      grain: current.grain,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, seed, width, height }) {
      return glitchSvg({
        width,
        height,
        colors: p.palette,
        angle: p.angle,
        slices: p.slices,
        shift: p.shift / 100,
        split: p.split / 100,
        blocks: p.blocks,
        scanlines: p.scanlines / 100,
        rng,
        grain: gradientGrain(seed, p.grain),
      });
    },
  },
  exports: ["png", "jpg", "webp", "svg"],
  animation: SEED_AND_COLOR_ANIMATION,
});
