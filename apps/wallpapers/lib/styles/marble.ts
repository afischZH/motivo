import { createNoise2D, hexToRgb, oklchToHex, pngDataUri } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { fbm, fieldSize, fieldSvg, presetsFor, smoothstep } from "./shared";

/**
 * Marble and fluid art. "marble" draws stone with soft clouding, fine
 * turbulent veins and optional broken gold veins. "pour" draws an acrylic
 * pour: twice domain-warped noise cut into colour bands, with thin bright
 * cells where the paints meet.
 */
const ID = "marble";
const MODES = ["marble", "pour"] as const;

/** Longest raster edge; veins stay crisp enough when scaled up. */
const FIELD_EDGE = 520;

const schema = z.object({
  mode: z.enum(MODES),
  background: colorSchema,
  vein: colorSchema,
  accent: colorSchema,
  /** Pour colours, in order. */
  palette: paletteSchema,
  turbulence: z.number().min(0).max(100),
  /** Veins or bands across the screen. */
  scale: z.number().min(1).max(12),
  /** Broken gold veins (marble) or bright cells (pour). */
  accentLines: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  mode: "marble",
  background: "#f2f0ec",
  vein: "#5d5a58",
  accent: "#c9a14a",
  palette: ["#0f3d5c", "#f2e9dc", "#e07a5f", "#3d405b", "#81b29a"],
  turbulence: 60,
  scale: 4,
  accentLines: true,
};

export const marbleTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["carrara", {}, 2],
    [
      "nero",
      { background: "#141414", vein: "#e8e4dc", accent: "#d4af37", turbulence: 70, scale: 3 },
      5,
    ],
    [
      "verde",
      {
        background: "#123d33",
        vein: "#d9eadf",
        accent: "#e9d8a6",
        turbulence: 80,
        scale: 5,
        accentLines: false,
      },
      7,
    ],
    [
      "rosa",
      { background: "#f3dcd6", vein: "#9b6b66", accent: "#e8c07a", turbulence: 45, scale: 3.5 },
      3,
    ],
    [
      "ocean-pour",
      {
        mode: "pour",
        palette: ["#06283d", "#1363df", "#47b5ff", "#dff6ff", "#0b4f6c"],
        accent: "#ffffff",
        turbulence: 70,
        scale: 5,
      },
      4,
    ],
    [
      "sunset-pour",
      {
        mode: "pour",
        palette: ["#3d1e6d", "#ff5f6d", "#ffc371", "#fff1e0", "#c33764"],
        accent: "#fff6e8",
        turbulence: 85,
        scale: 6,
      },
      9,
    ],
  ]),
  randomize(rng, current, locks) {
    const pour = rng.bool(0.4);
    const dark = rng.bool(0.35);
    const hue = rng.float(0, 360);
    const step = rng.float(30, 80);
    const next: Params = {
      ...current,
      mode: pour ? "pour" : "marble",
      background: oklchToHex({ l: dark ? 0.18 : 0.94, c: rng.float(0.005, 0.04), h: hue }),
      vein: oklchToHex({ l: dark ? 0.88 : 0.42, c: 0.02, h: hue }),
      accent: pour ? "#ffffff" : oklchToHex({ l: 0.75, c: 0.12, h: rng.float(70, 90) }),
      palette: Array.from({ length: rng.int(3, 5) }, (_, i) =>
        oklchToHex({
          l: [0.3, 0.92, 0.65, 0.45, 0.8][i] ?? 0.6,
          c: rng.float(0.05, 0.16),
          h: (hue + i * step) % 360,
        }),
      ),
      turbulence: rng.int(35, 90),
      scale: rng.float(2.5, 7),
      accentLines: rng.bool(0.6),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const { cols, rows } = fieldSize(w, h, FIELD_EDGE);
      const noise = createNoise2D(rng);
      const extra = createNoise2D(rng);
      const area = Math.sqrt(cols * rows);
      const freq = p.scale / area;
      const turb = p.turbulence / 100;
      const angle = rng.float(-0.9, 0.9) + (h > w ? Math.PI / 2 : 0);
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const data = new Uint8ClampedArray(cols * rows * 4);

      if (p.mode === "marble") {
        const bg = hexToRgb(p.background);
        const vein = hexToRgb(p.vein);
        const gold = hexToRgb(p.accent);
        const goldAngle = angle + rng.float(0.5, 1.1);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const u = x * freq;
            const v = y * freq;
            // Gentle domain warp: veins drift and branch but never knot up.
            const warp = fbm(noise, u * 0.45, v * 0.45, 5);
            const along = (x * ca + y * sa) * freq * 0.6 * Math.PI;
            const s = Math.sin(along + warp * (1.2 + turb * 4.5));
            const a = 1 - Math.abs(s);
            // Thin dark vein inside a softer haze.
            let amount = Math.pow(a, 28) * 0.8 + Math.pow(a, 5) * 0.2;
            const cloud = fbm(extra, u * 1.7, v * 1.7, 4) * 0.08;
            let r = bg.r + cloud + (vein.r - bg.r) * amount;
            let g = bg.g + cloud + (vein.g - bg.g) * amount;
            let b = bg.b + cloud + (vein.b - bg.b) * amount;
            if (p.accentLines) {
              const ga = (x * Math.cos(goldAngle) + y * Math.sin(goldAngle)) * freq * 1.6;
              const gs = 1 - Math.abs(Math.sin(ga + warp * (2 + turb * 5)));
              // Broken: only where a slow noise allows it.
              amount = Math.pow(gs, 50) * smoothstep(0.05, 0.3, extra(u * 0.6 + 9, v * 0.6 - 4));
              r += (gold.r - r) * amount;
              g += (gold.g - g) * amount;
              b += (gold.b - b) * amount;
            }
            const i = (y * cols + x) * 4;
            data[i] = r * 255;
            data[i + 1] = g * 255;
            data[i + 2] = b * 255;
            data[i + 3] = 255;
          }
        }
        return fieldSvg(w, h, p.background, pngDataUri({ width: cols, height: rows, data }, "rgb"));
      }

      // Pour: domain warping twice gives the folded, poured look.
      const palette = (p.palette.length > 0 ? p.palette : defaults.palette).map(hexToRgb);
      const cell = hexToRgb(p.accent);
      const bands = palette.length * (1 + Math.round(turb * 2));
      const warpBy = 1.5 + turb * 3.5;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const u = x * freq * 0.5;
          const v = y * freq * 0.5;
          const qx = fbm(noise, u, v, 4);
          const qy = fbm(noise, u + 5.2, v + 1.3, 4);
          const rx = fbm(extra, u + warpBy * qx + 1.7, v + warpBy * qy + 9.2, 4);
          const t = (rx * 0.5 + 0.5 + qx * 0.35) * bands;
          const k = Math.floor(t);
          const f = t - k;
          const c0 = palette[(((k % palette.length) + palette.length) % palette.length) | 0];
          const c1 = palette[((((k + 1) % palette.length) + palette.length) % palette.length) | 0];
          const fallback = palette[0] ?? cell;
          const a = c0 ?? fallback;
          const b2 = c1 ?? fallback;
          // Soft blend at the band edge, with a thin bright cell line on it.
          const blend = smoothstep(0.86, 1, f);
          const line = p.accentLines ? Math.pow(1 - Math.abs(f - 0.93) / 0.07, 3) * 0.85 : 0;
          const edge = Math.max(0, line);
          const r = a.r + (b2.r - a.r) * blend;
          const g = a.g + (b2.g - a.g) * blend;
          const b = a.b + (b2.b - a.b) * blend;
          const i = (y * cols + x) * 4;
          data[i] = (r + (cell.r - r) * edge) * 255;
          data[i + 1] = (g + (cell.g - g) * edge) * 255;
          data[i + 2] = (b + (cell.b - b) * edge) * 255;
          data[i + 3] = 255;
        }
      }
      const first = p.palette[0] ?? p.background;
      return fieldSvg(w, h, first, pngDataUri({ width: cols, height: rows, data }, "rgb"));
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
