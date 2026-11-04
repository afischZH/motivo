import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, shade, svgOpen } from "./shared";

/**
 * Puffy shapes (inflated 3D): glossy balloon-like hearts, stars, clouds and
 * blobs. Corners are rounded by a thick stroke in the body colour; a
 * saturated radial body, a darker rim and a bright specular streak make
 * them look blown up.
 */
const ID = "puffy-shapes";
const KINDS = ["heart", "star", "cloud", "blob", "plus"] as const;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  shapes: z.int().min(1).max(12),
  /** Largest shape, percent of the short edge. */
  size: z.number().min(15).max(80),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#ffe0ef",
  palette: ["#ff3d8b", "#ffb703", "#8338ec"],
  shapes: 5,
  size: 50,
};

/** Shapes drawn in a unit box of about -50..50. */
function unitPath(kind: (typeof KINDS)[number]): string {
  switch (kind) {
    case "heart":
      return "M0 38C-30 18-44 2-44-16C-44-32-32-42-20-42C-10-42-3-36 0-28C3-36 10-42 20-42C32-42 44-32 44-16C44 2 30 18 0 38Z";
    case "star": {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 20 : 40;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        return `${n(Math.cos(a) * r)} ${n(Math.sin(a) * r)}`;
      });
      return `M${pts.join("L")}Z`;
    }
    case "cloud":
      return "M-34 20A16 16 0 0 1-30-10A20 20 0 0 1 4-24A18 18 0 0 1 34-6A14 14 0 0 1 32 20Z";
    case "blob":
      return "M0-38C24-38 40-22 38 2C36 26 18 38-4 36C-28 34-40 18-38-4C-36-24-22-38 0-38Z";
    case "plus":
      return "M-12-38H12V-12H38V12H12V38H-12V12H-38V-12H-12Z";
  }
}

export const puffyShapesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["bubblegum", {}, 3],
    [
      "sky",
      { background: "#dff1ff", palette: ["#4dabf7", "#ffffff", "#ffd43b"], shapes: 6, size: 45 },
      6,
    ],
    ["lime", { background: "#101410", palette: ["#a3ff12", "#00e5ff"], shapes: 4, size: 55 }, 9],
    ["love", { background: "#2b0a1a", palette: ["#ff2e63", "#ff8fab"], shapes: 7, size: 40 }, 2],
    [
      "sunny",
      { background: "#fff3c4", palette: ["#ff7b00", "#ffb700", "#ff3d00"], shapes: 3, size: 65 },
      5,
    ],
    [
      "party",
      {
        background: "#f4f0ff",
        palette: ["#7048e8", "#f03e3e", "#12b886", "#fab005"],
        shapes: 10,
        size: 34,
      },
      8,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.3);
    const next: Params = {
      ...current,
      background: oklchToHex({
        l: dark ? 0.17 : 0.95,
        c: rng.float(0.02, 0.06),
        h: rng.float(0, 360),
      }),
      palette: huePalette(rng, rng.int(2, 4), { l: [0.72, 0.65], c: [0.17, 0.23] }, 90),
      shapes: rng.int(3, 9),
      size: rng.int(32, 62),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const defs: string[] = [
        `<linearGradient id="pf-spec" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
      ];
      p.palette.forEach((c, i) => {
        defs.push(
          `<radialGradient id="pf-${i}" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="${shade(c, 0.35)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.4)}"/></radialGradient>`,
        );
      });
      const top = h > w ? h * 0.32 : h * 0.06;
      const maxS = (short * p.size) / 100;
      const body: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      const placed: [number, number, number][] = [];
      for (let i = 0; i < p.shapes; i++) {
        const s = maxS * Math.pow(0.82, i) * rng.float(0.85, 1.1);
        let x = 0;
        let y = 0;
        for (let attempt = 0; attempt < 40; attempt++) {
          x = rng.float(s * 0.25, w - s * 0.25);
          y = rng.float(top + s * 0.35, h - s * 0.25);
          if (placed.every(([px, py, ps]) => Math.hypot(px - x, py - y) > (ps + s) * 0.48)) break;
        }
        placed.push([x, y, s]);
      }
      placed.reverse().forEach(([x, y, s], i) => {
        const kind = rng.pick(KINDS);
        const d = unitPath(kind);
        const scale = s / 100;
        const c = i % p.palette.length;
        const base = p.palette[c] ?? "#ff3d8b";
        const turn = rng.float(-20, 20);
        const round = `stroke-width="22" stroke-linejoin="round"`;
        body.push(
          `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(turn)}) scale(${n(scale)})">` +
            `<path d="${d}" fill="#000" stroke="#000" ${round} opacity="0.18" transform="translate(4 9)"/>` +
            `<path d="${d}" fill="url(#pf-${c})" stroke="${shade(base, -0.1)}" ${round}/>` +
            `<path d="${d}" fill="url(#pf-${c})"/>` +
            `<ellipse cx="-16" cy="-18" rx="14" ry="6" transform="rotate(-35 -16 -18)" fill="url(#pf-spec)"/>` +
            `<circle cx="-2" cy="-28" r="3" fill="#fff" opacity="0.85"/></g>`,
        );
      });
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
