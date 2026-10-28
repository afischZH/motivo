/**
 * Curated gradient collection: our own named gradients, defined as OKLCH
 * stops plus the CSS Gradient tool's geometry. Clean-room: colours, names
 * and texts were made for Motivo and are not taken from any other gradient
 * site. Each gradient renders through the `css-gradient` tool (one render
 * path: page preview, copied CSS and editor link use the same params).
 *
 * Adding one: an entry here, its slugs in `GRADIENT_SLUGS` (`i18n/slugs.ts`)
 * and `GradientCollection.items.<id>` in both message files. The contract
 * tests in `collections.test.ts` and `i18n/slugs.test.ts` name what is missing.
 */
import type { GradientType } from "@motivo/engine";

import { lchToHex, relatedItems, type Lch } from "./colors";

/** Mood groups of the overview page, in display order. */
export const GRADIENT_GROUPS = ["warm", "cool", "pastel", "vivid", "dark", "subtle"] as const;
export type GradientGroup = (typeof GRADIENT_GROUPS)[number];

export interface GradientDefinition {
  id: string;
  group: GradientGroup;
  /** 2 to 4 colours in OKLCH, first to last. */
  stops: readonly Lch[];
  type?: GradientType;
  /** Linear and conic angle in degrees (default 135). */
  angle?: number;
  /** Radial and conic centre in percent (default 50/50). */
  center?: readonly [x: number, y: number];
  /** Conic gradients that return to the first colour. */
  loop?: boolean;
}

export interface CuratedGradient extends GradientDefinition {
  /** The stops as lowercase hex, in order. */
  colors: readonly string[];
}

