import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, luminance, n, presetsFor, smoothPath, svgOpen } from "./shared";

/**
 * Aurora ribbons: translucent, flowing bands of light. Each ribbon is a
 * band between two smooth curves whose width swells and thins, drawn three
 * times (wide and faint to narrow and bright) for a glow without blur
 * filters, and added with `screen` blending so overlaps brighten.
 */
const ID = "aurora-ribbons";

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  ribbons: z.int().min(1).max(9),
  /** Ribbon thickness, percent of the short edge. */
  thickness: z.number().min(2).max(40),
  /** How much the ribbons wave. */
  flow: z.number().min(0).max(100),
  glow: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#050816",
  palette: ["#00f5a0", "#00d9f5", "#7b5cff", "#ff4fd8"],
  ribbons: 4,
  thickness: 14,
  flow: 55,
  glow: true,
};

export const auroraRibbonsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["borealis", {}, 4],
    [
      "sunset",
      {
        background: "#14060f",
        palette: ["#ff7a18", "#ff3d6e", "#af00ff"],
        ribbons: 3,
        thickness: 20,
      },
      9,
    ],
    [
      "ice",
      {
        background: "#020b16",
        palette: ["#a1ffce", "#7fdbff", "#ffffff"],
        ribbons: 5,
        thickness: 8,
        flow: 70,
      },
      2,
    ],
    [
      "silk",
      {
        background: "#f4f1ec",
        palette: ["#ffb199", "#ff0844", "#6a11cb"],
        ribbons: 3,
        thickness: 16,
        flow: 35,
        glow: false,
      },
      13,
    ],
    [
      "gold",
      {
        background: "#0b0a08",
        palette: ["#f9d976", "#f39f86", "#c79081"],
        ribbons: 6,
        thickness: 6,
        flow: 80,
      },
      7,
    ],
    [
      "ocean",
      {
        background: "#001018",
        palette: ["#00c6ff", "#0072ff", "#00ffb2"],
        ribbons: 7,
        thickness: 10,
        flow: 45,
      },
      15,
    ],
  ]),
  randomize(rng, current, locks) {
    const next: Params = {
      ...current,
      palette: huePalette(rng, rng.int(3, 4), { l: [0.85, 0.65], c: [0.14, 0.24] }, 70),
      ribbons: rng.int(2, 7),
      thickness: rng.int(6, 22),
      flow: rng.int(30, 85),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const portrait = h > w;
      const steps = 14;
      const defs: string[] = [];
      const layers: string[] = [];
      const light = luminance(p.background) > 0.5;
      const blend = light ? "multiply" : "screen";
      for (let r = 0; r < p.ribbons; r++) {
        // Ribbons sweep along the long edge, gently diagonal.
        const along = portrait ? h : w;
        const across = portrait ? w : h;
        const base = across * rng.float(0.2, 0.8);
        const tilt = across * rng.float(-0.35, 0.35);
        const amp = across * 0.22 * (p.flow / 100);
        const f1 = rng.float(0.8, 1.8);
        const f2 = rng.float(2, 3.5);
        const ph1 = rng.float(0, 6.3);
        const ph2 = rng.float(0, 6.3);
        const thick = (short * p.thickness) / 100;
        const centre: [number, number][] = [];
        const halfW: number[] = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const pos = -0.1 * along + t * along * 1.2;
          const off =
            base +
            tilt * (t - 0.5) +
            amp * Math.sin(t * Math.PI * f1 + ph1) +
            amp * 0.35 * Math.sin(t * Math.PI * f2 + ph2);
          centre.push(portrait ? [off, pos] : [pos, off]);
          halfW.push(
            thick *
              (0.25 + 0.75 * Math.pow(Math.sin(t * Math.PI), 1.5)) *
              (0.6 + 0.4 * Math.sin(t * Math.PI * f2 + ph1)),
          );
        }
        const id = `ar-${r}`;
        const colors = [
          p.palette[r % p.palette.length] ?? "#fff",
          p.palette[(r + 1) % p.palette.length] ?? "#fff",
        ];
        defs.push(
          `<linearGradient id="${id}" x1="0" y1="0" x2="${portrait ? 0 : 1}" y2="${portrait ? 1 : 0}">` +
            `<stop offset="0" stop-color="${colors[0]}" stop-opacity="0"/>` +
            `<stop offset="0.22" stop-color="${colors[0]}"/>` +
            `<stop offset="0.78" stop-color="${colors[1]}"/>` +
            `<stop offset="1" stop-color="${colors[1]}" stop-opacity="0"/></linearGradient>`,
        );
        const passes = p.glow ? [2.2, 1.4, 0.7] : [1];
        const opacities = p.glow ? [0.12, 0.22, 0.55] : [0.7];
        passes.forEach((scale, k) => {
          const top = centre.map(([x, y], i) => {
            const d = (halfW[i] ?? 0) * scale;
            return (portrait ? [x - d, y] : [x, y - d]) as [number, number];
          });
          const bottom = centre
            .map(([x, y], i) => {
              const d = (halfW[i] ?? 0) * scale;
              return (portrait ? [x + d, y] : [x, y + d]) as [number, number];
            })
            .reverse();
          const back = smoothPath(bottom).replace(/^M/, "L");
          layers.push(
            `<path d="${smoothPath(top)}${back}Z" fill="url(#${id})" opacity="${n(opacities[k] ?? 0.5)}" style="mix-blend-mode:${blend}"/>`,
          );
        });
      }
      return (
        `${svgOpen(w, h)}<defs>${defs.join("")}</defs>` +
        `<rect width="${w}" height="${h}" fill="${p.background}"/>` +
        `${layers.join("")}</svg>`
      );
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
