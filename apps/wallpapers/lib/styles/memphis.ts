import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Memphis: playful 1980s confetti of squiggles, zigzags, outlined
 * triangles, half circles, dot patches and striped tiles. Items are spread
 * with simple rejection sampling so they rarely overlap.
 */
const ID = "memphis";

const schema = z.object({
  background: colorSchema,
  ink: colorSchema,
  palette: paletteSchema,
  density: z.int().min(5).max(80),
  /** Item size, percent of the short edge. */
  size: z.number().min(4).max(30),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#fdf6ec",
  ink: "#1d1d1d",
  palette: ["#ff6f91", "#ffc75f", "#00c9a7", "#845ec2"],
  density: 32,
  size: 12,
};

const KINDS = [
  "squiggle",
  "zigzag",
  "triangle",
  "half",
  "dots",
  "stripes",
  "ring",
  "cross",
] as const;

function item(
  kind: (typeof KINDS)[number],
  s: number,
  fill: string,
  ink: string,
  sw: number,
): string {
  const h = s / 2;
  const line = `fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${n(sw)}"`;
  switch (kind) {
    case "squiggle": {
      let d = `M${n(-h)} 0`;
      for (let i = 0; i < 4; i++)
        d += `q${n(s / 8)} ${n(i % 2 ? h * 0.5 : -h * 0.5)} ${n(s / 4)} 0`;
      return `<path d="${d}" stroke="${fill}" ${line}/>`;
    }
    case "zigzag": {
      const pts = Array.from(
        { length: 7 },
        (_, i) => `${n(-h + (i * s) / 6)},${n(i % 2 ? -h * 0.25 : h * 0.25)}`,
      );
      return `<polyline points="${pts.join(" ")}" stroke="${ink}" ${line}/>`;
    }
    case "triangle":
      return `<polygon points="0,${n(-h)} ${n(h)},${n(h * 0.8)} ${n(-h)},${n(h * 0.8)}" stroke="${fill}" ${line}/>`;
    case "half":
      return `<path d="M${n(-h)} 0A${n(h)} ${n(h)} 0 0 1 ${n(h)} 0Z" fill="${fill}"/>`;
    case "dots": {
      const dots: string[] = [];
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          dots.push(
            `<circle cx="${n(-h + ((x + 0.5) * s) / 4)}" cy="${n(-h + ((y + 0.5) * s) / 4)}" r="${n(s * 0.05)}"/>`,
          );
      return `<g fill="${ink}">${dots.join("")}</g>`;
    }
    case "stripes": {
      const lines = Array.from(
        { length: 5 },
        (_, i) => `M${n(-h)} ${n(-h + (i * s) / 4)}h${n(s)}`,
      ).join("");
      return `<rect x="${n(-h)}" y="${n(-h)}" width="${n(s)}" height="${n(s)}" fill="${fill}"/><path d="${lines}" stroke="${ink}" stroke-width="${n(sw * 0.6)}"/>`;
    }
    case "ring":
      return `<circle r="${n(h * 0.8)}" stroke="${fill}" ${line}/>`;
    case "cross":
      return `<path d="M${n(-h * 0.6)} 0H${n(h * 0.6)}M0 ${n(-h * 0.6)}V${n(h * 0.6)}" stroke="${ink}" ${line}/>`;
  }
}

export const memphisTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["classic", {}, 3],
    [
      "pastel",
      {
        background: "#f3f0ff",
        palette: ["#ffadad", "#a0c4ff", "#caffbf", "#ffd6a5"],
        ink: "#3a3a5a",
        density: 40,
        size: 10,
      },
      6,
    ],
    [
      "bold",
      { background: "#ffe14d", palette: ["#ff2e63", "#08d9d6", "#252a34"], density: 22, size: 16 },
      2,
    ],
    [
      "midnight",
      {
        background: "#1a1a2e",
        ink: "#f8f8f8",
        palette: ["#ff6b9d", "#ffd23f", "#3bceac"],
        density: 30,
      },
      8,
    ],
    [
      "sparse",
      { background: "#ffffff", palette: ["#ff5964", "#35a7ff"], density: 12, size: 14 },
      11,
    ],
    [
      "confetti",
      {
        background: "#e8f9f3",
        palette: ["#ff8c42", "#ff3c38", "#6c8ead", "#a23e48"],
        density: 70,
        size: 7,
      },
      4,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.2);
    const next: Params = {
      ...current,
      background: dark
        ? "#1a1a2e"
        : oklchToHex({ l: 0.96, c: rng.float(0.01, 0.06), h: rng.float(0, 360) }),
      ink: dark ? "#f8f8f8" : "#1d1d1d",
      palette: huePalette(rng, rng.int(2, 4), { l: [0.78, 0.7], c: [0.13, 0.19] }, 100),
      density: rng.int(14, 50),
      size: rng.int(8, 16),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const s = (short * p.size) / 100;
      const sw = Math.max(1, s * 0.07);
      const count = Math.round((p.density * w * h) / (short * short) / 2);
      const placed: [number, number][] = [];
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        for (let attempt = 0; attempt < 12; attempt++) {
          x = rng.float(-s * 0.3, w + s * 0.3);
          y = rng.float(-s * 0.3, h + s * 0.3);
          if (placed.every(([px, py]) => Math.hypot(px - x, py - y) > s * 0.9)) break;
        }
        placed.push([x, y]);
        const kind = rng.pick(KINDS);
        const size = s * rng.float(0.7, 1.2);
        parts.push(
          `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(rng.float(0, 360))})">${item(kind, size, rng.pick(p.palette), p.ink, sw)}</g>`,
        );
      }
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
