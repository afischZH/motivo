import { mixHex, oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, shade, smoothPath, stops, svgOpen } from "./shared";

/**
 * Dunes: sand ridges in low sunlight. Each ridge has a sharp crest, a sunlit
 * face and a slip face in shadow that widens and narrows along the crest.
 * Far ridges fade into the sky (aerial perspective); an optional sun sits
 * low over the horizon. On phones the horizon stays below the clock.
 */
const ID = "dunes";

const schema = z.object({
  skyTop: colorSchema,
  skyHorizon: colorSchema,
  sand: colorSchema,
  shadow: colorSchema,
  ridges: z.int().min(2).max(9),
  /** Relief of the ridges 0 to 100. */
  relief: z.number().min(0).max(100),
  sun: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  skyTop: "#f6b37a",
  skyHorizon: "#ffe3b8",
  sand: "#e59a5c",
  shadow: "#7a2f2a",
  ridges: 5,
  relief: 55,
  sun: true,
};

export const dunesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["sahara", {}, 4],
    [
      "dusk",
      {
        skyTop: "#3a2a6b",
        skyHorizon: "#f59bb0",
        sand: "#c0718a",
        shadow: "#2b1640",
        ridges: 6,
      },
      8,
    ],
    [
      "night",
      {
        skyTop: "#050914",
        skyHorizon: "#1d2d52",
        sand: "#3d5585",
        shadow: "#0a1022",
        relief: 70,
      },
      3,
    ],
    [
      "gypsum",
      {
        skyTop: "#9cc7ef",
        skyHorizon: "#eaf4ff",
        sand: "#f4efe6",
        shadow: "#a9a6b8",
        ridges: 4,
        sun: false,
      },
      12,
    ],
    [
      "mars",
      {
        skyTop: "#d9a07a",
        skyHorizon: "#f2d2b0",
        sand: "#b5482a",
        shadow: "#3e0f0b",
        ridges: 7,
        relief: 75,
      },
      6,
    ],
    [
      "noon",
      {
        skyTop: "#3b8fe0",
        skyHorizon: "#cfe6fb",
        sand: "#ecc283",
        shadow: "#a2602c",
        ridges: 3,
        relief: 40,
        sun: false,
      },
      1,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const night = rng.bool(0.25);
    const next: Params = {
      ...current,
      skyTop: oklchToHex({ l: night ? 0.14 : rng.float(0.6, 0.8), c: 0.09, h: (hue + 200) % 360 }),
      skyHorizon: oklchToHex({ l: night ? 0.32 : 0.9, c: 0.07, h: (hue + 30) % 360 }),
      sand: oklchToHex({
        l: night ? 0.45 : rng.float(0.65, 0.82),
        c: rng.float(0.06, 0.13),
        h: hue,
      }),
      shadow: oklchToHex({ l: night ? 0.15 : 0.3, c: 0.08, h: (hue + 330) % 360 }),
      ridges: rng.int(3, 7),
      relief: rng.int(35, 80),
      sun: rng.bool(0.6),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const portrait = h > w;
      const horizon = h * (portrait ? 0.5 : 0.42);
      const relief = (p.relief / 100) * Math.min(w, h * 1.4);
      const defs: string[] = [
        `<linearGradient id="du-sky" x1="0" y1="0" x2="0" y2="1">${stops([p.skyTop, p.skyHorizon])}</linearGradient>`,
      ];
      const body: string[] = [`<rect width="${w}" height="${h}" fill="url(#du-sky)"/>`];

      if (p.sun) {
        const sx = w * rng.float(0.25, 0.75);
        const sy = horizon - Math.min(w, h) * rng.float(0.04, 0.12);
        const r = Math.min(w, h) * 0.075;
        const glow = mixHex(p.skyHorizon, "#ffffff", 0.6, "oklab");
        defs.push(
          `<radialGradient id="du-glow"><stop offset="0" stop-color="${glow}" stop-opacity="0.85"/>` +
            `<stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`,
        );
        body.push(
          `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(r * 5)}" fill="url(#du-glow)"/>`,
          `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(r)}" fill="${mixHex(glow, "#ffffff", 0.5, "oklab")}"/>`,
        );
      }

      const count = p.ridges;
      const steps = 28;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 1 : i / (count - 1); // 0 = far, 1 = near
        const baseY = horizon + (h - horizon) * Math.pow(t, 1.25) * 0.82;
        const amp = relief * (0.18 + 0.55 * t) * rng.float(0.8, 1.15);
        const freq = rng.float(0.8, 1.6) / Math.max(w, h * 0.6);
        const phase = rng.float(0, Math.PI * 2);
        const tilt = rng.float(-0.12, 0.12) * amp;
        // Haze: far ridges take on the horizon colour.
        const haze = (1 - t) * 0.7;
        const sand = mixHex(p.sand, p.skyHorizon, haze, "oklab");
        const dark = mixHex(p.shadow, p.skyHorizon, haze, "oklab");

        const crest: [number, number][] = [];
        const slip: [number, number][] = [];
        for (let s = 0; s <= steps; s++) {
          const x = -w * 0.05 + (w * 1.1 * s) / steps;
          const u = x * freq * Math.PI * 2 + phase;
          // Sharp-ish crests: a sine pushed towards its peaks.
          const wave = Math.pow(0.5 + 0.5 * Math.sin(u), 1.6);
          const y = baseY - amp * wave + tilt * (x / w - 0.5);
          crest.push([x, y]);
          // Slip face: a wedge in shadow on the lee side, starting at each peak.
          const lee = Math.max(0, Math.sin(u - Math.PI / 2));
          slip.push([x, y + amp * 0.95 * Math.sqrt(lee) * wave]);
        }
        const id = `du-f${i}`;
        defs.push(
          `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${shade(sand, 0.12)}"/>` +
            `<stop offset="1" stop-color="${shade(sand, -0.22)}"/></linearGradient>`,
          `<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0" stop-color="${dark}" stop-opacity="0.8"/>` +
            `<stop offset="1" stop-color="${dark}" stop-opacity="0.35"/></linearGradient>`,
        );
        const top = smoothPath(crest);
        const back = smoothPath(slip.slice().reverse()).replace(/^M/, "L");
        body.push(
          `<path d="${top}L${n(w * 1.05)} ${h}L${n(-w * 0.05)} ${h}Z" fill="url(#${id})"/>`,
          `<path d="${top}${back}Z" fill="url(#${id}s)"/>`,
          // A thin bright rim on the crest catches the low sun.
          `<path d="${top}" fill="none" stroke="${shade(sand, 0.35)}" stroke-opacity="${n(0.25 + 0.4 * t)}" stroke-width="${n(Math.max(1, Math.min(w, h) * 0.0018))}"/>`,
        );
      }
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
