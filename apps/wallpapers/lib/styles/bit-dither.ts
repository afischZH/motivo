import { createNoise2D, oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, svgOpen } from "./shared";

/**
 * 1-bit dither: a soft light field (a glow, a slope or drifting clouds)
 * reduced to two colours with an 8×8 Bayer matrix, like an old Mac screen.
 * Pixels are merged into horizontal runs and drawn as one crisp path.
 */
const ID = "bit-dither";
const FIELDS = ["glow", "slope", "clouds"] as const;

const schema = z.object({
  paper: colorSchema,
  ink: colorSchema,
  field: z.enum(FIELDS),
  /** Pixels across the short edge. */
  pixels: z.int().min(40).max(240),
  /** Contrast of the field 0 to 100. */
  contrast: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  paper: "#e8e4d8",
  ink: "#1d1b24",
  field: "glow",
  pixels: 120,
  contrast: 55,
};

const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

export const bitDitherTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["classic", {}, 1],
    ["terminal", { paper: "#0b0f0a", ink: "#39ff6a", field: "clouds", pixels: 140 }, 2],
    ["sunset", { paper: "#ffb36b", ink: "#3a0f4a", field: "slope", pixels: 90, contrast: 70 }, 3],
    [
      "blueprint",
      { paper: "#0b3d91", ink: "#dbe9ff", field: "glow", pixels: 160, contrast: 40 },
      4,
    ],
    ["gameboy", { paper: "#c4cfa1", ink: "#2c3b24", field: "clouds", pixels: 72 }, 5],
    ["fine", { paper: "#ffffff", ink: "#000000", field: "slope", pixels: 220, contrast: 85 }, 6],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const dark = rng.bool(0.4);
    const next: Params = {
      ...current,
      paper: oklchToHex({ l: dark ? 0.15 : 0.92, c: rng.float(0.02, 0.08), h: hue }),
      ink: oklchToHex({
        l: dark ? 0.85 : 0.2,
        c: rng.float(0.05, 0.2),
        h: (hue + rng.float(90, 200)) % 360,
      }),
      field: rng.pick(FIELDS),
      pixels: rng.int(70, 180),
      contrast: rng.int(35, 80),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const px = Math.min(w, h) / p.pixels;
      const cols = Math.ceil(w / px);
      const rows = Math.ceil(h / px);
      const noise = createNoise2D(rng);
      const gx = rng.float(0.25, 0.75);
      const gy = rng.float(0.3, 0.7);
      const angle = rng.float(0, Math.PI * 2);
      const k = 0.5 + p.contrast / 100;
      const short = Math.min(cols, rows);
      const field = (x: number, y: number): number => {
        const u = x / cols;
        const v = y / rows;
        switch (p.field) {
          case "glow":
            return 1 - Math.hypot((u - gx) * cols, (v - gy) * rows) / (short * 0.9);
          case "slope":
            return (
              0.5 +
              ((u - 0.5) * Math.cos(angle) * cols + (v - 0.5) * Math.sin(angle) * rows) /
                (Math.hypot(cols, rows) * 0.8)
            );
          case "clouds":
            return (
              0.5 +
              0.5 * noise((x / short) * 3, (y / short) * 3) +
              0.2 * noise((x / short) * 7 + 9, (y / short) * 7)
            );
        }
      };
      let d = "";
      for (let y = 0; y < rows; y++) {
        let run = -1;
        for (let x = 0; x <= cols; x++) {
          const on =
            x < cols && 0.5 + (field(x, y) - 0.5) * k > (BAYER[(y % 8) * 8 + (x % 8)] ?? 0.5);
          if (on && run < 0) run = x;
          if (!on && run >= 0) {
            d += `M${n(run * px)} ${n(y * px)}h${n((x - run) * px)}v${n(px)}h${n(-(x - run) * px)}z`;
            run = -1;
          }
        }
      }
      return `${svgOpen(w, h)}<rect width="${w}" height="${h}" fill="${p.paper}"/><path d="${d}" fill="${p.ink}" shape-rendering="crispEdges"/></svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
