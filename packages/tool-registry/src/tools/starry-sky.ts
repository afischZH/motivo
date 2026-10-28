/**
 * M2-AP01: Starry Sky (docs/TOOLS.md A3). Sky gradient from the palette with
 * Poisson-disk stars, optional glow and a few large sparkles.
 */
import { MAX_SPARKLES, oklchToHex, randomPalette, starrySkySvg } from "@musterli/engine";
import * as z from "zod";
import { colorSchema, paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, roundTo } from "./shared";

const ID = "starry-sky";

// No `background`: the sky gradient (palette, top to bottom) always covers the canvas.
const schema = z.object({
  palette: paletteSchema,
  starColor: colorSchema,
  /** Minimum distance between stars in percent of the shorter canvas edge. */
  density: z.number().min(1).max(15),
  size: z.number().min(0.05).max(1),
  twinkle: z.number().min(0).max(1),
  glow: z.number().min(0).max(1),
  sparkles: z.int().min(0).max(MAX_SPARKLES),
});

export type StarrySkyParams = z.output<typeof schema>;

const defaults: StarrySkyParams = {
  palette: ["#050a1f", "#1b2a5c"],
  starColor: "#ffffff",
  density: 3,
  size: 0.3,
  twinkle: 0.6,
  glow: 0.3,
  sparkles: 4,
};

const preset = (id: string, params: Partial<StarrySkyParams>): Preset<StarrySkyParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const starrySkyTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1920, height: 1080 },
  presets: [
    preset("midnight", {
      palette: ["#000000", "#0a1030", "#17224d"],
      density: 2.5,
      size: 0.25,
      glow: 0.2,
      sparkles: 3,
    }),
    preset("dusk", {
      palette: ["#1a1446", "#5b2a6e", "#c8566b", "#f4a261"],
      starColor: "#fff4e0",
      density: 4,
      twinkle: 0.7,
      glow: 0,
      sparkles: 0,
    }),
    preset("milky-way", {
      palette: ["#02030a", "#0c1226"],
      density: 1.2,
      size: 0.4,
      twinkle: 0.85,
      glow: 0.15,
      sparkles: 0,
    }),
    preset("polar", {
      palette: ["#03141c", "#0a3b40", "#1c6b5a"],
      starColor: "#e8fff6",
      density: 3.5,
      glow: 0.5,
      sparkles: 6,
    }),
    preset("lullaby", {
      palette: ["#1d2d6b", "#3f4fa3", "#8a7fd4"],
      starColor: "#ffe9a8",
      density: 6,
      size: 0.35,
      twinkle: 0.3,
      glow: 0.6,
      sparkles: 10,
    }),
    preset("daybreak", {
      palette: ["#24345e", "#7a83b8", "#f2c4b4"],
      starColor: "#ffffff",
      density: 5,
      size: 0.25,
      twinkle: 0.9,
      glow: 0,
      sparkles: 1,
    }),
    preset("cosmic", {
      palette: ["#0d0221", "#261447", "#3c1a5b"],
      starColor: "#f7d6ff",
      density: 2,
      size: 0.5,
      twinkle: 0.5,
      glow: 0.8,
      sparkles: 8,
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.layout, COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: ["density", "sparkles", "size", "twinkle", "glow", "palette", "starColor"],
    params: {
      density: { group: "layout", step: 0.1, unit: "%" },
      sparkles: { group: "layout" },
      size: { group: "shape", step: 0.01 },
      twinkle: { group: "shape", step: 0.01 },
      glow: { group: "shape", step: 0.01 },
      palette: { group: "colors" },
      starColor: { group: "colors" },
    },
  },
  randomize(rng, current, locks) {
    // Night skies: a dark ramp around one hue, darkest at the top.
    const count = rng.int(2, 4);
    const hue = rng.float(0, 360);
    const top = rng.float(0.06, 0.16);
    const bottom = rng.float(0.25, 0.45);
    const chroma = rng.float(0.03, 0.12);
    const drift = rng.float(-40, 40);
    const palette = Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      return oklchToHex({
        l: top + (bottom - top) * t,
        c: chroma,
        h: (hue + drift * t + 360) % 360,
      });
    });
    const next: StarrySkyParams = {
      palette,
      starColor: rng.bool(0.6) ? "#ffffff" : (randomPalette(rng, 1)[0] ?? current.starColor),
      density: roundTo(rng.float(1.5, 7), 1),
      size: roundTo(rng.float(0.15, 0.5), 2),
      twinkle: roundTo(rng.float(0.2, 0.9), 2),
      glow: rng.bool(0.4) ? 0 : roundTo(rng.float(0.1, 0.8), 2),
      sparkles: rng.bool(0.3) ? 0 : rng.int(1, 10),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      const spacing = (Math.min(width, height) * p.density) / 100;
      return starrySkySvg({ ...p, colors: p.palette, spacing, width, height, rng });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
});
