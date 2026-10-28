/**
 * M3-AP07: Mesh Gradients (docs/TOOLS.md C1). Soft, blurred colour blobs at
 * well spread seeded positions, optionally warped, with optional grain.
 *
 * Render approach: plain paths plus one `feGaussianBlur` (no `feTurbulence`,
 * which renders differently per browser); blurs too large for browser
 * filters at 8K become a small pre-blurred raster field (`meshBlurPlan`);
 * warp deforms the paths, grain is the shared raster tile (see `./grain`).
 * One SVG for preview and export.
 */
import { MESH_POINTS_MAX, MESH_POINTS_MIN, meshGradientSvg, randomPalette } from "@musterli/engine";
import * as z from "zod";
import { TRANSPARENT, visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { SEED_AND_COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { gradientGrain } from "./grain";
import { COMMON_GROUPS, COMMON_LABELS } from "./shared";

const ID = "mesh-gradient";

const schema = visualParamsSchema.extend({
  /** Number of colour blobs. */
  points: z.int().min(MESH_POINTS_MIN).max(MESH_POINTS_MAX),
  /** Softness in percent (Gaussian blur up to 20 % of the shorter edge). */
  blur: z.number().min(0).max(100),
  /** Deformation of the blob outlines in percent. */
  warp: z.number().min(0).max(100),
  /** Grain strength in percent (opacity of the grain layer). */
  grain: z.number().min(0).max(100),
});

export type MeshGradientParams = z.output<typeof schema>;

const defaults: MeshGradientParams = {
  background: "#fde2e4",
  palette: ["#ff8fa3", "#ffc6a5", "#a0c4ff", "#bdb2ff", "#ffd6e0"],
  points: 5,
  blur: 70,
  warp: 40,
  grain: 12,
};

const preset = (id: string, params: Partial<MeshGradientParams>): Preset<MeshGradientParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const meshGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["gradients", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("lagoon", {
      background: "#023e8a",
      palette: ["#00b4d8", "#90e0ef", "#0077b6", "#48cae4"],
      points: 4,
      warp: 55,
    }),
    preset("ember", {
      background: "#370617",
      palette: ["#f48c06", "#dc2f02", "#ffba08", "#9d0208", "#e85d04"],
      points: 6,
      blur: 60,
      warp: 70,
      grain: 12,
    }),
    preset("meadow", {
      background: "#e9f5db",
      palette: ["#b5c99a", "#87986a", "#cfe1b9", "#718355"],
      points: 4,
      blur: 80,
      warp: 20,
      grain: 0,
    }),
    preset("nebula", {
      background: "#10002b",
      palette: ["#7b2cbf", "#e0aaff", "#3c096c", "#c77dff", "#5a189a", "#ff70a6"],
      points: 7,
      blur: 55,
      warp: 80,
      grain: 14,
    }),
    preset("citrus", {
      background: "#fff3b0",
      palette: ["#ffd60a", "#80ed99", "#ffa62b", "#57cc99"],
      points: 4,
      blur: 75,
      warp: 30,
      grain: 0,
    }),
    preset("dusk", {
      background: "#22223b",
      palette: ["#f2e9e4", "#c9ada7", "#9a8c98", "#4a4e69", "#ff9f80"],
      points: 5,
      blur: 65,
      warp: 50,
      grain: 15,
    }),
    preset("ice", {
      background: "#f0f4f8",
      palette: ["#cde3f7", "#8fb8e8", "#e8f1fb", "#a9cbe9"],
      points: 3,
      blur: 85,
      warp: 10,
      grain: 8,
    }),
  ],
  controls: {
    groups: [
      COMMON_GROUPS.shape,
      { id: "effects", labelKey: `tools.${ID}.groups.effects` },
      COMMON_GROUPS.colors,
    ],
    order: ["points", "warp", "blur", "grain", "palette", "background"],
    params: {
      points: { group: "shape", step: 1 },
      warp: { group: "shape", step: 1, unit: "%" },
      blur: { group: "effects", step: 1, unit: "%" },
      grain: { group: "effects", step: 1, unit: "%" },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const count = rng.int(3, 6);
    // One extra colour from the same harmonious ramp becomes the background.
    const colors = randomPalette(rng, count + 1);
    const background = colors.splice(rng.int(0, count), 1)[0] ?? current.background;
    const next: MeshGradientParams = {
      background: current.background === TRANSPARENT ? TRANSPARENT : background,
      palette: rng.shuffle(colors),
      points: rng.int(MESH_POINTS_MIN, MESH_POINTS_MAX),
      blur: rng.int(45, 90),
      warp: rng.int(0, 80),
      // Grain is a deliberate finish: a new variant keeps it.
      grain: current.grain,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, seed, width, height }) {
      return meshGradientSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        points: p.points,
        blur: p.blur / 100,
        warp: p.warp / 100,
        rng,
        grain: gradientGrain(seed, p.grain),
      });
    },
  },
  exports: ["png", "jpg", "webp", "svg", "css"],
  animation: SEED_AND_COLOR_ANIMATION,
});