const DEFINITIONS: readonly GradientDefinition[] = [
  // Warm
  {
    id: "alpenglow",
    group: "warm",
    stops: [
      [0.86, 0.1, 80],
      [0.72, 0.15, 45],
      [0.56, 0.17, 12],
    ],
    angle: 160,
  },
  {
    id: "apricot",
    group: "warm",
    stops: [
      [0.94, 0.05, 85],
      [0.79, 0.12, 58],
    ],
  },
  {
    id: "embers",
    group: "warm",
    stops: [
      [0.82, 0.15, 75],
      [0.6, 0.19, 38],
      [0.32, 0.1, 25],
    ],
    type: "radial",
    center: [50, 100],
  },
  {
    id: "pumpkin-patch",
    group: "warm",
    stops: [
      [0.85, 0.15, 88],
      [0.69, 0.17, 52],
    ],
    angle: 90,
  },
  {
    id: "terracotta",
    group: "warm",
    stops: [
      [0.9, 0.04, 70],
      [0.64, 0.12, 42],
      [0.45, 0.1, 35],
    ],
    angle: 180,
  },
  {
    id: "cinnamon-star",
    group: "warm",
    stops: [
      [0.93, 0.04, 85],
      [0.68, 0.1, 58],
      [0.42, 0.07, 45],
    ],
    angle: 120,
  },
  // Cool
  {
    id: "glacier",
    group: "cool",
    stops: [
      [0.97, 0.015, 210],
      [0.8, 0.07, 220],
      [0.56, 0.12, 248],
    ],
    angle: 180,
  },
  {
    id: "mountain-lake",
    group: "cool",
    stops: [
      [0.8, 0.1, 190],
      [0.5, 0.1, 232],
    ],
    angle: 150,
  },
  {
    id: "north-wind",
    group: "cool",
    stops: [
      [0.94, 0.025, 240],
      [0.72, 0.07, 252],
    ],
    angle: 200,
  },
  {
    id: "rhine-falls",
    group: "cool",
    stops: [
      [0.96, 0.03, 195],
      [0.74, 0.11, 200],
      [0.48, 0.084, 218],
    ],
    angle: 170,
  },
  {
    id: "foehn-sky",
    group: "cool",
    stops: [
      [0.88, 0.06, 240],
      [0.83, 0.07, 305],
    ],
  },
  {
    id: "peppermint",
    group: "cool",
    stops: [
      [0.95, 0.05, 170],
      [0.76, 0.11, 180],
    ],
  },
  // Pastel
  {
    id: "candy-floss",
    group: "pastel",
    stops: [
      [0.9, 0.06, 350],
      [0.88, 0.06, 262],
    ],
  },
  {
    id: "peach-blossom",
    group: "pastel",
    stops: [
      [0.95, 0.032, 65],
      [0.86, 0.07, 22],
    ],
    angle: 160,
  },
  {
    id: "lavender-field",
    group: "pastel",
    stops: [
      [0.93, 0.04, 300],
      [0.79, 0.08, 292],
    ],
    angle: 180,
  },
  {
    id: "morning-dew",
    group: "pastel",
    stops: [
      [0.96, 0.03, 150],
      [0.9, 0.05, 205],
    ],
    angle: 160,
  },
  {
    id: "macaron",
    group: "pastel",
    stops: [
      [0.91, 0.045, 10],
      [0.94, 0.06, 100],
      [0.9, 0.06, 170],
    ],
    angle: 120,
  },
  {
    id: "soap-bubble",
    group: "pastel",
    stops: [
      [0.91, 0.06, 330],
      [0.93, 0.06, 95],
      [0.9, 0.06, 200],
    ],
    type: "conic",
    angle: 30,
    loop: true,
  },
  // Vivid
  {
    id: "kingfisher",
    group: "vivid",
    stops: [
      [0.68, 0.132, 230],
      [0.5, 0.17, 262],
      [0.72, 0.17, 52],
    ],
  },
  {
    id: "neon-night",
    group: "vivid",
    stops: [
      [0.66, 0.25, 335],
      [0.5, 0.24, 292],
      [0.72, 0.122, 210],
    ],
    angle: 120,
  },
  {
    id: "parrot",
    group: "vivid",
    stops: [
      [0.86, 0.18, 128],
      [0.7, 0.13, 180],
      [0.56, 0.16, 252],
    ],
  },
  {
    id: "hibiscus",
    group: "vivid",
    stops: [
      [0.76, 0.15, 55],
      [0.62, 0.23, 5],
    ],
    type: "radial",
    center: [30, 30],
  },
  {
    id: "carnival",
    group: "vivid",
    stops: [
      [0.87, 0.17, 95],
      [0.63, 0.23, 25],
      [0.48, 0.22, 300],
    ],
    angle: 90,
  },
  {
    id: "northern-lights",
    group: "vivid",
    stops: [
      [0.82, 0.17, 152],
      [0.62, 0.104, 195],
      [0.38, 0.16, 292],
    ],
    angle: 160,
  },
  // Dark
  {
    id: "observatory",
    group: "dark",
    stops: [
      [0.36, 0.08, 268],
      [0.17, 0.04, 280],
    ],
    type: "radial",
    center: [50, 0],
  },
  {
    id: "fir-forest",
    group: "dark",
    stops: [
      [0.42, 0.07, 160],
      [0.22, 0.04, 180],
    ],
    angle: 180,
  },
  {
    id: "deep-sea",
    group: "dark",
    stops: [
      [0.42, 0.082, 230],
      [0.2, 0.05, 252],
    ],
    angle: 180,
  },
  {
    id: "blackberry",
    group: "dark",
    stops: [
      [0.4, 0.12, 335],
      [0.22, 0.07, 300],
    ],
  },
  {
    id: "volcano",
    group: "dark",
    stops: [
      [0.72, 0.16, 58],
      [0.46, 0.15, 30],
      [0.2, 0.03, 30],
    ],
    type: "radial",
    center: [50, 100],
  },
  {
    id: "espresso",
    group: "dark",
    stops: [
      [0.42, 0.05, 55],
      [0.2, 0.02, 40],
    ],
    angle: 160,
  },
  // Subtle
  {
    id: "sea-of-fog",
    group: "subtle",
    stops: [
      [0.97, 0.005, 250],
      [0.87, 0.018, 250],
    ],
    angle: 180,
  },
  {
    id: "linen",
    group: "subtle",
    stops: [
      [0.97, 0.012, 85],
      [0.9, 0.022, 75],
    ],
  },
  {
    id: "pebble",
    group: "subtle",
    stops: [
      [0.93, 0.008, 90],
      [0.8, 0.012, 250],
    ],
    angle: 160,
  },
  {
    id: "parchment",
    group: "subtle",
    stops: [
      [0.96, 0.025, 95],
      [0.88, 0.035, 80],
    ],
    type: "radial",
    center: [50, 40],
  },
  {
    id: "dawn-gray",
    group: "subtle",
    stops: [
      [0.95, 0.012, 30],
      [0.85, 0.02, 280],
    ],
    angle: 110,
  },
  {
    id: "slate",
    group: "subtle",
    stops: [
      [0.7, 0.02, 250],
      [0.48, 0.025, 255],
    ],
    angle: 150,
  },
];

const GRADIENTS: readonly CuratedGradient[] = DEFINITIONS.map((def) => ({
  ...def,
  colors: def.stops.map(lchToHex),
}));

/** Every curated gradient in display order. */
export function curatedGradients(): readonly CuratedGradient[] {
  return GRADIENTS;
}

export function findGradient(id: string): CuratedGradient | undefined {
  return GRADIENTS.find((g) => g.id === id);
}

/** Similar gradients for an item page: same mood first. */
export function relatedGradients(gradient: CuratedGradient): CuratedGradient[] {
  return relatedItems(GRADIENTS, gradient);
}

/** Gradients per mood group, in group order. */
export function gradientsByGroup(): { group: GradientGroup; items: CuratedGradient[] }[] {
  return GRADIENT_GROUPS.map((group) => ({
    group,
    items: GRADIENTS.filter((g) => g.group === group),
  }));
}

/** Message keys of a gradient's texts. */
export const gradientKeys = (id: string) => ({
  name: `GradientCollection.items.${id}.name`,
  description: `GradientCollection.items.${id}.description`,
});
