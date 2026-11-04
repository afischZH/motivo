import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientLookup, huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Dot gradient: a halftone field. Dots on a grid grow and change colour
 * along a linear or radial gradient, from tiny specks to touching discs.
 */
const ID = "dot-gradient";
const SHAPES = ["linear", "radial", "wave"] as const;
const MAX_DOTS = 16_000;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  shape: z.enum(SHAPES),
  /** Grid spacing in design pixels. */
  spacing: z.int().min(6).max(80),
  /** Gradient direction in degrees (linear and wave). */
  angle: z.number().min(0).max(360),
  /** Offset grid rows (hexagonal look). */
  offset: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#0e0e10",
  palette: ["#3d5afe", "#b388ff", "#ff80ab"],
  shape: "linear",
  spacing: 18,
  angle: 0,
  offset: true,
};

export const dotGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["electric", {}],
    [
      "sun",
      {
        background: "#fff8ec",
        palette: ["#ff6b35", "#f7c59f", "#efefd0"],
        shape: "radial",
        spacing: 22,
      },
    ],
    [
      "ink",
      {
        background: "#f4f1ea",
        palette: ["#3a3a3a", "#111111"],
        shape: "wave",
        spacing: 14,
        angle: 30,
      },
    ],
    [
      "aqua",
      {
        background: "#001219",
        palette: ["#94d2bd", "#0a9396", "#005f73"],
        shape: "radial",
        spacing: 16,
        offset: false,
      },
    ],
    [
      "pop",
      {
        background: "#ffe600",
        palette: ["#ff2e63", "#08d9d6"],
        shape: "linear",
        angle: 135,
        spacing: 28,
      },
    ],
    [
      "silver",
      {
        background: "#1b1b1f",
        palette: ["#8d8d99", "#e6e6ee"],
        shape: "wave",
        spacing: 12,
        angle: 0,
      },
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.6);
    const next: Params = {
      ...current,
      background: dark ? "#0e0e12" : "#f7f3ea",
      palette: huePalette(rng, rng.int(2, 4), {
        l: dark ? [0.55, 0.85] : [0.3, 0.6],
        c: [0.1, 0.22],
      }),
      shape: rng.pick(SHAPES),
      angle: rng.int(0, 359),
      spacing: rng.int(10, 32),
      offset: rng.bool(),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width: w, height: h }) {
      const color = gradientLookup(p.palette);
      const step = Math.max(p.spacing, Math.sqrt((w * h) / MAX_DOTS));
      const a = (p.angle * Math.PI) / 180;
      const ux = Math.sin(a);
      const uy = Math.cos(a);
      const proj = (x: number, y: number) => x * ux + y * uy;
      const corners = [proj(0, 0), proj(w, 0), proj(0, h), proj(w, h)];
      const lo = Math.min(...corners);
      const span = Math.max(...corners) - lo || 1;
      const diag = Math.hypot(w, h) / 2;
      const field = (x: number, y: number): number => {
        if (p.shape === "radial") return 1 - Math.hypot(x - w / 2, y - h * 0.62) / diag;
        const t = (proj(x, y) - lo) / span;
        if (p.shape === "wave") return 0.5 + 0.5 * Math.sin(t * Math.PI * 3 - Math.PI / 2);
        return t;
      };
      const maxR = step * (p.offset ? 0.56 : 0.5);
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      const rowStep = p.offset ? step * 0.866 : step;
      let row = 0;
      for (let y = rowStep / 2; y < h + rowStep; y += rowStep, row++) {
        const shift = p.offset && row % 2 === 1 ? step / 2 : 0;
        for (let x = step / 2 - shift; x < w + step; x += step) {
          const t = Math.min(1, Math.max(0, field(x, y)));
          const r = maxR * Math.pow(t, 1.15);
          if (r < 0.4) continue;
          parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color(t)}"/>`);
        }
      }
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
