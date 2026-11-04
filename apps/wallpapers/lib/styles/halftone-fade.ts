import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientLookup, n, presetsFor, svgOpen } from "./shared";

/**
 * Halftone fade: a rotated grid of print dots that grow across the screen,
 * from a side (linear) or from a point (radial), coloured along the
 * palette. The dot count is capped so 6K stays light.
 */
const ID = "halftone-fade";
const MODES = ["linear", "radial"] as const;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  mode: z.enum(MODES),
  /** Direction of a linear fade, degrees. */
  angle: z.number().min(0).max(360),
  /** Cells across the short edge. */
  cells: z.int().min(12).max(90),
  /** Screen angle of the dot grid, degrees. */
  screen: z.number().min(0).max(90),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#f4efe6",
  palette: ["#ff4f3c", "#1b1b3a"],
  mode: "linear",
  angle: 90,
  cells: 34,
  screen: 45,
};

const MAX_DOTS = 9000;

export const halftoneFadeTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["print", {}, 1],
    [
      "sunspot",
      { background: "#0d0d12", palette: ["#ffd23f", "#ff3c38"], mode: "radial", cells: 40 },
      2,
    ],
    [
      "ink",
      { background: "#ffffff", palette: ["#111111", "#111111"], angle: 180, cells: 28, screen: 15 },
      3,
    ],
    [
      "duotone",
      { background: "#ffe3ef", palette: ["#2b2dff", "#ff2bd1"], angle: 135, cells: 46 },
      4,
    ],
    [
      "mint",
      {
        background: "#062925",
        palette: ["#3ef5c0", "#d5fff3"],
        mode: "radial",
        cells: 30,
        screen: 0,
      },
      5,
    ],
    [
      "fine",
      { background: "#f7f7f2", palette: ["#0f4c81", "#7fb2e5"], angle: 60, cells: 70, screen: 30 },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const dark = rng.bool(0.35);
    const next: Params = {
      ...current,
      background: oklchToHex({ l: dark ? 0.14 : 0.96, c: 0.02, h: hue }),
      palette: [
        oklchToHex({ l: rng.float(0.55, 0.75), c: 0.18, h: (hue + 150) % 360 }),
        oklchToHex({ l: dark ? 0.85 : 0.3, c: 0.12, h: (hue + rng.float(30, 120)) % 360 }),
      ],
      mode: rng.pick(MODES),
      angle: rng.int(0, 359),
      cells: rng.int(22, 60),
      screen: rng.pick([0, 15, 30, 45] as const),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      // Keep the number of dots under the budget on very wide screens.
      const step = Math.max(short / p.cells, Math.sqrt((w * h) / MAX_DOTS));
      const color = gradientLookup(p.palette);
      const a = (p.angle * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const halfSpan = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
      const ox = w * rng.float(0.3, 0.7);
      const oy = h * rng.float(0.3, 0.7);
      const reach = Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy));
      const t = (x: number, y: number): number =>
        p.mode === "linear"
          ? ((x - w / 2) * dx + (y - h / 2) * dy) / (2 * halfSpan) + 0.5
          : 1 - Math.hypot(x - ox, y - oy) / reach;
      const s = (p.screen * Math.PI) / 180;
      const cs = Math.cos(s);
      const sn = Math.sin(s);
      const diag = Math.hypot(w, h) / 2;
      const count = Math.ceil(diag / step);
      const dots: string[] = [];
      for (let j = -count; j <= count; j++) {
        for (let i = -count; i <= count; i++) {
          const x = w / 2 + (i * cs - j * sn) * step;
          const y = h / 2 + (i * sn + j * cs) * step;
          if (x < -step || y < -step || x > w + step || y > h + step) continue;
          const v = Math.min(1, Math.max(0, t(x, y)));
          const r = (step / 2) * 1.05 * Math.sqrt(v);
          if (r < step * 0.04) continue;
          dots.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color(v)}"/>`);
        }
      }
      return `${svgOpen(w, h)}<rect width="${w}" height="${h}" fill="${p.background}"/>${dots.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
