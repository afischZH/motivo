/**
 * Curated palette collection: our own named palettes by mood, defined as
 * OKLCH colours (light to dark where it fits). Clean-room: colours, names
 * and texts were made for Motivo and are not taken from any palette site.
 *
 * Adding one: an entry here, its slugs in `PALETTE_SLUGS` (`i18n/slugs.ts`)
 * and `PaletteCollection.items.<id>` in both message files. The contract
 * tests in `collections.test.ts` and `i18n/slugs.test.ts` name what is missing.
 */
import { lchToHex, relatedItems, type Lch } from "./colors";

/** Mood groups of the overview page, in display order. */
export const PALETTE_GROUPS = ["earthy", "fresh", "pastel", "bold", "dark", "neutral"] as const;
export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

export interface PaletteDefinition {
  id: string;
  group: PaletteGroup;
  /** 4 to 6 colours in OKLCH. */
  colors: readonly Lch[];
}

export interface CuratedPalette {
  id: string;
  group: PaletteGroup;
  lch: readonly Lch[];
  /** The colours as lowercase hex, in order. */
  colors: readonly string[];
  /** Index of the most colourful entry: the base for scales (Tints & Shades, Tailwind). */
  accent: number;
}

const DEFINITIONS: readonly PaletteDefinition[] = [
  // Earthy
  {
    id: "clay-oven",
    group: "earthy",
    colors: [
      [0.94, 0.03, 85],
      [0.79, 0.07, 70],
      [0.63, 0.11, 45],
      [0.46, 0.08, 40],
      [0.3, 0.04, 50],
    ],
  },
  {
    id: "autumn-forest",
    group: "earthy",
    colors: [
      [0.86, 0.12, 88],
      [0.68, 0.15, 55],
      [0.52, 0.14, 35],
      [0.46, 0.07, 130],
      [0.28, 0.04, 140],
    ],
  },
  {
    id: "vineyard",
    group: "earthy",
    colors: [
      [0.92, 0.05, 110],
      [0.73, 0.1, 125],
      [0.5, 0.12, 350],
      [0.35, 0.1, 345],
      [0.25, 0.03, 60],
    ],
  },
  {
    id: "spice-market",
    group: "earthy",
    colors: [
      [0.86, 0.14, 90],
      [0.7, 0.15, 60],
      [0.56, 0.16, 35],
      [0.4, 0.11, 30],
      [0.55, 0.08, 145],
    ],
  },
  {
    id: "sandstone",
    group: "earthy",
    colors: [
      [0.95, 0.025, 80],
      [0.86, 0.045, 72],
      [0.73, 0.065, 62],
      [0.58, 0.06, 52],
      [0.4, 0.03, 45],
    ],
  },
  {
    id: "moorland",
    group: "earthy",
    colors: [
      [0.89, 0.04, 115],
      [0.71, 0.06, 130],
      [0.55, 0.05, 150],
      [0.46, 0.06, 60],
      [0.3, 0.03, 70],
    ],
  },
  // Fresh
  {
    id: "lemongrass",
    group: "fresh",
    colors: [
      [0.97, 0.04, 105],
      [0.9, 0.14, 115],
      [0.76, 0.15, 135],
      [0.56, 0.12, 150],
      [0.35, 0.06, 160],
    ],
  },
  {
    id: "lido",
    group: "fresh",
    colors: [
      [0.96, 0.03, 90],
      [0.86, 0.09, 85],
      [0.76, 0.1, 200],
      [0.58, 0.105, 222],
      [0.4, 0.1, 245],
    ],
  },
  {
    id: "garden-party",
    group: "fresh",
    colors: [
      [0.95, 0.03, 350],
      [0.78, 0.12, 0],
      [0.86, 0.12, 128],
      [0.65, 0.13, 145],
      [0.4, 0.07, 160],
    ],
  },
  {
    id: "mint-ice",
    group: "fresh",
    colors: [
      [0.97, 0.02, 170],
      [0.89, 0.07, 170],
      [0.76, 0.1, 176],
      [0.56, 0.09, 192],
      [0.35, 0.05, 222],
    ],
  },
  {
    id: "spring-market",
    group: "fresh",
    colors: [
      [0.93, 0.1, 100],
      [0.82, 0.1, 350],
      [0.78, 0.09, 300],
      [0.76, 0.13, 150],
      [0.45, 0.08, 252],
    ],
  },
  {
    id: "alpine-meadow",
    group: "fresh",
    colors: [
      [0.96, 0.04, 100],
      [0.86, 0.13, 110],
      [0.7, 0.15, 140],
      [0.64, 0.12, 300],
      [0.4, 0.08, 262],
    ],
  },
  // Pastel
  {
    id: "sorbet",
    group: "pastel",
    colors: [
      [0.9, 0.05, 20],
      [0.92, 0.058, 70],
      [0.94, 0.08, 110],
      [0.9, 0.06, 170],
      [0.87, 0.06, 285],
    ],
  },
  {
    id: "cloud-castle",
    group: "pastel",
    colors: [
      [0.97, 0.012, 280],
      [0.9, 0.04, 280],
      [0.86, 0.06, 250],
      [0.88, 0.06, 330],
      [0.68, 0.09, 282],
    ],
  },
  {
    id: "gelato",
    group: "pastel",
    colors: [
      [0.96, 0.05, 92],
      [0.9, 0.053, 42],
      [0.85, 0.08, 2],
      [0.88, 0.07, 150],
      [0.6, 0.08, 42],
    ],
  },
  {
    id: "watercolor",
    group: "pastel",
    colors: [
      [0.94, 0.04, 222],
      [0.88, 0.06, 200],
      [0.9, 0.06, 140],
      [0.93, 0.044, 62],
      [0.84, 0.07, 332],
    ],
  },
  {
    id: "peony",
    group: "pastel",
    colors: [
      [0.96, 0.02, 350],
      [0.88, 0.07, 355],
      [0.79, 0.1, 0],
      [0.69, 0.12, 5],
      [0.88, 0.05, 130],
    ],
  },
  {
    id: "chalk-drawing",
    group: "pastel",
    colors: [
      [0.92, 0.038, 250],
      [0.93, 0.06, 96],
      [0.88, 0.061, 30],
      [0.87, 0.06, 160],
      [0.34, 0.02, 250],
    ],
  },
  // Bold
  {
    id: "pop-art",
    group: "bold",
    colors: [
      [0.9, 0.18, 100],
      [0.64, 0.24, 25],
      [0.54, 0.2, 265],
      [0.2, 0.01, 265],
      [0.98, 0.005, 95],
    ],
  },
  {
    id: "street-party",
    group: "bold",
    colors: [
      [0.8, 0.16, 75],
      [0.64, 0.23, 355],
      [0.53, 0.22, 302],
      [0.7, 0.118, 205],
      [0.3, 0.06, 282],
    ],
  },
  {
    id: "signal",
    group: "bold",
    colors: [
      [0.97, 0.01, 90],
      [0.86, 0.17, 92],
      [0.6, 0.21, 30],
      [0.45, 0.15, 260],
      [0.24, 0.02, 260],
    ],
  },
  {
    id: "hummingbird",
    group: "bold",
    colors: [
      [0.8, 0.15, 160],
      [0.6, 0.1, 205],
      [0.52, 0.22, 325],
      [0.72, 0.16, 52],
      [0.3, 0.06, 242],
    ],
  },
  {
    id: "workshop",
    group: "bold",
    colors: [
      [0.95, 0.02, 90],
      [0.82, 0.16, 85],
      [0.58, 0.2, 28],
      [0.45, 0.15, 256],
      [0.22, 0.01, 260],
    ],
  },
  {
    id: "fireworks",
    group: "bold",
    colors: [
      [0.24, 0.05, 280],
      [0.64, 0.24, 352],
      [0.86, 0.17, 92],
      [0.72, 0.12, 205],
      [0.58, 0.22, 310],
    ],
  },
  // Dark
  {
    id: "night-train",
    group: "dark",
    colors: [
      [0.2, 0.03, 262],
      [0.3, 0.06, 266],
      [0.45, 0.1, 270],
      [0.76, 0.12, 80],
      [0.91, 0.05, 86],
    ],
  },
  {
    id: "ocean-trench",
    group: "dark",
    colors: [
      [0.18, 0.03, 240],
      [0.28, 0.06, 232],
      [0.4, 0.068, 215],
      [0.6, 0.1, 195],
      [0.86, 0.07, 182],
    ],
  },
  {
    id: "fireside",
    group: "dark",
    colors: [
      [0.2, 0.02, 40],
      [0.32, 0.05, 35],
      [0.48, 0.13, 35],
      [0.68, 0.15, 55],
      [0.88, 0.1, 85],
    ],
  },
  {
    id: "velvet-curtain",
    group: "dark",
    colors: [
      [0.18, 0.03, 330],
      [0.3, 0.09, 350],
      [0.42, 0.14, 10],
      [0.62, 0.1, 62],
      [0.86, 0.05, 82],
    ],
  },
  {
    id: "forest-night",
    group: "dark",
    colors: [
      [0.18, 0.02, 160],
      [0.28, 0.04, 155],
      [0.4, 0.06, 150],
      [0.62, 0.1, 130],
      [0.86, 0.08, 110],
    ],
  },
  {
    id: "planetarium",
    group: "dark",
    colors: [
      [0.16, 0.02, 280],
      [0.3, 0.08, 290],
      [0.45, 0.14, 300],
      [0.7, 0.11, 230],
      [0.93, 0.04, 90],
    ],
  },
  // Neutral
  {
    id: "concrete",
    group: "neutral",
    colors: [
      [0.96, 0.003, 90],
      [0.85, 0.005, 90],
      [0.7, 0.006, 80],
      [0.5, 0.006, 80],
      [0.3, 0.005, 80],
    ],
  },
  {
    id: "wool-sweater",
    group: "neutral",
    colors: [
      [0.95, 0.015, 85],
      [0.86, 0.025, 80],
      [0.7, 0.03, 70],
      [0.52, 0.03, 60],
      [0.35, 0.02, 50],
    ],
  },
  {
    id: "granite",
    group: "neutral",
    colors: [
      [0.95, 0.005, 250],
      [0.8, 0.01, 250],
      [0.62, 0.015, 250],
      [0.45, 0.015, 255],
      [0.25, 0.01, 260],
    ],
  },
  {
    id: "print-shop",
    group: "neutral",
    colors: [
      [0.98, 0.005, 95],
      [0.9, 0.01, 95],
      [0.6, 0.2, 28],
      [0.32, 0.01, 260],
      [0.18, 0.005, 260],
    ],
  },
  {
    id: "timber-cabin",
    group: "neutral",
    colors: [
      [0.95, 0.012, 80],
      [0.85, 0.03, 75],
      [0.68, 0.06, 60],
      [0.5, 0.04, 150],
      [0.3, 0.02, 160],
    ],
  },
  {
    id: "winter-sky",
    group: "neutral",
    colors: [
      [0.97, 0.005, 240],
      [0.9, 0.015, 240],
      [0.78, 0.03, 240],
      [0.6, 0.04, 245],
      [0.4, 0.04, 250],
    ],
  },
];

