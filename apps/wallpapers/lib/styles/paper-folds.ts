import { defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientAt, huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Paper folds: wide bands like a folded paper strip, each band shaded on
 * one half so it reads as a crease, at any angle. Colours run along the
 * palette across the bands.
 */
const ID = "paper-folds";

const schema = z.object({
  palette: paletteSchema,
  bands: z.int().min(3).max(24),
  /** Band direction in degrees. */
  angle: z.number().min(0).max(180),
  /** Crease shadow strength in percent. */
  depth: z.number().min(0).max(100),
  /** Zigzag folds instead of straight creases. */
  zigzag: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  palette: ["#f8f1e7", "#f2c6a0", "#e07a5f", "#3d405b"],
  bands: 8,
  angle: 25,
  depth: 45,
  zigzag: false,
};

export const paperFoldsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["terracotta", {}],
    ["arctic", { palette: ["#ffffff", "#dbe9f4", "#8fb8de", "#3c6e91"], bands: 10, angle: 160 }],
    [
      "neon",
      {
        palette: ["#120458", "#7a04eb", "#ff00a0", "#fe75fe"],
        bands: 12,
        angle: 90,
        depth: 60,
        zigzag: true,
      },
    ],
    [
      "sand",
      { palette: ["#fefae0", "#e9edc9", "#ccd5ae", "#d4a373"], bands: 6, angle: 0, depth: 30 },
    ],
    ["graphite", { palette: ["#2b2d42", "#8d99ae", "#edf2f4"], bands: 14, angle: 45, depth: 70 }],
    [
      "sunrise",
      {
        palette: ["#ffbe0b", "#fb5607", "#ff006e", "#8338ec", "#3a86ff"],
        bands: 10,
        angle: 120,
        zigzag: true,
      },
    ],
  ]),
  randomize(rng, current, locks) {
    const next: Params = {
      ...current,
      palette: huePalette(rng, rng.int(3, 5), { l: [0.95, 0.35], c: [0.04, 0.17] }, 50),
      bands: rng.int(5, 16),
      angle: rng.int(0, 180),
      depth: rng.int(25, 70),
      zigzag: rng.bool(0.35),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width: w, height: h }) {
      // Draw upright bands in a square that covers the screen at any angle.
      const side = Math.hypot(w, h);
      const band = side / p.bands;
      const x0 = (w - side) / 2;
      const y0 = (h - side) / 2;
      const shade = n((p.depth / 100) * 0.35);
      const parts: string[] = [];
      for (let i = 0; i < p.bands; i++) {
        const x = x0 + i * band;
        const t = p.bands === 1 ? 0 : i / (p.bands - 1);
        parts.push(
          `<rect x="${n(x)}" y="${n(y0)}" width="${n(band + 0.5)}" height="${n(side)}" fill="${gradientAt(p.palette, t)}"/>`,
        );
        if (p.zigzag) {
          // Alternating triangles down the band: a pleated look.
          const zig = band;
          const pts: string[] = [];
          for (let y = y0, k = 0; y <= y0 + side + zig; y += zig, k++) {
            pts.push(`${n(k % 2 === 0 ? x : x + band / 2)} ${n(y)}`);
          }
          parts.push(
            `<path d="M${n(x + band / 2)} ${n(y0)}L${pts.join("L")}L${n(x + band / 2)} ${n(y0 + side + zig)}Z" fill="#000" opacity="${shade}"/>`,
          );
        } else {
          parts.push(
            `<rect x="${n(x + band / 2)}" y="${n(y0)}" width="${n(band / 2 + 0.5)}" height="${n(side)}" fill="#000" opacity="${shade}"/>`,
          );
        }
      }
      return `${svgOpen(w, h)}<g transform="rotate(${n(p.angle)} ${n(w / 2)} ${n(h / 2)})">${parts.join("")}</g></svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
