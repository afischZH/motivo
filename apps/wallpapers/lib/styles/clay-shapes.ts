import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, shade, svgOpen } from "./shared";

/**
 * Clay shapes (claymorphism): soft matte 3D pills, rings, blobs and rounded
 * squares in pastel. Each shape has a gentle body gradient, a soft inner
 * highlight and a wide, faint stacked shadow; matte, so no sharp shine.
 */
const ID = "clay-shapes";
const KINDS = ["ball", "pill", "ring", "square", "arch"] as const;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  shapes: z.int().min(1).max(14),
  /** Largest shape, percent of the short edge. */
  size: z.number().min(15).max(80),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#f1ecff",
  palette: ["#a78bfa", "#fda4af", "#fcd34d", "#86efac"],
  shapes: 7,
  size: 45,
};

function shapePath(kind: (typeof KINDS)[number], s: number): string {
  const h = s / 2;
  switch (kind) {
    case "ball":
      return `<circle r="${n(h)}"/>`;
    case "pill":
      return `<rect x="${n(-h)}" y="${n(-h * 0.42)}" width="${n(s)}" height="${n(s * 0.42)}" rx="${n(s * 0.21)}"/>`;
    case "ring":
      return `<path d="M${n(-h)} 0a${n(h)} ${n(h)} 0 1 0 ${n(s)} 0a${n(h)} ${n(h)} 0 1 0 ${n(-s)} 0ZM${n(-h * 0.45)} 0a${n(h * 0.45)} ${n(h * 0.45)} 0 1 1 ${n(h * 0.9)} 0a${n(h * 0.45)} ${n(h * 0.45)} 0 1 1 ${n(-h * 0.9)} 0Z" fill-rule="evenodd"/>`;
    case "square":
      return `<rect x="${n(-h * 0.8)}" y="${n(-h * 0.8)}" width="${n(s * 0.8)}" height="${n(s * 0.8)}" rx="${n(s * 0.24)}"/>`;
    case "arch":
      return `<path d="M${n(-h * 0.7)} ${n(h * 0.7)}V0A${n(h * 0.7)} ${n(h * 0.7)} 0 0 1 ${n(h * 0.7)} 0V${n(h * 0.7)}Z"/>`;
  }
}

export const clayShapesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["candy", {}, 2],
    [
      "peach",
      { background: "#ffe8dc", palette: ["#ff9b85", "#ffd29d", "#b8e0d2"], shapes: 5, size: 55 },
      5,
    ],
    [
      "mint",
      { background: "#e3f6ef", palette: ["#5ec2a6", "#f6c177", "#9ad0ec"], shapes: 9, size: 38 },
      8,
    ],
    ["night", { background: "#1d1b2f", palette: ["#7c6cff", "#ff7ab6", "#4ad3c9"], shapes: 6 }, 3],
    [
      "sand",
      { background: "#efe6da", palette: ["#d6a77a", "#9eb09a", "#e8d3b0"], shapes: 4, size: 60 },
      7,
    ],
    [
      "toybox",
      {
        background: "#fff6d8",
        palette: ["#ff6b6b", "#4dabf7", "#ffd43b", "#51cf66"],
        shapes: 12,
        size: 32,
      },
      1,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.2);
    const hue = rng.float(0, 360);
    const next: Params = {
      ...current,
      background: oklchToHex({ l: dark ? 0.22 : 0.95, c: 0.03, h: hue }),
      palette: huePalette(rng, rng.int(2, 4), { l: [0.82, 0.72], c: [0.08, 0.15] }, 100),
      shapes: rng.int(3, 10),
      size: rng.int(30, 60),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const defs: string[] = [
        `<radialGradient id="cl-hi" cx="0.35" cy="0.3" r="0.45"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
      ];
      p.palette.forEach((c, i) => {
        defs.push(
          `<linearGradient id="cl-${i}" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${shade(c, 0.18)}"/><stop offset="0.6" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.22)}"/></linearGradient>`,
        );
      });
      const top = h > w ? h * 0.34 : h * 0.08;
      const placed: [number, number, number][] = [];
      const maxS = (short * p.size) / 100;
      for (let i = 0; i < p.shapes; i++) {
        const s = maxS * Math.pow(0.84, i) * rng.float(0.85, 1.1);
        let x = 0;
        let y = 0;
        for (let attempt = 0; attempt < 40; attempt++) {
          x = rng.float(s * 0.2, w - s * 0.2);
          y = rng.float(top + s * 0.3, h - s * 0.2);
          if (placed.every(([px, py, ps]) => Math.hypot(px - x, py - y) > (ps + s) * 0.45)) break;
        }
        placed.push([x, y, s]);
      }
      const body: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      placed.reverse().forEach(([x, y, s], i) => {
        const kind = rng.pick(KINDS);
        const shape = shapePath(kind, s);
        const turn = rng.float(-25, 25);
        const c = i % p.palette.length;
        // Soft shadow: faint, growing copies below.
        for (let k = 4; k >= 1; k--) {
          body.push(
            `<g transform="translate(${n(x + s * 0.04 * k)} ${n(y + s * 0.07 * k)}) rotate(${n(turn)}) scale(${n(1 + k * 0.03)})" fill="#000" opacity="0.035">${shape}</g>`,
          );
        }
        body.push(
          `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(turn)})"><g fill="url(#cl-${c})">${shape}</g><g fill="url(#cl-hi)">${shape}</g></g>`,
        );
      });
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
