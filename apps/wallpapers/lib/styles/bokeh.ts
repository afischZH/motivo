import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, shade, stops, svgOpen } from "./shared";

/**
 * Bokeh: out-of-focus lights. Discs have a faint body and a brighter rim
 * like a real lens, blended with `screen`; they gather in a band (city
 * lights) and get larger towards the front.
 */
const ID = "bokeh";

const schema = z.object({
  backgroundTop: colorSchema,
  backgroundBottom: colorSchema,
  palette: paletteSchema,
  lights: z.int().min(10).max(160),
  /** Largest disc, percent of the short edge. */
  size: z.number().min(5).max(40),
  /** Where the lights gather: 0 top to 100 bottom. */
  band: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  backgroundTop: "#060814",
  backgroundBottom: "#141a33",
  palette: ["#ffcf6b", "#ff7a59", "#7aa2ff"],
  lights: 70,
  size: 18,
  band: 62,
};

const MAX_LIGHTS = 160;

export const bokehTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["city", {}, 4],
    [
      "fairy",
      {
        backgroundTop: "#0d0a05",
        backgroundBottom: "#1f160a",
        palette: ["#ffe7a3", "#ffc55c"],
        lights: 110,
        size: 12,
        band: 40,
      },
      8,
    ],
    [
      "neon",
      {
        backgroundTop: "#09031a",
        backgroundBottom: "#1d0636",
        palette: ["#ff3df2", "#3de1ff", "#8a5cff"],
        lights: 60,
        size: 22,
      },
      3,
    ],
    [
      "rain",
      {
        backgroundTop: "#0a1418",
        backgroundBottom: "#13262c",
        palette: ["#9ff7ff", "#5bd1c8", "#ffffff"],
        lights: 140,
        size: 8,
        band: 50,
      },
      12,
    ],
    [
      "festive",
      {
        backgroundTop: "#13020a",
        backgroundBottom: "#2b0716",
        palette: ["#ff3b3b", "#ffd166", "#06d6a0"],
        lights: 90,
        size: 15,
        band: 70,
      },
      6,
    ],
    [
      "dawn",
      {
        backgroundTop: "#ffd9c2",
        backgroundBottom: "#ffe9d6",
        palette: ["#ffffff", "#ffb38a", "#ff8fab"],
        lights: 50,
        size: 25,
        band: 35,
      },
      1,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const next: Params = {
      ...current,
      backgroundTop: oklchToHex({ l: 0.1, c: 0.04, h: hue }),
      backgroundBottom: oklchToHex({ l: 0.2, c: 0.06, h: (hue + 20) % 360 }),
      palette: huePalette(rng, rng.int(2, 4), { l: [0.75, 0.88], c: [0.1, 0.18] }, 90),
      lights: rng.int(40, 130),
      size: rng.int(8, 26),
      band: rng.int(30, 75),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const defs: string[] = [
        `<linearGradient id="bk-bg" x1="0" y1="0" x2="0" y2="1">${stops([p.backgroundTop, p.backgroundBottom])}</linearGradient>`,
      ];
      p.palette.forEach((c, i) => {
        const rim = shade(c, 0.25);
        defs.push(
          `<radialGradient id="bk-${i}"><stop offset="0" stop-color="${c}" stop-opacity="0.22"/>` +
            `<stop offset="0.8" stop-color="${c}" stop-opacity="0.32"/>` +
            `<stop offset="0.93" stop-color="${rim}" stop-opacity="0.6"/>` +
            `<stop offset="1" stop-color="${rim}" stop-opacity="0"/></radialGradient>`,
        );
      });
      const discs: { x: number; y: number; r: number; c: number }[] = [];
      const count = Math.min(MAX_LIGHTS, p.lights);
      const centre = (p.band / 100) * h;
      for (let i = 0; i < count; i++) {
        const depth = rng.next(); // 0 far, 1 near
        const r = ((short * p.size) / 200) * (0.25 + depth ** 2 * 0.75);
        const spread = h * (0.12 + depth * 0.3);
        discs.push({
          x: rng.float(-r, w + r),
          y: centre + rng.gaussian(0, 1) * spread,
          r,
          c: rng.int(0, p.palette.length - 1),
        });
      }
      discs.sort((a, b) => a.r - b.r);
      const body = discs
        .map((d) => `<circle cx="${n(d.x)}" cy="${n(d.y)}" r="${n(d.r)}" fill="url(#bk-${d.c})"/>`)
        .join("");
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs><rect width="${w}" height="${h}" fill="url(#bk-bg)"/><g style="mix-blend-mode:screen">${body}</g></svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
