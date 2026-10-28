/**
 * M3-AP07: Blurry Gradients (docs/TOOLS.md C2). Two to five large,
 * translucent, strongly blurred circles at the corners and the centre.
 *
 * Render approach: each blurred circle is an exact radial gradient (profile
 * of a disk convolved with a Gaussian), not an SVG filter, so every browser
 * and editor shows the same image. Grain is the shared raster tile.
 */
import {
  BLURRY_CIRCLES_MAX,
  BLURRY_CIRCLES_MIN,
  BLURRY_LAYOUTS,
  blurryGradientSvg,
  randomPalette,
} from "@motivo/engine";
import * as z from "zod";
import { TRANSPARENT, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { gradientGrain } from "./grain";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels } from "./shared";

const ID = "blurry-gradient";

const schema = visualParamsSchema.extend({
  circles: z.int().min(BLURRY_CIRCLES_MIN).max(BLURRY_CIRCLES_MAX),
  layout: z.enum(BLURRY_LAYOUTS),
  /** Circle radius in percent of the shorter canvas edge. */
  size: z.number().min(10).max(90),
  /** Random offset from the anchors in percent. */
  spread: z.number().min(0).max(100),
  /** Opacity of each circle in percent. */
  opacity: z.number().min(10).max(100),
  /** Softness in percent (Gaussian blur up to 25 % of the shorter edge). */
  blur: z.number().min(0).max(100),
  /** Grain strength in percent (opacity of the grain layer). */
  grain: z.number().min(0).max(100),
});

export type BlurryGradientParams = z.output<typeof schema>;

const defaults: BlurryGradientParams = {
  background: "#fff4e6",
  palette: ["#ff8fab", "#8ecae6", "#ffb703", "#b8f2e6"],
  circles: 4,
  layout: "corners",
  size: 45,
  spread: 20,
  opacity: 90,
  blur: 75,
  grain: 10,
};

const preset = (
  id: string,
  params: Partial<BlurryGradientParams>,
): Preset<BlurryGradientParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const blurryGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["gradients", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("midnight", {
      background: "#0b0d17",
      palette: ["#7209b7", "#4361ee", "#f72585"],
      circles: 3,
      layout: "mixed",
      size: 40,
      opacity: 80,
      grain: 12,
    }),
    preset("sorbet", {
      background: "#fff0f3",
      palette: ["#ffb3c6", "#ffd6a5", "#caffbf", "#a0c4ff", "#fdffb6"],
      circles: 5,
      size: 40,
      blur: 85,
      grain: 0,
    }),
    preset("ocean", {
      background: "#e0fbfc",
      palette: ["#3d5a80", "#98c1d9", "#293241"],
      circles: 3,
      layout: "center",
      size: 28,
      spread: 30,
      opacity: 70,
    }),
    preset("sunset", {
      background: "#ffcdb2",
      palette: ["#e56b6f", "#b56576", "#eaac8b"],
      circles: 2,
      size: 60,
      spread: 10,
      blur: 90,
    }),
    preset("forest", {
      background: "#1b4332",
      palette: ["#95d5b2", "#52b788", "#d8f3dc", "#40916c"],
      circles: 4,
      layout: "mixed",
      opacity: 75,
      grain: 12,
    }),
    preset("mono", {
      background: "#f8f9fa",
      palette: ["#adb5bd", "#6c757d"],
      circles: 2,
      layout: "center",
      size: 30,
      spread: 70,
      opacity: 60,
      blur: 60,
      grain: 15,
    }),
    preset("neon", {
      background: "#000000",
      palette: ["#00f5d4", "#f15bb5", "#fee440", "#9b5de5", "#00bbf9"],
      circles: 5,
      layout: "mixed",
      size: 32,
      spread: 35,
      opacity: 85,
      blur: 55,
      grain: 12,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.layout,
      { id: "effects", labelKey: `tools.${ID}.groups.effects` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "circles",
      "layout",
      "size",
      "spread",
      "opacity",
      "blur",
      "grain",
      "palette",
      "background",
    ],
    params: {
      circles: { group: "layout", step: 1 },
      layout: { group: "layout", optionLabelKeys: optionLabels(ID, "layout", BLURRY_LAYOUTS) },
      size: { group: "layout", step: 1, unit: "%" },
      spread: { group: "layout", step: 1, unit: "%" },
      opacity: { group: "effects", step: 1, unit: "%" },
      blur: { group: "effects", step: 1, unit: "%" },
      grain: { group: "effects", step: 1, unit: "%" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const circles = rng.int(BLURRY_CIRCLES_MIN, BLURRY_CIRCLES_MAX);
    const colors = randomPalette(rng, circles + 1);
    // Background at one end of the lightness ramp, so the circles stand out.
    const background = (rng.bool() ? colors.shift() : colors.pop()) ?? current.background;
    const next: BlurryGradientParams = {
      background: current.background === TRANSPARENT ? TRANSPARENT : background,
      palette: rng.shuffle(colors),
      circles,
      layout: rng.pick(BLURRY_LAYOUTS),
      size: rng.int(30, 60),
      spread: rng.int(0, 50),
      opacity: rng.int(65, 100),
      blur: rng.int(55, 95),
      // Grain is a deliberate finish: a new variant keeps it.
      grain: current.grain,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, seed, width, height }) {
      return blurryGradientSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        circles: p.circles,
        layout: p.layout,
        size: p.size / 100,
        spread: p.spread / 100,
        opacity: p.opacity / 100,
        blur: p.blur / 100,
        rng,
        grain: gradientGrain(seed, p.grain),
      });
    },
  },
  exports: ["png", "jpg", "webp", "svg", "css"],
});
