import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Swiss poster: a few bold flat figures (circles, half and quarter circles,
 * rings, triangles) snapped to a modular grid, one large hero figure
 * and smaller ones around it, like a modernist poster. With `overprint`
 * the colours multiply where they overlap, like risograph inks.
 */
const ID = "swiss-poster";
const FIGURES = ["circle", "half", "quarter", "ring", "triangle"] as const;
type Figure = (typeof FIGURES)[number];

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  /** Grid columns across the short edge. */
  columns: z.int().min(2).max(8),
  figures: z.int().min(2).max(14),
  overprint: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#f1ece2",
  palette: ["#e8442e", "#1f4e9c", "#f5b700", "#111111"],
  columns: 4,
  figures: 7,
  overprint: false,
};

function figure(kind: Figure, x: number, y: number, s: number, turn: number, fill: string): string {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const rot = turn ? ` transform="rotate(${turn * 90} ${n(cx)} ${n(cy)})"` : "";
  switch (kind) {
    case "circle":
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s / 2)}" fill="${fill}"/>`;
    case "half":
      // Flat edge a quarter below the centre, so the figure sits centred in its cell.
      return `<path d="M${n(x)} ${n(y + s * 0.75)}A${n(s / 2)} ${n(s / 2)} 0 0 1 ${n(x + s)} ${n(y + s * 0.75)}Z"${rot} fill="${fill}"/>`;
    case "quarter":
      return `<path d="M${n(x)} ${n(y + s)}L${n(x)} ${n(y)}A${n(s)} ${n(s)} 0 0 1 ${n(x + s)} ${n(y + s)}Z"${rot} fill="${fill}"/>`;
    case "ring": {
      const sw = s * 0.16;
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s / 2 - sw / 2)}" fill="none" stroke="${fill}" stroke-width="${n(sw)}"/>`;
    }
    case "triangle":
      return `<path d="M${n(x)} ${n(y + s)}L${n(x + s)} ${n(y + s)}L${n(x)} ${n(y)}Z"${rot} fill="${fill}"/>`;
  }
}

export const swissPosterTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["basel", {}, 3],
    [
      "riso",
      {
        background: "#f7f1e5",
        palette: ["#ff48b0", "#0078bf", "#ffe800"],
        overprint: true,
        figures: 9,
      },
      12,
    ],
    [
      "noir",
      {
        background: "#111111",
        palette: ["#f2f2f2", "#ff3b1f", "#7a7a7a"],
        columns: 5,
        figures: 8,
      },
      8,
    ],
    [
      "sage",
      {
        background: "#e9ece4",
        palette: ["#2f4b3a", "#c9a227", "#d26a4c", "#8fa98b"],
        columns: 3,
        figures: 5,
      },
      21,
    ],
    [
      "bauhaus",
      {
        background: "#efe7d6",
        palette: ["#d7263d", "#1b998b", "#2e294e", "#f46036"],
        columns: 6,
        figures: 12,
      },
      5,
    ],
    [
      "pastel",
      {
        background: "#fff8f0",
        palette: ["#ffb5a7", "#a0c4ff", "#caffbf", "#bdb2ff"],
        columns: 4,
        figures: 9,
        overprint: true,
      },
      17,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.25);
    const next: Params = {
      ...current,
      background: dark ? "#141414" : "#f3eee4",
      palette: huePalette(rng, rng.int(3, 4), { l: [0.6, 0.35], c: [0.12, 0.2] }, 110),
      columns: rng.int(3, 6),
      figures: rng.int(4, 11),
      overprint: !dark && rng.bool(0.35),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const cell = Math.min(w, h) / p.columns;
      // Whole cells only, centred: figures never hang off the edge.
      const cols = Math.max(1, Math.floor(w / cell));
      const rows = Math.max(1, Math.floor(h / cell));
      const ox = (w - cols * cell) / 2;
      const oy = (h - rows * cell) / 2;
      const blend = p.overprint ? ` style="mix-blend-mode:multiply"` : "";
      const parts = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`, `<g${blend}>`];
      for (let i = 0; i < p.figures; i++) {
        // The first figure is the hero: big, near the optical centre.
        const span = i === 0 ? Math.min(cols, rows, rng.int(2, 4)) : rng.pick([1, 1, 1, 2, 2]);
        const col = i === 0 ? rng.int(0, Math.max(0, cols - span)) : rng.int(0, cols - 1);
        const row =
          i === 0
            ? rng.int(Math.floor(rows * 0.35), Math.max(Math.floor(rows * 0.35), rows - span))
            : rng.int(0, rows - 1);
        const kind = i === 0 ? rng.pick(["circle", "half", "quarter"] as const) : rng.pick(FIGURES);
        const fill = p.palette[i % p.palette.length] ?? "#000";
        // Stay on the canvas: shift big figures back inside.
        const x = ox + Math.max(0, Math.min(col, cols - span)) * cell;
        const y = oy + Math.max(0, Math.min(row, rows - span)) * cell;
        parts.push(figure(kind, x, y, span * cell, rng.int(0, 3), fill));
      }
      parts.push("</g>");
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
