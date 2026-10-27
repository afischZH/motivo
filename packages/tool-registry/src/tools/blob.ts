/**
 * M1-AP08: Blob (docs/TOOLS.md D1). One organic shape from seeded points on a
 * circle, smoothed with a closed Catmull-Rom spline.
 */
import { BLOB_FILL_STYLES, blobClipPathCss, blobSvg, randomPalette } from "@motivo/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels, roundTo } from "./shared";

const ID = "blob";

const schema = visualParamsSchema.extend({
  complexity: z.int().min(3).max(20),
  randomness: z.number().min(0).max(1),
  size: z.number().min(0.1).max(1),
  fillStyle: z.enum(BLOB_FILL_STYLES),
  strokeWidth: z.int().min(1).max(64),
  gradientAngle: z.number().min(0).max(360),
});

export type BlobParams = z.output<typeof schema>;

const defaults: BlobParams = {
  background: "#ffffff",
  palette: ["#ff6b6b", "#feca57"],
  complexity: 6,
  randomness: 0.5,
  size: 0.8,
  fillStyle: "solid",
  strokeWidth: 12,
  gradientAngle: 135,
};

const preset = (id: string, params: Partial<BlobParams>): Preset<BlobParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

export const blobTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: [
    preset("pebble", {
      palette: ["#6c757d", "#adb5bd"],
      complexity: 5,
      randomness: 0.3,
      background: "#f8f9fa",
    }),
    preset("splash", { palette: ["#3a86ff", "#8338ec"], complexity: 12, randomness: 0.75 }),
    preset("lava", {
      palette: ["#ff006e", "#fb5607", "#ffbe0b"],
      complexity: 8,
      randomness: 0.55,
      fillStyle: "gradient",
      gradientAngle: 200,
      background: "#1b1b1e",
    }),
    preset("lasso", {
      palette: ["#2b2d42", "#8d99ae"],
      complexity: 9,
      randomness: 0.4,
      fillStyle: "outline",
      strokeWidth: 10,
      background: "#edf2f4",
    }),
    preset("petal", { palette: ["#f4acb7", "#9d8189"], complexity: 3, randomness: 0.2, size: 0.7 }),
    preset("cumulus", {
      palette: ["#caf0f8", "#90e0ef"],
      complexity: 14,
      randomness: 0.25,
      background: "#0077b6",
    }),
    preset("sticker", {
      palette: ["#06d6a0", "#118ab2"],
      complexity: 7,
      randomness: 0.45,
      fillStyle: "gradient",
      gradientAngle: 45,
      background: "transparent",
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.shape, COMMON_GROUPS.colors],
    order: [
      "complexity",
      "randomness",
      "size",
      "fillStyle",
      "strokeWidth",
      "gradientAngle",
      "palette",
      "background",
    ],
    params: {
      complexity: { group: "shape" },
      randomness: { group: "shape", step: 0.01 },
      size: { group: "shape", step: 0.01 },
      fillStyle: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "fillStyle", BLOB_FILL_STYLES),
      },
      strokeWidth: { group: "colors", unit: "px", visibleWhen: (p) => p.fillStyle === "outline" },
      gradientAngle: {
        group: "colors",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.fillStyle === "gradient",
      },
      palette: { group: "colors", labelKey: COMMON_LABELS.palette },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const next: BlobParams = {
      background: current.background,
      palette: randomPalette(rng, rng.int(2, 3)),
      complexity: rng.int(3, 14),
      randomness: roundTo(rng.float(0.15, 0.8), 2),
      size: roundTo(rng.float(0.6, 0.9), 2),
      fillStyle: current.fillStyle,
      strokeWidth: current.strokeWidth,
      gradientAngle: rng.int(0, 71) * 5,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width, height }) {
      return blobSvg({ ...p, colors: p.palette, width, height, rng });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "clip-path",
      labelKey: EXTRA_EXPORT_LABELS.clipPath,
      language: "css",
      render(p, { rng, width, height }) {
        return blobClipPathCss({ ...p, width, height, rng });
      },
    },
  ],
  gating: {},
});
