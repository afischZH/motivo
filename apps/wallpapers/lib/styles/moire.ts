import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, svgOpen } from "./shared";
import { oklchToHex } from "@musterli/engine";

/**
 * Moiré: two sets of fine concentric rings with slightly shifted centres.
 * Where they cross, interference fringes appear, a classic optical effect
 * that needs only circles. A second ink colour turns the fringes into
 * colour shifts.
 */
const ID = "moire";
const MAX_RINGS = 260;

const schema = z.object({
  background: colorSchema,
  ink: colorSchema,
  ink2: colorSchema,
  /** Ring spacing in design pixels. */
  spacing: z.number().min(3).max(40),
  /** Line weight in percent of the spacing. */
  weight: z.number().min(10).max(70),
  /** Distance between the two centres, percent of the short edge. */
  shift: z.number().min(1).max(60),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#f4f1ea",
  ink: "#141414",
  ink2: "#141414",
  spacing: 12,
  weight: 40,
  shift: 18,
};

export const moireTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["print", {}, 1],
    [
      "night",
      { background: "#05060a", ink: "#e8e8f0", ink2: "#e8e8f0", spacing: 7, weight: 30, shift: 24 },
      2,
    ],
    [
      "chroma",
      { background: "#ffffff", ink: "#ff2a6d", ink2: "#05d9e8", spacing: 8, weight: 45, shift: 12 },
      3,
    ],
    [
      "deep",
      {
        background: "#0b132b",
        ink: "#5bc0be",
        ink2: "#3a506b",
        spacing: 12,
        weight: 50,
        shift: 35,
      },
      4,
    ],
    [
      "ripple",
      { background: "#fdf6e3", ink: "#cb4b16", ink2: "#268bd2", spacing: 5, weight: 35, shift: 6 },
      5,
    ],
    [
      "bold",
      {
        background: "#ffd60a",
        ink: "#000814",
        ink2: "#000814",
        spacing: 18,
        weight: 55,
        shift: 45,
      },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.5);
    const hue = rng.float(0, 360);
    const ink = oklchToHex({ l: dark ? 0.85 : 0.35, c: rng.float(0, 0.2), h: hue });
    const next: Params = {
      ...current,
      background: oklchToHex({ l: dark ? 0.12 : 0.96, c: 0.02, h: (hue + 180) % 360 }),
      ink,
      ink2: rng.bool(0.5)
        ? ink
        : oklchToHex({ l: dark ? 0.8 : 0.45, c: 0.18, h: (hue + 150) % 360 }),
      spacing: rng.int(5, 16),
      weight: rng.int(25, 55),
      shift: rng.int(5, 40),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const angle = rng.float(0, Math.PI * 2);
      const d = (short * p.shift) / 200;
      const cx = w / 2;
      const cy = h * (h > w ? 0.58 : 0.5);
      const centres: [number, number][] = [
        [cx - Math.cos(angle) * d, cy - Math.sin(angle) * d],
        [cx + Math.cos(angle) * d, cy + Math.sin(angle) * d],
      ];
      const reach = Math.hypot(w, h) * 0.75 + d;
      const spacing = Math.max(p.spacing, reach / MAX_RINGS);
      const sw = (spacing * p.weight) / 100;
      const sets = centres.map(([x, y], k) => {
        const rings: string[] = [];
        for (let r = spacing; r < reach; r += spacing) {
          rings.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>`);
        }
        const color = k === 0 ? p.ink : p.ink2;
        return `<g fill="none" stroke="${color}" stroke-width="${n(sw)}">${rings.join("")}</g>`;
      });
      return `${svgOpen(w, h)}<rect width="${w}" height="${h}" fill="${p.background}"/>${sets.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
