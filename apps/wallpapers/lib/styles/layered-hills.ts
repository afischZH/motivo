import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientAt, n, presetsFor, stops, svgOpen } from "./shared";

/**
 * Layered hills: a sky gradient with soft rolling hills in front of each
 * other, lighter (further away) to darker (closer), like atmospheric
 * perspective. Each hill line is a sum of three sine waves with seeded
 * phases. `palette` runs from the furthest hill to the closest one.
 */
const ID = "layered-hills";

const schema = z.object({
  skyTop: colorSchema,
  skyBottom: colorSchema,
  palette: paletteSchema,
  layers: z.int().min(2).max(9),
  /** Hill height in percent. */
  roughness: z.number().min(0).max(100),
  /** Sun or moon disc (off = no disc). */
  sun: z.boolean(),
  sunColor: colorSchema,
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  skyTop: "#ffd8b5",
  skyBottom: "#ffb39a",
  palette: ["#f08a7e", "#c25e74", "#7b3f6e", "#3b2453"],
  layers: 5,
  roughness: 45,
  sun: true,
  sunColor: "#fff3d6",
};

function hillPath(
  w: number,
  h: number,
  base: number,
  amp: number,
  phases: readonly number[],
): string {
  const steps = 96;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const u = i / steps;
    const y =
      base -
      amp *
        (0.55 * Math.sin(u * Math.PI * 1.3 + (phases[0] ?? 0)) +
          0.3 * Math.sin(u * Math.PI * 3.1 + (phases[1] ?? 0)) +
          0.15 * Math.sin(u * Math.PI * 7.3 + (phases[2] ?? 0)));
    points.push(`${n(x)} ${n(y)}`);
  }
  return `M0 ${n(h)}L${points.join("L")}L${n(w)} ${n(h)}Z`;
}

export const layeredHillsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["peach", {}, 4],
    [
      "fjord",
      {
        skyTop: "#cfe6f2",
        skyBottom: "#eef6f7",
        palette: ["#a7c7d6", "#6f9bb3", "#3f6b88", "#1d3a52", "#0d1f2f"],
        layers: 6,
        roughness: 60,
        sunColor: "#ffffff",
      },
      11,
    ],
    [
      "dusk",
      {
        skyTop: "#1b1440",
        skyBottom: "#e76f6f",
        palette: ["#b8507a", "#7a2f6b", "#451f57", "#1d1236"],
        layers: 4,
        sunColor: "#ffd27a",
      },
      2,
    ],
    [
      "forest",
      {
        skyTop: "#e9f1e4",
        skyBottom: "#f8f3e3",
        palette: ["#b7cdb0", "#7fa37e", "#4d7656", "#28493a", "#132820"],
        layers: 7,
        roughness: 35,
        sun: false,
      },
      7,
    ],
    [
      "desert",
      {
        skyTop: "#7ec8e3",
        skyBottom: "#fbe3c1",
        palette: ["#f2c48d", "#e39a5b", "#c4683b", "#8a3f24"],
        layers: 4,
        roughness: 25,
        sunColor: "#fffaf0",
      },
      5,
    ],
    [
      "night",
      {
        skyTop: "#05070f",
        skyBottom: "#1c2541",
        palette: ["#3a506b", "#2a3b55", "#1b263b", "#0d1321"],
        layers: 5,
        roughness: 50,
        sunColor: "#e8ecf5",
      },
      9,
    ],
    [
      "lavender",
      {
        skyTop: "#f3e8ff",
        skyBottom: "#fdf2f8",
        palette: ["#d8b4fe", "#a78bfa", "#7c3aed", "#4c1d95"],
        layers: 6,
        roughness: 40,
        sunColor: "#ffffff",
      },
      3,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const dark = rng.bool(0.3);
    const count = rng.int(3, 6);
    const shift = rng.float(-40, 40);
    const palette = Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      return oklchToHex({
        l: dark ? 0.55 - t * 0.4 : 0.82 - t * 0.6,
        c: rng.float(0.05, 0.14),
        h: (hue + shift * t + 360) % 360,
      });
    });
    const next: Params = {
      ...current,
      skyTop: oklchToHex({ l: dark ? 0.15 : 0.9, c: rng.float(0.02, 0.08), h: (hue + 180) % 360 }),
      skyBottom: oklchToHex({ l: dark ? 0.4 : 0.94, c: rng.float(0.03, 0.1), h: (hue + 30) % 360 }),
      palette,
      layers: rng.int(3, 8),
      roughness: rng.int(20, 70),
      sun: rng.bool(0.6),
      sunColor: oklchToHex({ l: 0.96, c: 0.04, h: (hue + 60) % 360 }),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const parts: string[] = [
        `<defs><linearGradient id="hl-sky" x1="0" y1="0" x2="0" y2="1">${stops([p.skyTop, p.skyBottom])}</linearGradient></defs>`,
        `<rect width="${w}" height="${h}" fill="url(#hl-sky)"/>`,
      ];
      const portrait = h > w;
      // Hills fill the lower part; taller screens keep more sky for the clock.
      const top = portrait ? 0.5 : 0.42;
      const amp = Math.min(w, h) * (0.04 + (p.roughness / 100) * 0.18);
      if (p.sun) {
        const r = Math.min(w, h) * (portrait ? 0.16 : 0.11);
        const cx = w * rng.float(0.25, 0.75);
        parts.push(
          `<circle cx="${n(cx)}" cy="${n(h * top - amp * 0.2)}" r="${n(r)}" fill="${p.sunColor}"/>`,
        );
      }
      for (let i = 0; i < p.layers; i++) {
        const t = p.layers === 1 ? 1 : i / (p.layers - 1);
        const base = h * (top + (1 - top) * 0.85 * Math.pow(t, 0.9)) + amp * 0.5;
        const phases = [rng.float(0, 6.3), rng.float(0, 6.3), rng.float(0, 6.3)];
        parts.push(
          `<path d="${hillPath(w, h, base, amp * (1 - t * 0.35), phases)}" fill="${gradientAt(p.palette, t)}"/>`,
        );
      }
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
