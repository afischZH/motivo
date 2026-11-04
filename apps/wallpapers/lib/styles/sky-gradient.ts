import { mixHex, oklchToHex } from "@musterli/engine";
import { defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { luminance, n, presetsFor, stops, svgOpen } from "./shared";

/**
 * Sky gradient: the sky at sunrise, dusk or blue hour. The palette runs
 * from the top of the sky to the horizon; a sun or moon with a wide glow
 * sits low, faint haze bands lie near the horizon, and a dark sky gets
 * a sprinkle of stars.
 */
const ID = "sky-gradient";
const BODIES = ["sun", "moon", "none"] as const;

const schema = z.object({
  palette: paletteSchema,
  body: z.enum(BODIES),
  /** Height of the sun or moon: 0 horizon to 100 top. */
  elevation: z.number().min(0).max(100),
  /** Glow size 0 to 100. */
  glow: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  palette: ["#1d2b64", "#7b4397", "#f8737a", "#ffd194"],
  body: "sun",
  elevation: 18,
  glow: 60,
};

export const skyGradientTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["dusk", {}, 1],
    [
      "sunrise",
      { palette: ["#7fb3e8", "#f9c9d2", "#ffd9a8", "#fff1d6"], elevation: 10, glow: 75 },
      2,
    ],
    [
      "blue-hour",
      {
        palette: ["#020617", "#1e3a8a", "#3b6fd1", "#9cc3f5"],
        body: "moon",
        elevation: 55,
        glow: 35,
      },
      3,
    ],
    ["midday", { palette: ["#1e78d6", "#5fb0f0", "#cfe9fb"], body: "none" }, 4],
    [
      "desert-night",
      {
        palette: ["#05040f", "#191340", "#4b2a6e", "#c0607c"],
        body: "moon",
        elevation: 30,
        glow: 45,
      },
      5,
    ],
    [
      "golden-hour",
      { palette: ["#3e5a8c", "#e6a06a", "#ffcf7a", "#ffefc4"], elevation: 6, glow: 90 },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const night = rng.bool(0.3);
    const count = rng.int(3, 5);
    const next: Params = {
      ...current,
      palette: Array.from({ length: count }, (_, i) => {
        const t = i / (count - 1);
        return oklchToHex({
          l: night ? 0.12 + t * 0.45 : 0.5 + t * 0.42,
          c: 0.06 + t * 0.08,
          h: (hue + t * rng.float(60, 140)) % 360,
        });
      }),
      body: night ? "moon" : rng.pick(["sun", "sun", "none"] as const),
      elevation: rng.int(4, 50),
      glow: rng.int(30, 90),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const horizon = h;
      const top = p.palette[0] ?? "#000000";
      const low = p.palette.at(-1) ?? "#ffffff";
      const defs: string[] = [
        `<linearGradient id="sk-bg" x1="0" y1="0" x2="0" y2="1">${stops(p.palette)}</linearGradient>`,
      ];
      const body: string[] = [`<rect width="${w}" height="${h}" fill="url(#sk-bg)"/>`];

      if (luminance(top) < 0.25) {
        // Stars fade out towards the brighter horizon.
        const count = Math.round(((w * h) / (short * short)) * 90);
        const dots: string[] = [];
        for (let i = 0; i < count; i++) {
          const y = h * rng.next() ** 1.8 * 0.7;
          const r = short * rng.float(0.0008, 0.0024);
          dots.push(
            `<circle cx="${n(rng.float(0, w))}" cy="${n(y)}" r="${n(r)}" opacity="${n(rng.float(0.3, 0.9) * (1 - y / (h * 0.7)))}"/>`,
          );
        }
        body.push(`<g fill="#fff">${dots.join("")}</g>`);
      }

      // Haze bands near the horizon.
      for (let i = 0; i < 4; i++) {
        const y = horizon - h * rng.float(0.05, 0.35);
        body.push(
          `<rect x="0" y="${n(y)}" width="${w}" height="${n(h * rng.float(0.03, 0.08))}" fill="${mixHex(low, "#ffffff", 0.4, "oklab")}" opacity="${n(rng.float(0.03, 0.07))}"/>`,
        );
      }

      if (p.body !== "none") {
        const x = w * rng.float(0.3, 0.7);
        const y = horizon - (h * 0.06 + (h * 0.6 * p.elevation) / 100);
        const r = short * (p.body === "sun" ? 0.09 : 0.06);
        const glowColor = p.body === "sun" ? mixHex(low, "#ffffff", 0.5, "oklab") : "#e8eeff";
        const reach = r * (2 + (p.glow / 100) * 10);
        defs.push(
          `<radialGradient id="sk-glow"><stop offset="0" stop-color="${glowColor}" stop-opacity="0.9"/>` +
            `<stop offset="0.25" stop-color="${glowColor}" stop-opacity="0.35"/>` +
            `<stop offset="1" stop-color="${glowColor}" stop-opacity="0"/></radialGradient>`,
        );
        body.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(reach)}" fill="url(#sk-glow)"/>`);
        if (p.body === "sun") {
          body.push(
            `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${mixHex(glowColor, "#ffffff", 0.6, "oklab")}"/>`,
          );
        } else {
          // A crescent: the moon minus an offset disc in the sky colour.
          defs.push(
            `<mask id="sk-moon"><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#fff"/><circle cx="${n(x + r * 0.45)}" cy="${n(y - r * 0.2)}" r="${n(r * 0.9)}" fill="#000"/></mask>`,
          );
          body.push(
            `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#f5f3ea" mask="url(#sk-moon)"/>`,
          );
        }
      }
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
