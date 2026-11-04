import { defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientLookup, huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Pixel gradient: a gradient broken into square cells, each cell one flat
 * colour with a little seeded jitter, like a low-resolution photo of a
 * sunset. Cells keep their size on every screen (design pixels), so a
 * monitor gets more cells, not bigger ones; the count is capped.
 */
const ID = "pixel-gradient";
const MAX_CELLS = 12_000;

const schema = z.object({
  palette: paletteSchema,
  /** Cell edge in design pixels. */
  cell: z.int().min(8).max(160),
  /** Gradient direction in degrees (0 = top to bottom). */
  angle: z.number().min(0).max(360),
  /** Random shift along the gradient, percent. */
  jitter: z.number().min(0).max(100),
  /** Gap between cells in percent of a cell. */
  gap: z.number().min(0).max(40),
  /** Corner radius in percent of a cell. */
  radius: z.number().min(0).max(50),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  palette: ["#1a1446", "#6a2c70", "#e2526a", "#ffb26b", "#ffe8a3"],
  cell: 36,
  angle: 0,
  jitter: 25,
  gap: 0,
  radius: 0,
};

export const pixelGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["sunset", {}],
    [
      "lagoon",
      { palette: ["#03071e", "#023e8a", "#0096c7", "#48cae4", "#caf0f8"], cell: 28, angle: 160 },
    ],
    [
      "mint",
      {
        palette: ["#f1faee", "#a8dadc", "#457b9d", "#1d3557"],
        cell: 44,
        angle: 45,
        gap: 10,
        radius: 20,
      },
    ],
    [
      "ember",
      { palette: ["#000000", "#370617", "#9d0208", "#e85d04", "#ffba08"], cell: 20, jitter: 45 },
    ],
    [
      "candy",
      {
        palette: ["#ff99c8", "#fcf6bd", "#d0f4de", "#a9def9", "#e4c1f9"],
        cell: 56,
        angle: 120,
        gap: 14,
        radius: 50,
      },
    ],
    [
      "mono",
      { palette: ["#0b0b0b", "#3a3a3a", "#9a9a9a", "#f2f2f2"], cell: 24, angle: 200, jitter: 60 },
    ],
  ]),
  randomize(rng, current, locks) {
    const next: Params = {
      ...current,
      palette: huePalette(rng, rng.int(3, 5), { l: [0.2, 0.92], c: [0.08, 0.18] }, 50),
      angle: rng.int(0, 359),
      jitter: rng.int(10, 50),
      cell: rng.int(16, 64),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const color = gradientLookup(p.palette);
      const cell = Math.max(p.cell, Math.sqrt((w * h) / MAX_CELLS));
      const cols = Math.ceil(w / cell);
      const rows = Math.ceil(h / cell);
      const a = (p.angle * Math.PI) / 180;
      const dx = Math.sin(a);
      const dy = Math.cos(a);
      // Project the corners to normalise t to 0..1 over the screen.
      const proj = (x: number, y: number) => x * dx + y * dy;
      const corners = [proj(0, 0), proj(w, 0), proj(0, h), proj(w, h)];
      const lo = Math.min(...corners);
      const span = Math.max(...corners) - lo || 1;
      const inset = (cell * p.gap) / 200;
      // Without a gap, cells overlap by half a pixel: no hairline seams from anti-aliasing.
      const size = inset > 0 ? cell - inset * 2 : cell + 0.5;
      const r = (size * p.radius) / 100;
      const rx = r > 0 ? ` rx="${n(r)}"` : "";
      const parts: string[] = [
        `<rect width="${w}" height="${h}" fill="${p.palette[0] ?? "#000"}"/>`,
      ];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = col * cell;
          const y = row * cell;
          const t = (proj(x + cell / 2, y + cell / 2) - lo) / span;
          const shifted = t + (rng.next() - 0.5) * (p.jitter / 100) * 0.35;
          parts.push(
            `<rect x="${n(x + inset)}" y="${n(y + inset)}" width="${n(size)}" height="${n(size)}"${rx} fill="${color(shifted)}"/>`,
          );
        }
      }
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
