import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, svgOpen } from "./shared";

/**
 * Liquid glass: thick glass panes over a soft colour field. Each pane shows
 * the field magnified and shifted (refraction), lightened (frost), with a
 * sheen, a bright rim lit from the top left and a fainter one on the
 * opposite edge for thickness, plus a soft stacked shadow. No blur filters,
 * so 8K exports match the preview.
 */
const ID = "liquid-glass";

const SHAPES = ["pill", "squircle", "circle", "mixed"] as const;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  shape: z.enum(SHAPES),
  panes: z.int().min(1).max(5),
  /** Magnification inside the glass 0 to 100. */
  refraction: z.number().min(0).max(100),
  /** Frost 0 to 100. */
  frost: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#0d0f2b",
  palette: ["#5b5bff", "#ff5fa2", "#22d3ee", "#ffb547"],
  shape: "mixed",
  panes: 3,
  refraction: 45,
  frost: 30,
};

interface Pane {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r: number;
  readonly angle: number;
}

function paneShape(pane: Pane, extra = 0): string {
  const { x, y, w, h, r } = pane;
  return (
    `<rect x="${n(x - w / 2 - extra)}" y="${n(y - h / 2 - extra)}" width="${n(w + extra * 2)}" ` +
    `height="${n(h + extra * 2)}" rx="${n(r + extra)}" transform="rotate(${n(pane.angle)} ${n(x)} ${n(y)})"`
  );
}

export const liquidGlassTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["prism", {}, 5],
    [
      "daylight",
      {
        background: "#eef1f7",
        palette: ["#7aa7ff", "#ffb3c7", "#b9f3e4"],
        shape: "squircle",
        panes: 2,
        frost: 45,
      },
      3,
    ],
    [
      "sunset",
      {
        background: "#2a0b18",
        palette: ["#ff6a3d", "#ffc15e", "#c2185b"],
        shape: "pill",
        panes: 3,
      },
      8,
    ],
    [
      "lagoon",
      {
        background: "#00151c",
        palette: ["#00e0c6", "#0077ff", "#9dff6a"],
        shape: "circle",
        panes: 2,
        refraction: 70,
      },
      12,
    ],
    [
      "mono",
      {
        background: "#111111",
        palette: ["#ffffff", "#5c5c5c"],
        shape: "squircle",
        panes: 4,
        frost: 20,
      },
      6,
    ],
    [
      "lavender",
      {
        background: "#efe9ff",
        palette: ["#8b6cff", "#ff8fd6", "#6ad1ff"],
        shape: "pill",
        panes: 1,
        refraction: 60,
        frost: 35,
      },
      2,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const light = rng.bool(0.3);
    const count = rng.int(2, 4);
    const next: Params = {
      ...current,
      background: oklchToHex({ l: light ? 0.95 : 0.13, c: 0.03, h: hue }),
      palette: Array.from({ length: count }, (_, i) =>
        oklchToHex({
          l: light ? rng.float(0.72, 0.85) : rng.float(0.6, 0.75),
          c: rng.float(0.12, 0.2),
          h: (hue + 40 + i * rng.float(50, 110)) % 360,
        }),
      ),
      shape: SHAPES[rng.int(0, SHAPES.length - 1)] ?? "mixed",
      panes: rng.int(1, 4),
      refraction: rng.int(25, 75),
      frost: rng.int(15, 50),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const portrait = h > w;
      const defs: string[] = [];

      // Colour field: large soft radial blobs.
      const blobs: string[] = [];
      const blobCount = Math.max(4, p.palette.length + 2);
      for (let i = 0; i < blobCount; i++) {
        const c = p.palette[i % p.palette.length] ?? "#ffffff";
        defs.push(
          `<radialGradient id="lg-b${i}"><stop offset="0" stop-color="${c}"/>` +
            `<stop offset="0.55" stop-color="${c}" stop-opacity="0.45"/>` +
            `<stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`,
        );
        const r = short * rng.float(0.45, 0.85);
        blobs.push(
          `<circle cx="${n(rng.float(0, w))}" cy="${n(rng.float(0, h))}" r="${n(r)}" fill="url(#lg-b${i})"/>`,
        );
      }
      defs.push(
        `<g id="lg-field"><rect width="${w}" height="${h}" fill="${p.background}"/>${blobs.join("")}</g>`,
        `<linearGradient id="lg-rim" x1="0" y1="0" x2="1" y2="1">` +
          `<stop offset="0" stop-color="#fff" stop-opacity="0.9"/>` +
          `<stop offset="0.35" stop-color="#fff" stop-opacity="0.12"/>` +
          `<stop offset="0.7" stop-color="#fff" stop-opacity="0.05"/>` +
          `<stop offset="1" stop-color="#fff" stop-opacity="0.45"/></linearGradient>`,
        `<linearGradient id="lg-sheen" x1="0" y1="0" x2="0.4" y2="1">` +
          `<stop offset="0" stop-color="#fff" stop-opacity="0.32"/>` +
          `<stop offset="0.45" stop-color="#fff" stop-opacity="0.04"/>` +
          `<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
      );

      // Panes: largest first, centred in the free area (below the clock on phones).
      const top = portrait ? h * 0.34 : h * 0.12;
      const panes: Pane[] = [];
      for (let i = 0; i < p.panes; i++) {
        const shape =
          p.shape === "mixed" ? (["pill", "squircle", "circle"] as const)[i % 3] : p.shape;
        const size = short * (0.62 - i * 0.08) * rng.float(0.85, 1.05);
        const pw = shape === "pill" ? size * 1.25 : size;
        const ph = shape === "pill" ? size * 0.5 : size;
        const r = shape === "pill" || shape === "circle" ? Math.min(pw, ph) / 2 : size * 0.26;
        const cx = w / 2 + rng.float(-0.28, 0.28) * w;
        const cy = top + (h - top) * rng.float(0.25, 0.75);
        panes.push({
          x: Math.min(w - pw * 0.3, Math.max(pw * 0.3, cx)),
          y: Math.min(h - ph * 0.3, Math.max(top + ph * 0.3, cy)),
          w: pw,
          h: ph,
          r,
          angle: shape === "circle" ? 0 : rng.float(-18, 18),
        });
      }

      const mag = 1 + (p.refraction / 100) * 0.45;
      const frost = (p.frost / 100) * 0.35;
      const rim = Math.max(1.5, short * 0.004);
      const body: string[] = [`<use href="#lg-field"/>`];
      panes.forEach((pane, i) => {
        // Soft shadow from stacked, growing, faint copies.
        const drop = short * 0.02;
        for (let s = 5; s >= 1; s--) {
          body.push(
            `${paneShape({ ...pane, y: pane.y + drop }, s * short * 0.012)} fill="#000" opacity="0.045"/>`,
          );
        }
        const shift = short * 0.03;
        defs.push(`<clipPath id="lg-c${i}">${paneShape(pane)}/></clipPath>`);
        body.push(
          `<g clip-path="url(#lg-c${i})">` +
            `<use href="#lg-field" transform="translate(${n(pane.x + shift)} ${n(pane.y + shift)}) scale(${n(mag)}) translate(${n(-pane.x)} ${n(-pane.y)})"/>` +
            `<rect width="${w}" height="${h}" fill="#fff" opacity="${n(frost)}"/></g>`,
          `${paneShape(pane)} fill="url(#lg-sheen)"/>`,
          `${paneShape(pane, -rim * 1.6)} fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="${n(rim * 0.8)}"/>`,
          `${paneShape(pane)} fill="none" stroke="url(#lg-rim)" stroke-width="${n(rim)}"/>`,
        );
      });
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
