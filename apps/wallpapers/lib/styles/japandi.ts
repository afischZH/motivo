import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, smoothPath, svgOpen } from "./shared";

/**
 * Japandi: calm warm neutrals with lots of empty space. One large organic
 * shape (a pebble, an arch or a sun), a smaller companion and a single
 * fine line, placed off centre like an ikebana arrangement.
 */
const ID = "japandi";
const MOTIFS = ["pebbles", "arch", "sun", "branch"] as const;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  line: colorSchema,
  motif: z.enum(MOTIFS),
  /** Size of the main shape, percent of the short edge. */
  size: z.number().min(25).max(90),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#efe8dc",
  palette: ["#c8a27a", "#7d8a6a", "#3f3a36"],
  line: "#3f3a36",
  motif: "pebbles",
  size: 60,
};

/** A soft, slightly irregular closed blob around (cx, cy). */
function pebble(
  rng: { float(a: number, b: number): number },
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): string {
  const count = 10;
  const pts: [number, number][] = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const wobble = rng.float(0.92, 1.06);
    return [cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble];
  });
  return `${smoothPath([...pts, pts[0] ?? [cx, cy]])}Z`;
}

export const japandiTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["stones", {}, 1],
    [
      "torii",
      {
        background: "#f3ece2",
        palette: ["#b5543a", "#d9c6ad"],
        line: "#2e2a27",
        motif: "arch",
        size: 55,
      },
      2,
    ],
    [
      "moon",
      {
        background: "#e9e4da",
        palette: ["#d9b08c", "#a7a28f"],
        line: "#5a524b",
        motif: "sun",
        size: 45,
      },
      3,
    ],
    [
      "sage",
      {
        background: "#e4e6dc",
        palette: ["#8c9a78", "#c9c2b0", "#4b4f42"],
        line: "#4b4f42",
        motif: "branch",
        size: 65,
      },
      4,
    ],
    [
      "night",
      {
        background: "#24221f",
        palette: ["#6f6253", "#b8a58c"],
        line: "#cbbfae",
        motif: "pebbles",
        size: 55,
      },
      5,
    ],
    [
      "clay",
      {
        background: "#f1e3d3",
        palette: ["#c46d4f", "#e8c7a8"],
        line: "#5b3a2e",
        motif: "sun",
        size: 70,
      },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(40, 90);
    const dark = rng.bool(0.2);
    const next: Params = {
      ...current,
      background: oklchToHex({ l: dark ? 0.24 : 0.93, c: 0.015, h: hue }),
      palette: [
        oklchToHex({ l: rng.float(0.5, 0.72), c: rng.float(0.04, 0.1), h: rng.float(30, 140) }),
        oklchToHex({ l: rng.float(0.65, 0.82), c: 0.03, h: hue }),
      ],
      line: oklchToHex({ l: dark ? 0.8 : 0.3, c: 0.01, h: hue }),
      motif: rng.pick(MOTIFS),
      size: rng.int(40, 75),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const s = (short * p.size) / 100;
      const portrait = h > w;
      // The arrangement sits low on phones (below the clock), off centre elsewhere.
      const cx = w * (portrait ? rng.float(0.42, 0.58) : rng.float(0.35, 0.65));
      const cy = h * (portrait ? 0.66 : 0.55);
      const main = p.palette[0] ?? "#c8a27a";
      const second = p.palette[1] ?? main;
      const lineW = n(Math.max(1, short * 0.0025));
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      switch (p.motif) {
        case "pebbles": {
          parts.push(`<path d="${pebble(rng, cx, cy, s * 0.5, s * 0.36)}" fill="${main}"/>`);
          parts.push(
            `<path d="${pebble(rng, cx + s * 0.42, cy - s * 0.32, s * 0.2, s * 0.15)}" fill="${second}"/>`,
          );
          parts.push(
            `<path d="M${n(cx - s * 0.9)} ${n(cy + s * 0.48)}H${n(cx + s * 0.9)}" stroke="${p.line}" stroke-width="${lineW}"/>`,
          );
          break;
        }
        case "arch": {
          const aw = s * 0.7;
          const top = cy - s * 0.55;
          parts.push(
            `<path d="M${n(cx - aw / 2)} ${n(cy + s * 0.5)}V${n(top + aw / 2)}A${n(aw / 2)} ${n(aw / 2)} 0 0 1 ${n(cx + aw / 2)} ${n(top + aw / 2)}V${n(cy + s * 0.5)}Z" fill="${main}"/>`,
          );
          parts.push(
            `<circle cx="${n(cx + aw * 0.55)}" cy="${n(top + aw * 0.1)}" r="${n(s * 0.09)}" fill="${second}"/>`,
          );
          parts.push(
            `<path d="M${n(cx - s)} ${n(cy + s * 0.5)}H${n(cx + s)}" stroke="${p.line}" stroke-width="${lineW}"/>`,
          );
          break;
        }
        case "sun": {
          parts.push(
            `<circle cx="${n(cx)}" cy="${n(cy - s * 0.15)}" r="${n(s * 0.42)}" fill="${main}"/>`,
          );
          parts.push(
            `<rect x="0" y="${n(cy + s * 0.05)}" width="${w}" height="${n(h - cy - s * 0.05)}" fill="${second}" opacity="0.55"/>`,
          );
          parts.push(
            `<path d="M0 ${n(cy + s * 0.05)}H${w}" stroke="${p.line}" stroke-width="${lineW}"/>`,
          );
          break;
        }
        case "branch": {
          parts.push(
            `<path d="${pebble(rng, cx, cy + s * 0.25, s * 0.32, s * 0.22)}" fill="${second}"/>`,
          );
          // One fine curved stem with a few leaves.
          const stem: [number, number][] = [
            [cx, cy + s * 0.1],
            [cx - s * 0.08, cy - s * 0.25],
            [cx + s * 0.1, cy - s * 0.6],
            [cx + s * 0.3, cy - s * 0.85],
          ];
          parts.push(
            `<path d="${smoothPath(stem)}" fill="none" stroke="${p.line}" stroke-width="${lineW}" stroke-linecap="round"/>`,
          );
          for (let i = 0; i < 5; i++) {
            const t = 0.25 + i * 0.15;
            const x = cx - s * 0.05 + t * s * 0.3;
            const y = cy + s * 0.1 - t * s * 0.9;
            const side = i % 2 ? 1 : -1;
            parts.push(
              `<ellipse cx="${n(x + side * s * 0.07)}" cy="${n(y)}" rx="${n(s * 0.07)}" ry="${n(s * 0.025)}" transform="rotate(${n(side * -30)} ${n(x + side * s * 0.07)} ${n(y)})" fill="${main}"/>`,
            );
          }
          break;
        }
      }
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
