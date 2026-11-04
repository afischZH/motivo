import { createNoise2D, hexToRgb, oklchToHex, pngDataUri } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { fbm, fieldSize, fieldSvg, gradientLookup, presetsFor } from "./shared";

/**
 * Iridescent foil: crumpled holographic foil. A crinkled height field is
 * lit like metal, and the tilt of every facet picks a colour from a looping
 * rainbow, the way thin-film foil shifts hue as it bends.
 */
const ID = "iridescent-foil";

/** Longest raster edge; the foil is smooth enough to scale up cleanly. */
const FIELD_EDGE = 440;

const schema = z.object({
  base: colorSchema,
  palette: paletteSchema,
  /** 0 = soft waves, 100 = sharp crinkles. */
  crinkle: z.number().min(0).max(100),
  /** Number of folds across the screen. */
  scale: z.number().min(1).max(10),
  sheen: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  base: "#c9ccd6",
  palette: ["#ffb3e6", "#b8a6ff", "#8fe3ff", "#b6ffcf", "#fff3a6"],
  crinkle: 55,
  scale: 3.5,
  sheen: 60,
};

export const iridescentFoilTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["holo", {}, 3],
    [
      "oil",
      {
        base: "#0d0f1a",
        palette: ["#2b2dff", "#00d1b2", "#e6ff3d", "#ff3db8", "#7a1cff"],
        crinkle: 35,
        scale: 2.5,
      },
      5,
    ],
    [
      "pearl",
      {
        base: "#f4efe9",
        palette: ["#ffe3ef", "#e3f1ff", "#f2ffe8", "#fff5dc"],
        crinkle: 20,
        scale: 2,
        sheen: 80,
      },
      2,
    ],
    [
      "rose-gold",
      { base: "#d7a58f", palette: ["#ffd1c1", "#ffb3c7", "#f6d79a", "#ffe9d6"], crinkle: 70 },
      8,
    ],
    [
      "crumpled",
      {
        base: "#9aa0b4",
        palette: ["#ff8ad8", "#8af0ff", "#c4ff8a", "#ffd98a", "#b48aff"],
        crinkle: 95,
        scale: 6,
      },
      4,
    ],
    [
      "aurora",
      {
        base: "#08131c",
        palette: ["#3dffb0", "#3dc8ff", "#9b6bff", "#3dffb0"],
        crinkle: 15,
        scale: 1.6,
        sheen: 40,
      },
      7,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.3);
    const hue = rng.float(0, 360);
    const count = rng.int(3, 5);
    const step = rng.float(40, 90);
    const next: Params = {
      ...current,
      base: oklchToHex({ l: dark ? 0.15 : rng.float(0.75, 0.88), c: 0.02, h: hue }),
      palette: Array.from({ length: count }, (_, i) =>
        oklchToHex({
          l: dark ? 0.72 : 0.88,
          c: dark ? 0.18 : rng.float(0.07, 0.12),
          h: (hue + i * step) % 360,
        }),
      ),
      crinkle: rng.int(10, 95),
      scale: rng.float(1.5, 6),
      sheen: rng.int(30, 85),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const { cols, rows } = fieldSize(w, h, FIELD_EDGE);
      const noise = createNoise2D(rng);
      const warp = createNoise2D(rng);
      const crinkle = p.crinkle / 100;
      // Fold size follows the area, so tall phones get a few broad folds.
      const freq = p.scale / Math.sqrt(cols * rows);

      // Height field: smooth swells blended with ridged (crinkled) noise.
      const W = cols + 1;
      const heights = new Float32Array(W * (rows + 1));
      for (let y = 0; y <= rows; y++) {
        for (let x = 0; x <= cols; x++) {
          const u = x * freq;
          const v = y * freq;
          const wx = u + 0.6 * warp(u * 0.5, v * 0.5);
          const wy = v + 0.6 * warp(u * 0.5 + 7.3, v * 0.5 + 3.1);
          const smooth = fbm(noise, wx, wy, 3);
          let ridged = 0;
          let amp = 0.5;
          let f = 1.6;
          for (let o = 0; o < 4; o++) {
            ridged += amp * (1 - Math.abs(noise(wx * f + 11.7, wy * f - 4.2)));
            amp *= 0.5;
            f *= 2.1;
          }
          heights[y * W + x] = smooth * (1 - crinkle) + (ridged - 0.5) * crinkle * 1.4;
        }
      }

      const palette = p.palette.length > 0 ? p.palette : defaults.palette;
      const rainbow = gradientLookup([...palette, palette[0] ?? "#ffffff"]);
      const ramp = Array.from({ length: 256 }, (_, i) => hexToRgb(rainbow(i / 255)));
      const base = hexToRgb(p.base);
      const sheen = p.sheen / 100;
      const strength = (6 + crinkle * 10) / (freq * Math.sqrt(cols * rows) + 1);
      const L = [-0.45, -0.6, 0.66];
      const bands = 1.4 + crinkle * 1.2;
      const data = new Uint8ClampedArray(cols * rows * 4);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const at = y * W + x;
          const h0 = heights[at] ?? 0;
          const dx = ((heights[at + 1] ?? h0) - h0) * strength;
          const dy = ((heights[at + W] ?? h0) - h0) * strength;
          const len = Math.hypot(dx, dy, 1);
          const nx = -dx / len;
          const ny = -dy / len;
          const nz = 1 / len;
          const diffuse = Math.max(0, nx * (L[0] ?? 0) + ny * (L[1] ?? 0) + nz * (L[2] ?? 1));
          // Tilt plus a slow drift across the sheet picks the hue.
          const t = (nx * 0.9 + ny * 0.7) * bands + h0 * 0.8 + (x + y) / (cols + rows);
          const c = ramp[Math.floor((t - Math.floor(t)) * 255)] ?? base;
          const spec = Math.pow(Math.max(0, diffuse), 18) * sheen;
          const light = 0.55 + 0.5 * diffuse;
          const i = (y * cols + x) * 4;
          const mix = 0.72;
          const r = (base.r + (c.r - base.r) * mix) * light;
          const g = (base.g + (c.g - base.g) * mix) * light;
          const b = (base.b + (c.b - base.b) * mix) * light;
          data[i] = (r + (1 - r) * spec) * 255;
          data[i + 1] = (g + (1 - g) * spec) * 255;
          data[i + 2] = (b + (1 - b) * spec) * 255;
          data[i + 3] = 255;
        }
      }
      return fieldSvg(w, h, p.base, pngDataUri({ width: cols, height: rows, data }, "rgb"));
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
