/**
 * M2-AP02: Noise/Grain texture (docs/TOOLS.md E1, standalone without image
 * input). A solid or gradient base with seeded Gaussian grain on top.
 *
 * Render approach: the grain is a fixed-size raster tile (seamless, seeded
 * from the design seed) embedded as a PNG data URI in an SVG pattern and
 * blended with `mix-blend-mode`. The pixels are computed here, not by a
 * browser filter such as `feTurbulence`, so preview and export are one SVG
 * and Chromium, Firefox and WebKit show the same grain. Work per render is
 * bounded by the tile size, independent of canvas size and params.
 */
import {
  GRAIN_BASES,
  GRAIN_BLENDS,
  GRAIN_SIZE_MAX,
  GRAIN_SIZE_MIN,
  GRAIN_TILE_EDGE,
  noiseGrainSvg,
  randomPalette,
  type GrainBlend,
  type Rng,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, paletteSchema } from "../common";
import { grainTileCacheSize, grainTileDataUri } from "./grain";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "noise-grain";

/** Gradient stops of the base: a simple 2 or 3 stop gradient (docs/TOOLS.md E1). */
export const NOISE_GRAIN_STOPS_MAX = 3;

const schema = z.object({
  base: z.enum(GRAIN_BASES),
  color: colorSchema,
  palette: paletteSchema.max(NOISE_GRAIN_STOPS_MAX),
  angle: z.number().min(0).max(360),
  /** Grain strength in percent (opacity of the grain layer). */
  amount: z.number().min(0).max(100),
  /** Grain size in px. */
  size: z.number().min(GRAIN_SIZE_MIN).max(GRAIN_SIZE_MAX),
  blend: z.enum(GRAIN_BLENDS),
  mono: z.boolean(),
});

export type NoiseGrainParams = z.output<typeof schema>;

const defaults: NoiseGrainParams = {
  base: "solid",
  color: "#8d99ae",
  palette: ["#f4a261", "#e76f51"],
  angle: 135,
  amount: 40,
  size: 1,
  blend: "overlay",
  mono: true,
};

const preset = (id: string, params: Partial<NoiseGrainParams>): Preset<NoiseGrainParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Grain tile of the design; depends only on (seed, size, mono, blend), so it is cached. */
function tileDataUri(
  rng: Rng,
  seed: number,
  size: number,
  mono: boolean,
  blend: GrainBlend,
): string {
  return grainTileDataUri(`noise|${seed}|${size}|${mono ? 1 : 0}|${blend}`, rng, size, mono, blend);
}

/** Number of cached tiles, for tests. */
export const noiseGrainTileCacheSize = grainTileCacheSize;

export const noiseGrainTool = defineTool({
  id: ID,
  version: 1,
  category: ["image-effects", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("film", { color: "#6c757d", amount: 45 }),
    preset("paper", { color: "#f1e9da", blend: "multiply", amount: 30, size: 1.5 }),
    preset("riso", {
      base: "linear",
      palette: ["#ff6f91", "#ffc75f"],
      angle: 160,
      mono: false,
      amount: 50,
    }),
    preset("midnight", {
      base: "radial",
      palette: ["#3a506b", "#0b132b"],
      blend: "soft-light",
      amount: 60,
    }),
    preset("aurora", {
      base: "linear",
      palette: ["#2ec4b6", "#3a86ff", "#8338ec"],
      angle: 45,
      mono: false,
      amount: 35,
      size: 2,
    }),
    preset("sand", { color: "#e9c46a", blend: "multiply", amount: 40, size: 2.5 }),
    preset("overlay", { base: "none", amount: 50 }),
  ],
  controls: {
    groups: [
      { id: "base", labelKey: `tools.${ID}.groups.base` },
      { id: "grain", labelKey: `tools.${ID}.groups.grain` },
    ],
    order: ["amount", "size", "blend", "mono", "base", "color", "palette", "angle"],
    params: {
      amount: { group: "grain", step: 1, unit: "%" },
      size: { group: "grain", step: 0.5, unit: "px" },
      blend: { group: "grain", optionLabelKeys: optionLabels(ID, "blend", GRAIN_BLENDS) },
      mono: { group: "grain" },
      base: { group: "base", optionLabelKeys: optionLabels(ID, "base", GRAIN_BASES) },
      color: { group: "base", visibleWhen: (p) => p.base === "solid" },
      palette: {
        group: "base",
        kind: "palette",
        labelKey: COMMON_LABELS.palette,
        visibleWhen: (p) => p.base === "linear" || p.base === "radial",
      },
      angle: {
        group: "base",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.base === "linear",
      },
    },
  },
  randomize(rng, current, locks) {
    const roll = rng.next();
    // Transparent stays a deliberate choice: never rolled, kept if already set.
    const base =
      current.base === "none" ? "none" : roll < 0.45 ? "solid" : roll < 0.8 ? "linear" : "radial";
    const palette = randomPalette(rng, rng.int(2, NOISE_GRAIN_STOPS_MAX));
    const blend = rng.pick(GRAIN_BLENDS);
    const next: NoiseGrainParams = {
      base,
      color: palette[0] ?? current.color,
      palette,
      angle: rng.int(0, 71) * 5,
      amount: rng.int(20, 65),
      size: rng.pick([1, 1, 1.5, 2, 3]),
      blend,
      mono: rng.bool(0.7),
    };
    // Multiply darkens on average, so keep it subtle.
    if (blend === "multiply") next.amount = roundTo(next.amount * 0.7, 0);
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, seed, width, height }) {
      return noiseGrainSvg({
        width,
        height,
        base: p.base,
        color: p.color,
        colors: p.palette,
        angle: p.angle,
        opacity: p.amount / 100,
        blend: p.blend,
        tileHref: p.amount > 0 ? tileDataUri(rng, seed, p.size, p.mono, p.blend) : "",
        tileEdge: GRAIN_TILE_EDGE,
      });
    },
  },
  exports: ["png", "jpg", "webp", "svg", "css"],
});
