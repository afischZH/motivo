import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Neo-brutalism: loud flat shapes with thick dark outlines and hard,
 * unblurred offset shadows on a plain or dotted background. Shapes sit on
 * a loose grid so they never pile up.
 */
const ID = "neo-brutalism";
const FIGURES = ["rect", "circle", "star", "pill", "flower", "arch"] as const;

const schema = z.object({
  background: colorSchema,
  ink: colorSchema,
  palette: paletteSchema,
  shapes: z.int().min(1).max(24),
  /** Outline width, per mille of the short edge. */
  outline: z.number().min(2).max(20),
  dots: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#fff4e0",
  ink: "#111111",
  palette: ["#ff6b6b", "#ffd93d", "#4d96ff", "#6bcb77", "#c77dff"],
  shapes: 9,
  outline: 8,
  dots: true,
};

function figure(kind: (typeof FIGURES)[number], s: number): string {
  const h = s / 2;
  switch (kind) {
    case "rect":
      return `<rect x="${n(-h)}" y="${n(-h * 0.75)}" width="${n(s)}" height="${n(s * 0.75)}" rx="${n(s * 0.08)}"/>`;
    case "circle":
      return `<circle r="${n(h)}"/>`;
    case "pill":
      return `<rect x="${n(-h)}" y="${n(-h * 0.4)}" width="${n(s)}" height="${n(s * 0.4)}" rx="${n(s * 0.2)}"/>`;
    case "arch":
      return `<path d="M${n(-h)} ${n(h)}V0A${n(h)} ${n(h)} 0 0 1 ${n(h)} 0V${n(h)}Z"/>`;
    case "star": {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? h * 0.45 : h;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        return `${n(Math.cos(a) * r)},${n(Math.sin(a) * r)}`;
      });
      return `<polygon points="${pts.join(" ")}"/>`;
    }
    case "flower": {
      // Scalloped outline: one path, so the outline stays clean.
      const count = 8;
      const r = h * 0.78;
      const bulge = r * Math.sin(Math.PI / count) * 1.05;
      let d = "";
      for (let i = 0; i <= count; i++) {
        const a = (i / count) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        d += i === 0 ? `M${n(x)} ${n(y)}` : `A${n(bulge)} ${n(bulge)} 0 0 1 ${n(x)} ${n(y)}`;
      }
      return `<path d="${d}Z"/>`;
    }
  }
}

export const neoBrutalismTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["playground", {}, 2],
    [
      "lemon",
      { background: "#ffe66d", palette: ["#ff6b6b", "#ffffff", "#4ecdc4"], shapes: 6, outline: 12 },
      5,
    ],
    [
      "night",
      {
        background: "#1b1b1f",
        ink: "#000000",
        palette: ["#a3ff12", "#ff3cac", "#2bd2ff"],
        shapes: 8,
        dots: false,
      },
      7,
    ],
    [
      "mint",
      { background: "#c9f2e1", palette: ["#ff8fab", "#ffd166", "#118ab2"], shapes: 12, outline: 6 },
      3,
    ],
    [
      "poster",
      {
        background: "#ffffff",
        palette: ["#ff4d00", "#0047ff"],
        shapes: 4,
        outline: 14,
        dots: false,
      },
      9,
    ],
    [
      "crowd",
      {
        background: "#ffd6e8",
        palette: ["#ffbe0b", "#fb5607", "#8338ec", "#3a86ff"],
        shapes: 20,
        outline: 6,
      },
      4,
    ],
  ]),
  randomize(rng, current, locks) {
    const light = rng.bool(0.8);
    const next: Params = {
      ...current,
      background: light
        ? oklchToHex({ l: 0.95, c: rng.float(0.02, 0.1), h: rng.float(0, 360) })
        : "#1b1b1f",
      palette: huePalette(rng, rng.int(2, 5), { l: [0.75, 0.68], c: [0.15, 0.22] }, 110),
      shapes: rng.int(4, 16),
      outline: rng.int(5, 14),
      dots: rng.bool(0.5),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const stroke = (short * p.outline) / 1000;
      const body: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      const defs: string[] = [];
      if (p.dots) {
        const gap = short / 24;
        defs.push(
          `<pattern id="nb-dots" width="${n(gap)}" height="${n(gap)}" patternUnits="userSpaceOnUse"><circle cx="${n(gap / 2)}" cy="${n(gap / 2)}" r="${n(gap * 0.08)}" fill="${p.ink}" opacity="0.25"/></pattern>`,
        );
        body.push(`<rect width="${w}" height="${h}" fill="url(#nb-dots)"/>`);
      }
      // Loose grid of cells, shuffled, one shape per used cell.
      const cols = Math.max(2, Math.round(Math.sqrt((p.shapes * w) / h) + 0.5));
      const rows = Math.max(2, Math.ceil(p.shapes / cols) + 1);
      const cells = Array.from({ length: cols * rows }, (_, i) => i);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [cells[i], cells[j]] = [cells[j] ?? 0, cells[i] ?? 0];
      }
      const cw = w / cols;
      const ch = h / rows;
      const shadow = stroke * 1.6;
      for (const cell of cells.slice(0, p.shapes)) {
        const cx = ((cell % cols) + 0.5 + rng.float(-0.2, 0.2)) * cw;
        const cy = (Math.floor(cell / cols) + 0.5 + rng.float(-0.2, 0.2)) * ch;
        const size = Math.min(cw, ch) * rng.float(0.6, 1.05);
        const kind = rng.pick(FIGURES);
        const shape = figure(kind, size);
        const fill = rng.pick(p.palette);
        const turn = rng.float(-15, 15);
        body.push(
          `<g transform="translate(${n(cx + shadow)} ${n(cy + shadow)}) rotate(${n(turn)})" fill="${p.ink}">${shape}</g>`,
          `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${n(turn)})" fill="${fill}" stroke="${p.ink}" stroke-width="${n(stroke)}" stroke-linejoin="round">${shape}</g>`,
        );
      }
      return `${svgOpen(w, h)}${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
