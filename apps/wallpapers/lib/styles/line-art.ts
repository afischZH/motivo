import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, smoothPath, svgOpen } from "./shared";

/**
 * Line art: one continuous thin line looping over a few soft colour shapes,
 * like a modern abstract print. The line is a closed smooth curve through
 * points around a centre at varying radii, so it crosses itself a few
 * times without ever lifting the pen.
 */
const ID = "line-art";

const schema = z.object({
  background: colorSchema,
  line: colorSchema,
  palette: paletteSchema,
  /** Turns of the line around the centre. */
  loops: z.int().min(1).max(5),
  /** Points per turn: more means a busier line. */
  detail: z.int().min(4).max(12),
  blobs: z.int().min(0).max(5),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#f4efe7",
  line: "#1f1f1f",
  palette: ["#e9b8a0", "#9fb3a3", "#e7cf9a"],
  loops: 2,
  detail: 6,
  blobs: 3,
};

export const lineArtTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["gallery", {}, 3],
    [
      "noir",
      {
        background: "#141414",
        line: "#f0ebe1",
        palette: ["#3a3a3a", "#5b4636"],
        loops: 3,
        blobs: 2,
      },
      5,
    ],
    [
      "terracotta",
      {
        background: "#f1e4d6",
        palette: ["#c8693f", "#e9b38f"],
        line: "#3b2418",
        loops: 1,
        detail: 8,
      },
      7,
    ],
    [
      "blue",
      {
        background: "#eef2f6",
        palette: ["#9cb8d9", "#203a5c"],
        line: "#203a5c",
        loops: 2,
        detail: 5,
        blobs: 2,
      },
      2,
    ],
    ["busy", { loops: 4, detail: 9, blobs: 4 }, 9],
    [
      "pure",
      {
        background: "#ffffff",
        palette: ["#eeeeee", "#dddddd"],
        line: "#111111",
        loops: 2,
        blobs: 0,
      },
      4,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.25);
    const hue = rng.float(0, 360);
    const next: Params = {
      ...current,
      background: oklchToHex({ l: dark ? 0.16 : 0.95, c: 0.015, h: hue }),
      line: oklchToHex({ l: dark ? 0.92 : 0.2, c: 0.02, h: hue }),
      palette: Array.from({ length: rng.int(2, 3) }, () =>
        oklchToHex({
          l: dark ? rng.float(0.3, 0.45) : rng.float(0.7, 0.85),
          c: rng.float(0.04, 0.1),
          h: rng.float(0, 360),
        }),
      ),
      loops: rng.int(1, 4),
      detail: rng.int(5, 9),
      blobs: rng.int(1, 4),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const portrait = h > w;
      const cx = w / 2;
      const cy = h * (portrait ? 0.62 : 0.52);
      const R = short * (portrait ? 0.5 : 0.38);
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      for (let i = 0; i < p.blobs; i++) {
        const a = rng.float(0, Math.PI * 2);
        const d = R * rng.float(0.1, 0.8);
        const r = R * rng.float(0.4, 0.7);
        const bx = cx + Math.cos(a) * d;
        const by = cy + Math.sin(a) * d;
        const pts: [number, number][] = Array.from({ length: 8 }, (_, k) => {
          const t = (k / 8) * Math.PI * 2;
          const rr = r * rng.float(0.85, 1.12);
          return [bx + Math.cos(t) * rr, by + Math.sin(t) * rr * 0.9];
        });
        parts.push(
          `<path d="${smoothPath([...pts, pts[0] ?? [bx, by]])}Z" fill="${p.palette[i % p.palette.length] ?? "#ddd"}"/>`,
        );
      }
      // One continuous line: points spiral around the centre with varying reach.
      const total = p.loops * p.detail;
      const line: [number, number][] = [];
      for (let i = 0; i <= total; i++) {
        const t = (i / p.detail) * Math.PI * 2 + rng.float(-0.3, 0.3);
        const reach = R * rng.float(0.45, 1.1);
        line.push([cx + Math.cos(t) * reach, cy + Math.sin(t) * reach * rng.float(0.75, 1.1)]);
      }
      // Start and end trail off past the edge of the shapes.
      const first = line[0] ?? [cx, cy];
      line.unshift([first[0] - R * 0.9, first[1] + R * 0.6]);
      parts.push(
        `<path d="${smoothPath(line)}" fill="none" stroke="${p.line}" stroke-width="${n(Math.max(1, short * 0.005))}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
