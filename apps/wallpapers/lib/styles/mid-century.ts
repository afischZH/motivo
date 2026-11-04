import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, svgOpen } from "./shared";

/**
 * Mid-century modern: 1950s atomic starbursts, boomerangs, kidney shapes
 * and dotted orbits in muted mustard, teal, olive and burnt orange on a
 * warm paper ground, spread loosely like fabric of the era.
 */
const ID = "mid-century";

const schema = z.object({
  background: colorSchema,
  ink: colorSchema,
  palette: paletteSchema,
  density: z.int().min(4).max(40),
  /** Motif size, percent of the short edge. */
  size: z.number().min(8).max(40),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#f3e9d2",
  ink: "#2b2a28",
  palette: ["#e0a526", "#2a7f7a", "#c8553d", "#8a9a5b"],
  density: 14,
  size: 18,
};

const KINDS = ["starburst", "boomerang", "kidney", "orbit", "sparkle"] as const;

function motif(
  kind: (typeof KINDS)[number],
  s: number,
  fill: string,
  ink: string,
  sw: number,
): string {
  const h = s / 2;
  switch (kind) {
    case "starburst": {
      let d = "";
      let dots = "";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? h * 0.6 : h;
        d += `M0 0L${n(Math.cos(a) * r)} ${n(Math.sin(a) * r)}`;
        dots += `<circle cx="${n(Math.cos(a) * r)}" cy="${n(Math.sin(a) * r)}" r="${n(sw * 1.6)}"/>`;
      }
      return `<path d="${d}" stroke="${ink}" stroke-width="${n(sw)}"/><g fill="${fill}">${dots}</g><circle r="${n(sw * 2.2)}" fill="${ink}"/>`;
    }
    case "boomerang":
      return `<path d="M${n(-h)} ${n(h * 0.3)}Q0 ${n(-h * 1.1)} ${n(h)} ${n(h * 0.3)}Q0 ${n(-h * 0.35)} ${n(-h)} ${n(h * 0.3)}Z" fill="${fill}"/>`;
    case "kidney":
      return `<path d="M${n(-h * 0.8)} 0C${n(-h * 0.8)} ${n(-h * 0.7)} ${n(-h * 0.1)} ${n(-h * 0.7)} 0 ${n(-h * 0.25)}C${n(h * 0.1)} ${n(-h * 0.7)} ${n(h * 0.8)} ${n(-h * 0.7)} ${n(h * 0.8)} 0C${n(h * 0.8)} ${n(h * 0.6)} ${n(-h * 0.8)} ${n(h * 0.6)} ${n(-h * 0.8)} 0Z" fill="${fill}"/>`;
    case "orbit":
      return `<ellipse rx="${n(h)}" ry="${n(h * 0.35)}" fill="none" stroke="${ink}" stroke-width="${n(sw)}" stroke-dasharray="${n(sw * 0.1)} ${n(sw * 2.4)}" stroke-linecap="round"/><circle cx="${n(h)}" r="${n(sw * 2)}" fill="${fill}"/>`;
    case "sparkle":
      return `<path d="M0 ${n(-h * 0.6)}Q${n(h * 0.08)} ${n(-h * 0.08)} ${n(h * 0.6)} 0Q${n(h * 0.08)} ${n(h * 0.08)} 0 ${n(h * 0.6)}Q${n(-h * 0.08)} ${n(h * 0.08)} ${n(-h * 0.6)} 0Q${n(-h * 0.08)} ${n(-h * 0.08)} 0 ${n(-h * 0.6)}Z" fill="${fill}"/>`;
  }
}

export const midCenturyTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["atomic", {}, 2],
    [
      "diner",
      { background: "#e8f1ee", palette: ["#e35d5b", "#4bb3a7", "#f2c14e"], density: 18 },
      5,
    ],
    [
      "lounge",
      {
        background: "#2b2a28",
        ink: "#f3e9d2",
        palette: ["#e0a526", "#c8553d", "#6fa8a2"],
        density: 12,
      },
      3,
    ],
    [
      "olive",
      { background: "#ebe3cc", palette: ["#8a9a5b", "#c49a45", "#5b4636"], density: 10, size: 24 },
      7,
    ],
    ["sparse", { background: "#f7f1e3", palette: ["#2a7f7a", "#e0a526"], density: 6, size: 28 }, 1],
    [
      "fabric",
      {
        background: "#f3e9d2",
        palette: ["#c8553d", "#2a7f7a", "#e0a526", "#8a9a5b"],
        density: 32,
        size: 12,
      },
      9,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.25);
    const muted = [
      "#e0a526",
      "#2a7f7a",
      "#c8553d",
      "#8a9a5b",
      "#e35d5b",
      "#4bb3a7",
      "#f2c14e",
      "#5b4636",
      "#6fa8a2",
    ];
    const palette = Array.from({ length: rng.int(2, 4) }, () => rng.pick(muted));
    const next: Params = {
      ...current,
      background: dark ? "#2b2a28" : oklchToHex({ l: 0.93, c: 0.03, h: rng.float(70, 180) }),
      ink: dark ? "#f3e9d2" : "#2b2a28",
      palette: [...new Set(palette)].length >= 2 ? [...new Set(palette)] : ["#e0a526", "#2a7f7a"],
      density: rng.int(8, 24),
      size: rng.int(12, 26),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const s = (short * p.size) / 100;
      const sw = Math.max(1, s * 0.03);
      const count = Math.round((p.density * w * h) / (short * short) / 2);
      const placed: [number, number][] = [];
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        for (let attempt = 0; attempt < 15; attempt++) {
          x = rng.float(0, w);
          y = rng.float(0, h);
          if (placed.every(([px, py]) => Math.hypot(px - x, py - y) > s * 0.95)) break;
        }
        placed.push([x, y]);
        const kind = rng.pick(KINDS);
        parts.push(
          `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rng.float(0, 360))})">${motif(kind, s * rng.float(0.7, 1.2), rng.pick(p.palette), p.ink, sw)}</g>`,
        );
      }
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