function accentIndex(colors: readonly Lch[]): number {
  let best = 0;
  colors.forEach(([, c], i) => {
    if (c > (colors[best]?.[1] ?? 0)) best = i;
  });
  return best;
}

const PALETTES: readonly CuratedPalette[] = DEFINITIONS.map((def) => ({
  id: def.id,
  group: def.group,
  lch: def.colors,
  colors: def.colors.map(lchToHex),
  accent: accentIndex(def.colors),
}));

/** Every curated palette in display order. */
export function curatedPalettes(): readonly CuratedPalette[] {
  return PALETTES;
}

export function findPalette(id: string): CuratedPalette | undefined {
  return PALETTES.find((p) => p.id === id);
}

/** Similar palettes for an item page: same mood first. */
export function relatedPalettes(palette: CuratedPalette): CuratedPalette[] {
  return relatedItems(PALETTES, palette);
}

/** Palettes per mood group, in group order. */
export function palettesByGroup(): { group: PaletteGroup; items: CuratedPalette[] }[] {
  return PALETTE_GROUPS.map((group) => ({
    group,
    items: PALETTES.filter((p) => p.group === group),
  }));
}

/** Message keys of a palette's texts. */
export const paletteKeys = (id: string) => ({
  name: `PaletteCollection.items.${id}.name`,
  description: `PaletteCollection.items.${id}.description`,
});
