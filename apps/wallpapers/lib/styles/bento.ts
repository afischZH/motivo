import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, shade, svgOpen } from "./shared";

/**
 * Bento: rounded tiles in a calm grid, like a home screen of widgets. The
 * screen is split recursively into tiles; some carry a simple glyph (a
 * ring, a dot grid, a half circle), the rest a soft gradient.
 */
const ID = "bento";

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  /** Number of tiles, roughly. */
  tiles: z.int().min(3).max(24),
  /** Gap and corner radius, per mille of the short edge. */
  gap: z.number().min(4).max(40),
  glyphs: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#0f0f12",
  palette: ["#2a2a33", "#ff8a5b", "#7b6cff", "#e9e3d6"],
  tiles: 9,
  gap: 16,
  glyphs: true,
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const bentoTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["dark", {}, 1],
    [
      "paper",
      { background: "#f2efe9", palette: ["#ffffff", "#e3ddd1", "#ff6b3d", "#1f1f1f"], tiles: 8 },
      2,
    ],
    [
      "pastel",
      {
        background: "#fdfbff",
        palette: ["#ffd6e0", "#c9e4ff", "#d6f5d6", "#fff1b8"],
        tiles: 10,
        gap: 20,
      },
      3,
    ],
    [
      "mono",
      { background: "#000000", palette: ["#1c1c1c", "#2e2e2e", "#f5f5f5"], tiles: 7, glyphs: true },
      4,
    ],
    [
      "ocean",
      {
        background: "#04131f",
        palette: ["#0b3954", "#087e8b", "#bfd7ea", "#ff5a5f"],
        tiles: 12,
        gap: 12,
      },
      5,
    ],
    [
      "calm",
      {
        background: "#e9ece6",
        palette: ["#cfd8c4", "#a7b79a", "#f7f5ee"],
        tiles: 5,
        gap: 28,
        glyphs: false,
      },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.5);
    const hue = rng.float(0, 360);
    const next: Params = {
      ...current,
      background: oklchToHex({ l: dark ? 0.1 : 0.96, c: 0.01, h: hue }),
      palette: [
        oklchToHex({ l: dark ? 0.22 : 0.99, c: 0.01, h: hue }),
        ...huePalette(rng, rng.int(2, 3), { l: [0.7, 0.8], c: [0.08, 0.17] }, 90),
      ],
      tiles: rng.int(5, 14),
      gap: rng.int(10, 26),
      glyphs: rng.bool(0.7),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const gap = (short * p.gap) / 1000;
      const radius = gap * 1.6;
      // Split the largest box until there are enough tiles.
      const boxes: Box[] = [{ x: gap, y: gap, w: w - gap * 2, h: h - gap * 2 }];
      while (boxes.length < p.tiles) {
        boxes.sort((a, b) => b.w * b.h - a.w * a.h);
        const box = boxes.shift();
        if (!box) break;
        const vertical = box.w / box.h > 1.1 || (box.h / box.w < 1.1 && rng.bool(0.5));
        const t = rng.pick([1 / 3, 1 / 2, 2 / 3] as const);
        if (vertical) {
          const a = (box.w - gap) * t;
          boxes.push({ ...box, w: a }, { ...box, x: box.x + a + gap, w: box.w - a - gap });
        } else {
          const a = (box.h - gap) * t;
          boxes.push({ ...box, h: a }, { ...box, y: box.y + a + gap, h: box.h - a - gap });
        }
      }
      const defs: string[] = [];
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      boxes.forEach((b, i) => {
        const fill = rng.pick(p.palette);
        defs.push(
          `<linearGradient id="bt-${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(fill, 0.08)}"/><stop offset="1" stop-color="${shade(fill, -0.08)}"/></linearGradient>`,
        );
        parts.push(
          `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="${n(Math.min(radius, b.w / 2, b.h / 2))}" fill="url(#bt-${i})"/>`,
        );
        if (!p.glyphs || rng.bool(0.45)) return;
        const ink = rng.pick(
          p.palette.filter((c) => c !== fill).length
            ? p.palette.filter((c) => c !== fill)
            : p.palette,
        );
        const s = Math.min(b.w, b.h) * 0.42;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        switch (rng.int(0, 3)) {
          case 0:
            parts.push(
              `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(s * 0.8)}" fill="none" stroke="${ink}" stroke-width="${n(s * 0.18)}"/>`,
            );
            break;
          case 1: {
            const dots: string[] = [];
            for (let y = 0; y < 3; y++)
              for (let x = 0; x < 3; x++)
                dots.push(
                  `<circle cx="${n(cx + (x - 1) * s * 0.6)}" cy="${n(cy + (y - 1) * s * 0.6)}" r="${n(s * 0.12)}"/>`,
                );
            parts.push(`<g fill="${ink}">${dots.join("")}</g>`);
            break;
          }
          case 2:
            parts.push(
              `<path d="M${n(cx - s)} ${n(cy + s * 0.5)}A${n(s)} ${n(s)} 0 0 1 ${n(cx + s)} ${n(cy + s * 0.5)}Z" fill="${ink}"/>`,
            );
            break;
          default:
            parts.push(
              `<rect x="${n(cx - s)}" y="${n(cy - s * 0.15)}" width="${n(s * 2)}" height="${n(s * 0.3)}" rx="${n(s * 0.15)}" fill="${ink}"/>`,
            );
        }
      });
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
