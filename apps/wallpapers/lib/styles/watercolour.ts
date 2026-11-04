import { createNoise2D, hexToRgb, oklchToHex, pngDataUri } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { fbm, fieldSize, fieldSvg, presetsFor, smoothstep } from "./shared";

/**
 * Watercolour: loose washes on textured paper. Each wash has a ragged edge
 * where pigment pools darker, overlapping washes mix like glazes
 * (multiply), and paper grain and granulation break up the colour.
 */
const ID = "watercolour";

/** Longest raster edge; enough for the paper grain. */
const FIELD_EDGE = 520;

const schema = z.object({
  paper: colorSchema,
  palette: paletteSchema,
  washes: z.int().min(1).max(9),
  /** Ragged, bleeding edges 0 to 100. */
  bleed: z.number().min(0).max(100),
  /** Pigment speckle and paper texture 0 to 100. */
  granulation: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  paper: "#fbf8f2",
  palette: ["#7fb7d9", "#f2a7a0", "#f6d48b", "#9cc9a5"],
  washes: 5,
  bleed: 55,
  granulation: 45,
};

export const watercolourTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["spring", {}, 3],
    ["indigo", { palette: ["#2f4b7c", "#6f8fbf", "#a9c1e0"], washes: 4, granulation: 70 }, 6],
    ["blush", { paper: "#fdf6f4", palette: ["#f4b6c2", "#f7d1c4", "#e8a0b4"], washes: 6 }, 2],
    [
      "sage",
      { paper: "#f7f6ef", palette: ["#9db59a", "#c9d6b8", "#6f8f72"], washes: 4, bleed: 35 },
      8,
    ],
    ["sunset", { palette: ["#f28f3b", "#c8553d", "#f6d48b", "#8e5572"], washes: 7, bleed: 75 }, 5],
    [
      "ink",
      { paper: "#f5f2ea", palette: ["#2b2d42", "#5c6378"], washes: 3, bleed: 85, granulation: 80 },
      9,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const step = rng.float(25, 90);
    const next: Params = {
      ...current,
      paper: oklchToHex({ l: 0.975, c: 0.01, h: rng.float(60, 100) }),
      palette: Array.from({ length: rng.int(2, 4) }, (_, i) =>
        oklchToHex({
          l: rng.float(0.6, 0.82),
          c: rng.float(0.06, 0.13),
          h: (hue + i * step) % 360,
        }),
      ),
      washes: rng.int(3, 7),
      bleed: rng.int(25, 85),
      granulation: rng.int(20, 75),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const { cols, rows } = fieldSize(w, h, FIELD_EDGE);
      const noise = createNoise2D(rng);
      const grain = createNoise2D(rng);
      const area = Math.sqrt(cols * rows);
      const portrait = h > w;
      const bleed = p.bleed / 100;
      const gran = p.granulation / 100;
      const palette = p.palette.length > 0 ? p.palette : defaults.palette;

      const washes = Array.from({ length: p.washes }, (_, i) => {
        const r = area * rng.float(0.28, 0.55) * (i === 0 ? 1.3 : 1);
        return {
          x: rng.float(0, cols),
          // On phones the washes gather below the clock.
          y: portrait ? rng.float(rows * 0.28, rows * 1.05) : rng.float(0, rows),
          r,
          sx: rng.float(0.75, 1.3),
          sy: rng.float(0.75, 1.3),
          o: rng.float(0, 100),
          strength: rng.float(0.45, 0.75),
          color: hexToRgb(palette[i % palette.length] ?? "#7fb7d9"),
        };
      });

      const paper = hexToRgb(p.paper);
      const data = new Uint8ClampedArray(cols * rows * 4);
      const f = 2.2 / area;
      const g = 18 / area;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const fine = grain(x * g, y * g);
          let r = paper.r * (1 - 0.035 * (fine * 0.5 + 0.5));
          let gg = paper.g * (1 - 0.035 * (fine * 0.5 + 0.5));
          let b = paper.b * (1 - 0.04 * (fine * 0.5 + 0.5));
          for (const wash of washes) {
            const dx = (x - wash.x) / (wash.r * wash.sx);
            const dy = (y - wash.y) / (wash.r * wash.sy);
            const d0 = Math.hypot(dx, dy);
            if (d0 > 1.8) continue;
            const d = d0 + fbm(noise, x * f + wash.o, y * f - wash.o, 4) * (0.15 + bleed * 0.5);
            const inside = smoothstep(1, 0.96 - bleed * 0.08, d);
            if (inside <= 0) continue;
            // Pigment pools at the rim; centre stays lighter.
            const rim = smoothstep(0.55, 0.98, d) * 0.6;
            const speck = 1 - gran * 0.5 * Math.max(0, fine);
            const a = inside * wash.strength * (0.55 + rim) * speck;
            r *= 1 - a * (1 - wash.color.r);
            gg *= 1 - a * (1 - wash.color.g);
            b *= 1 - a * (1 - wash.color.b);
          }
          const i = (y * cols + x) * 4;
          data[i] = r * 255;
          data[i + 1] = gg * 255;
          data[i + 2] = b * 255;
          data[i + 3] = 255;
        }
      }
      return fieldSvg(w, h, p.paper, pngDataUri({ width: cols, height: rows, data }, "rgb"));
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
