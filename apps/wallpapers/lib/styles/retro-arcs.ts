import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Retro arcs: bold concentric rainbow bands in the spirit of 1970s
 * graphics, growing from an anchor point. The palette repeats outwards;
 * `gap` lets the background show between the bands.
 */
const ID = "retro-arcs";
const ANCHORS = ["bottom", "corner", "center", "side"] as const;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  anchor: z.enum(ANCHORS),
  bands: z.int().min(3).max(24),
  /** Gap between bands in percent of a band. */
  gap: z.number().min(0).max(60),
  /** Size of the largest arc relative to the screen. */
  size: z.number().min(40).max(160),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#f6ead7",
  palette: ["#e4572e", "#f3a712", "#a8c686", "#29335c"],
  anchor: "bottom",
  bands: 8,
  gap: 0,
  size: 110,
};

function anchorPoint(anchor: (typeof ANCHORS)[number], w: number, h: number): [number, number] {
  switch (anchor) {
    case "bottom":
      return [w / 2, h];
    case "corner":
      return [0, h];
    case "center":
      return [w / 2, h / 2];
    case "side":
      return [0, h / 2];
  }
}

export const retroArcsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["seventies", {}],
    [
      "sorbet",
      {
        background: "#fff7f0",
        palette: ["#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#bdb2ff"],
        anchor: "corner",
        bands: 12,
        size: 140,
      },
    ],
    [
      "midnight",
      {
        background: "#0f0e17",
        palette: ["#ff8906", "#f25f4c", "#e53170", "#7f5af0"],
        anchor: "center",
        bands: 16,
        gap: 30,
        size: 120,
      },
    ],
    [
      "earth",
      {
        background: "#efe6d8",
        palette: ["#bc6c25", "#dda15e", "#606c38", "#283618"],
        anchor: "side",
        bands: 10,
        gap: 12,
        size: 150,
      },
    ],
    [
      "mono",
      {
        background: "#111111",
        palette: ["#f5f5f5", "#111111"],
        anchor: "bottom",
        bands: 20,
        size: 130,
      },
    ],
    [
      "ocean",
      {
        background: "#e8f4f8",
        palette: ["#03045e", "#0077b6", "#00b4d8", "#90e0ef"],
        anchor: "corner",
        bands: 9,
        gap: 18,
        size: 120,
      },
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.3);
    const next: Params = {
      ...current,
      palette: huePalette(rng, rng.int(3, 6), { l: [0.85, 0.4], c: [0.08, 0.18] }, 60),
      background: dark ? "#14121c" : "#f6efe4",
      anchor: rng.pick(ANCHORS),
      bands: rng.int(5, 18),
      gap: rng.bool(0.5) ? 0 : rng.int(8, 40),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width: w, height: h }) {
      const [cx, cy] = anchorPoint(p.anchor, w, h);
      const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      const outer = (reach * p.size) / 100;
      const band = outer / p.bands;
      const stroke = band * (1 - p.gap / 100);
      const parts = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      parts.push(`<g fill="none" stroke-width="${n(stroke)}">`);
      for (let i = 0; i < p.bands; i++) {
        const r = outer - band * i - stroke / 2;
        if (r <= 0) break;
        const color = p.palette[i % p.palette.length] ?? "#000";
        parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" stroke="${color}"/>`);
      }
      parts.push("</g>");
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
