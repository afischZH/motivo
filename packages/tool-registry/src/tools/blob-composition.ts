/**
 * M3-AP08: Blob Composition (docs/TOOLS.md D2). Several blobs from the Blob
 * generator as layers, anchored to corners, edges or the centre. Positions
 * and sizes are relative, so the composition survives any canvas size
 * ("Magic Resize"). Colours come from the palette in layer order (brand
 * palettes plug in there with M3-AP06).
 */
import {
  BLOB_ANCHORS,
  BLOB_COMPOSITION_FILL_STYLES,
  BLOB_VARIANT_MAX,
  type BlobAnchor,
  blobCompositionSvg,
  randomPalette,
  type Rng,
} from "@musterli/engine";
import * as z from "zod";
import { visualParamsSchema } from "../common";
import { isItemLocked, keepLocked } from "../randomize";
import { COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { ControlHints, Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels, roundTo } from "./shared";

const ID = "blob-composition";

/** Most blobs per composition. */
export const BLOB_COMPOSITION_MAX = 8;

const blobSchema = z.object({
  anchor: z.enum(BLOB_ANCHORS),
  /** Shift from the anchor in percent of the canvas width. */
  offsetX: z.number().min(-50).max(50),
  /** Shift from the anchor in percent of the canvas height. */
  offsetY: z.number().min(-50).max(50),
  /** Diameter in percent of the shorter canvas edge. */
  size: z.number().min(5).max(200),
  complexity: z.int().min(3).max(16),
  randomness: z.number().min(0).max(1),
  variant: z.int().min(0).max(BLOB_VARIANT_MAX),
  opacity: z.number().min(0).max(100),
  visible: z.boolean(),
});

const schema = visualParamsSchema.extend({
  /** Top blob first. */
  blobs: z.array(blobSchema).min(1).max(BLOB_COMPOSITION_MAX),
  fillStyle: z.enum(BLOB_COMPOSITION_FILL_STYLES),
  strokeWidth: z.int().min(1).max(64),
  gradientAngle: z.number().min(0).max(360),
});

export type BlobCompositionParams = z.output<typeof schema>;
export type BlobCompositionBlob = z.output<typeof blobSchema>;

const blob = (
  anchor: BlobAnchor,
  params: Partial<BlobCompositionBlob> = {},
): BlobCompositionBlob => ({
  anchor,
  offsetX: 0,
  offsetY: 0,
  size: 60,
  complexity: 6,
  randomness: 0.5,
  variant: 1,
  opacity: 100,
  visible: true,
  ...params,
});

const defaults: BlobCompositionParams = {
  background: "#fff7ed",
  palette: ["#fb923c", "#f472b6", "#a78bfa"],
  blobs: [
    blob("top-right", { size: 85, variant: 11 }),
    blob("bottom-left", { size: 100, variant: 23, complexity: 7 }),
    blob("bottom-right", { size: 28, offsetX: -14, offsetY: -12, variant: 5, opacity: 80 }),
  ],
  fillStyle: "solid",
  strokeWidth: 10,
  gradientAngle: 135,
};

const preset = (
  id: string,
  params: Partial<BlobCompositionParams>,
): Preset<BlobCompositionParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Corners and edges in the order "Add" and the randomiser try them. */
const SPOTS: readonly BlobAnchor[] = [
  "top-left",
  "bottom-right",
  "top-right",
  "bottom-left",
  "top",
  "bottom",
  "left",
  "right",
];

/** "Add blob": the first corner or edge not in use yet, smaller than the others. */
function newBlob(items: readonly BlobCompositionBlob[]): BlobCompositionBlob {
  const used = new Set(items.map((b) => b.anchor));
  const anchor = SPOTS.find((a) => !used.has(a)) ?? "center";
  return blob(anchor, { size: 40, variant: (items.length * 37 + 7) % (BLOB_VARIANT_MAX + 1) });
}

const itemHints: ControlHints<BlobCompositionBlob> = {
  order: ["anchor", "offsetX", "offsetY", "size", "complexity", "randomness", "variant", "opacity"],
  params: {
    anchor: { optionLabelKeys: optionLabels(ID, "anchor", BLOB_ANCHORS), kind: "select" },
    offsetX: { step: 1, unit: "%" },
    offsetY: { step: 1, unit: "%" },
    size: { step: 1, unit: "%" },
    complexity: {},
    randomness: { step: 0.01 },
    variant: { step: 1 },
    opacity: { step: 1, unit: "%" },
    visible: { kind: "hidden" },
  },
};

/** Rolls one blob; draws the same amount of randomness whatever is locked. */
function rollBlob(
  rng: Rng,
  current: BlobCompositionBlob,
  index: number,
  spots: readonly BlobAnchor[],
  locks: ReadonlySet<string>,
): BlobCompositionBlob {
  const locked = (field: keyof BlobCompositionBlob) => isItemLocked(locks, "blobs", index, field);
  const anchor = spots[index % spots.length] ?? "center";
  const corner = anchor.includes("-");
  // Corner blobs are large and pushed out; edge blobs smaller and nearer the edge.
  const size = corner ? rng.int(60, 130) : rng.int(25, 70);
  const offsetX = rng.int(-12, 12);
  const offsetY = rng.int(-12, 12);
  const complexity = rng.int(4, 10);
  const randomness = roundTo(rng.float(0.25, 0.75), 2);
  const variant = rng.int(0, BLOB_VARIANT_MAX);
  const translucent = rng.bool(0.25);
  const opacity = translucent ? rng.int(5, 9) * 10 : 100;
  return {
    anchor: locked("anchor") ? current.anchor : anchor,
    offsetX,
    offsetY,
    size,
    complexity,
    randomness,
    variant,
    opacity,
    visible: current.visible,
  };
}

export const blobCompositionTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1920, height: 1080 },
  presets: [
    preset("corners", {
      background: "#0f172a",
      palette: ["#38bdf8", "#818cf8"],
      blobs: [
        blob("top-left", { size: 120, variant: 3, complexity: 7 }),
        blob("bottom-right", { size: 110, variant: 9, complexity: 7 }),
      ],
    }),
    preset("sunrise", {
      background: "#fff1e6",
      palette: ["#ff9f1c", "#ffbf69", "#cbf3f0"],
      fillStyle: "gradient",
      gradientAngle: 180,
      blobs: [
        blob("bottom", { size: 120, offsetY: 8, variant: 42, complexity: 9, randomness: 0.35 }),
        blob("top-left", { size: 45, variant: 7, opacity: 70 }),
        blob("top-right", { size: 30, offsetX: -10, offsetY: 12, variant: 77, opacity: 60 }),
      ],
    }),
    preset("mint", {
      background: "#f0fdf4",
      palette: ["#34d399", "#a7f3d0", "#065f46"],
      blobs: [
        blob("top-right", { size: 110, variant: 120, randomness: 0.4 }),
        blob("bottom-left", { size: 90, variant: 15 }),
        blob("left", { size: 18, offsetX: 12, offsetY: -20, variant: 501, opacity: 90 }),
      ],
    }),
    preset("outline", {
      background: "#fafaf9",
      palette: ["#1c1917", "#f97316"],
      fillStyle: "outline",
      strokeWidth: 6,
      blobs: [
        blob("top-left", { size: 90, variant: 64, complexity: 8, offsetX: 4, offsetY: 6 }),
        blob("bottom-right", { size: 100, variant: 65, complexity: 9, offsetX: -6, offsetY: -8 }),
        blob("bottom-right", { size: 70, variant: 66, complexity: 7, offsetX: -10, offsetY: -14 }),
      ],
    }),
    preset("dusk", {
      background: "#1e1b4b",
      palette: ["#f472b6", "#c084fc", "#60a5fa", "#2dd4bf"],
      fillStyle: "gradient",
      gradientAngle: 45,
      blobs: [
        blob("top-right", { size: 85, variant: 301, opacity: 90 }),
        blob("bottom-left", { size: 100, variant: 302, opacity: 85 }),
        blob("right", { size: 30, offsetX: -8, offsetY: 18, variant: 303 }),
        blob("top", { size: 20, offsetX: -25, offsetY: 14, variant: 304, opacity: 70 }),
      ],
    }),
    preset("paper", {
      background: "#f5f0e8",
      palette: ["#d6ccc2", "#e3d5ca", "#b5838d"],
      blobs: [
        blob("top-left", { size: 110, variant: 900, complexity: 5, randomness: 0.3 }),
        blob("bottom-right", { size: 75, variant: 901, complexity: 5, randomness: 0.3 }),
        blob("bottom-right", { size: 14, offsetX: -22, offsetY: -18, variant: 902 }),
      ],
    }),
    preset("pop", {
      background: "#fffbeb",
      palette: ["#ef4444", "#facc15", "#3b82f6", "#22c55e"],
      blobs: [
        blob("top-left", { size: 70, variant: 1001, complexity: 4 }),
        blob("top-right", { size: 50, variant: 1002, complexity: 5 }),
        blob("bottom-left", { size: 55, variant: 1003, complexity: 6 }),
        blob("bottom-right", { size: 80, variant: 1004, complexity: 4 }),
      ],
    }),
  ],
  controls: {
    groups: [COMMON_GROUPS.layout, COMMON_GROUPS.colors],
    order: ["blobs", "fillStyle", "strokeWidth", "gradientAngle", "palette", "background"],
    params: {
      blobs: {
        group: "layout",
        kind: "list",
        list: {
          item: itemHints,
          visibilityField: "visible",
          titleField: "anchor",
          newItem: newBlob,
          itemLabelKey: `tools.${ID}.blob`,
        },
      },
      fillStyle: {
        group: "colors",
        optionLabelKeys: optionLabels(ID, "fillStyle", BLOB_COMPOSITION_FILL_STYLES),
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
    const palette = randomPalette(rng, rng.int(2, 4));
    // Opposite corners first, then the other corners and the edges.
    const flip = rng.bool();
    const spots = flip
      ? SPOTS.map(
          (a) =>
            (a.includes("left")
              ? a.replace("left", "right")
              : a.replace("right", "left")) as BlobAnchor,
        )
      : SPOTS;
    const blobs = current.blobs.map((b, i) => rollBlob(rng, b, i, spots, locks));
    const next: BlobCompositionParams = { ...current, palette, blobs };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width, height }) {
      return blobCompositionSvg({ ...p, colors: p.palette, width, height });
    },
  },
  exports: ["svg", "css", "png", "jpg", "webp"],
  animation: COLOR_ANIMATION,
});
