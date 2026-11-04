import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, shade, svgOpen } from "./shared";

/**
 * Iso cubes: an isometric field of cubes, each with a lit top, a mid left
 * and a dark right face. `gaps` removes cubes to show the floor. Faces get
 * a hairline stroke in their own colour, which hides anti-aliasing seams.
 */
const ID = "iso-cubes";
const MAX_CUBES = 5000;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  /** Cube edge in design pixels. */
  size: z.int().min(12).max(200),
  /** Share of missing cubes, percent. */
  gaps: z.number().min(0).max(80),
  /** Contrast between the faces, percent. */
  contrast: z.number().min(10).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#1b1f3a",
  palette: ["#ff6b6b", "#feca57", "#48dbfb", "#f5f6fa"],
  size: 44,
  gaps: 20,
  contrast: 55,
};

export const isoCubesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["arcade", {}, 3],
    [
      "marble",
      { background: "#d9d4cc", palette: ["#f4f1ec", "#c9c1b6"], size: 60, gaps: 0, contrast: 40 },
      1,
    ],
    [
      "midnight",
      {
        background: "#0b0e1a",
        palette: ["#3a4a8c", "#5b6fd6", "#24305e"],
        size: 28,
        gaps: 35,
        contrast: 70,
      },
      6,
    ],
    [
      "candy",
      {
        background: "#fff5f7",
        palette: ["#ffadc6", "#ffd6a5", "#bde0fe", "#cdb4db"],
        size: 70,
        gaps: 10,
        contrast: 35,
      },
      9,
    ],
    [
      "mono",
      { background: "#111111", palette: ["#eeeeee", "#bdbdbd"], size: 36, gaps: 45, contrast: 80 },
      4,
    ],
    [
      "terra",
      {
        background: "#2b2118",
        palette: ["#d08c60", "#b56b45", "#e6c79c", "#7d4f39"],
        size: 52,
        gaps: 25,
        contrast: 50,
      },
      12,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.6);
    const next: Params = {
      ...current,
      background: dark ? "#14172b" : "#efe9e1",
      palette: huePalette(rng, rng.int(2, 4), { l: [0.82, 0.55], c: [0.06, 0.18] }, 90),
      size: rng.int(24, 90),
      gaps: rng.int(0, 45),
      contrast: rng.int(35, 75),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      // Cubes ≈ w·h / (√3 · 1.5 · s²): keep the count bounded on very large screens.
      const s = Math.max(p.size, Math.sqrt((w * h) / (Math.sqrt(3) * 1.5 * MAX_CUBES)));
      const hexW = s * Math.sqrt(3);
      const k = p.contrast / 100;
      const faces = p.palette.map((c) => ({
        top: shade(c, 0.35 * k),
        left: c,
        right: shade(c, -0.45 * k),
      }));
      const parts = [
        `<rect width="${w}" height="${h}" fill="${p.background}"/>`,
        `<g stroke-width="0.6" stroke-linejoin="round">`,
      ];
      const rowStep = s * 1.5;
      let row = 0;
      for (let cy = 0; cy < h + 2 * s; cy += rowStep, row++) {
        const shift = row % 2 === 1 ? hexW / 2 : 0;
        for (let cx = -hexW + shift; cx < w + hexW; cx += hexW) {
          if (rng.next() * 100 < p.gaps) continue;
          const f = faces[rng.int(0, faces.length - 1)];
          if (!f) continue;
          const l = n(cx - hexW / 2);
          const r = n(cx + hexW / 2);
          const c = n(cx);
          const yTop = n(cy - s);
          const yUp = n(cy - s / 2);
          const yMid = n(cy);
          const yDown = n(cy + s / 2);
          const yBot = n(cy + s);
          parts.push(
            `<path d="M${c} ${yTop}L${r} ${yUp}L${c} ${yMid}L${l} ${yUp}Z" fill="${f.top}" stroke="${f.top}"/>` +
              `<path d="M${l} ${yUp}L${c} ${yMid}L${c} ${yBot}L${l} ${yDown}Z" fill="${f.left}" stroke="${f.left}"/>` +
              `<path d="M${c} ${yMid}L${r} ${yUp}L${r} ${yDown}L${c} ${yBot}Z" fill="${f.right}" stroke="${f.right}"/>`,
          );
        }
      }
      return `${svgOpen(w, h)}${parts.join("")}</g></svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
