import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Sunburst: rays fanning out from a point, in alternating colours, like a
 * vintage poster or a candy wrapper. `twist` bends the rays into a spiral,
 * `sun` adds a disc with rings at the origin.
 */
const ID = "sunburst";
const ORIGINS = ["center", "bottom", "corner", "top"] as const;

const schema = z.object({
  palette: paletteSchema,
  rays: z.int().min(6).max(64),
  origin: z.enum(ORIGINS),
  /** Spiral bend of the rays, degrees. */
  twist: z.number().min(-90).max(90),
  sun: z.boolean(),
  sunColor: colorSchema,
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  palette: ["#ffb703", "#fb8500"],
  rays: 24,
  origin: "bottom",
  twist: 0,
  sun: true,
  sunColor: "#fff1c1",
};

function originPoint(origin: (typeof ORIGINS)[number], w: number, h: number): [number, number] {
  switch (origin) {
    case "center":
      return [w / 2, h / 2];
    case "bottom":
      return [w / 2, h * 1.02];
    case "corner":
      return [0, h];
    case "top":
      return [w / 2, -h * 0.02];
  }
}

export const sunburstTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["vintage", {}],
    [
      "candy",
      { palette: ["#ff8fab", "#ffe5ec"], rays: 32, origin: "center", twist: 45, sun: false },
    ],
    [
      "night",
      {
        palette: ["#0d1b2a", "#1b263b", "#415a77"],
        rays: 36,
        origin: "corner",
        twist: -25,
        sunColor: "#e0e1dd",
      },
    ],
    ["mint", { palette: ["#d8f3dc", "#b7e4c7", "#95d5b2"], rays: 18, origin: "top", sun: false }],
    [
      "circus",
      {
        palette: ["#e63946", "#f1faee", "#1d3557"],
        rays: 30,
        origin: "center",
        sunColor: "#f1faee",
      },
    ],
    [
      "swirl",
      {
        palette: ["#3a0ca3", "#7209b7", "#f72585"],
        rays: 48,
        origin: "center",
        twist: 85,
        sun: false,
      },
    ],
  ]),
  randomize(rng, current, locks) {
    const next: Params = {
      ...current,
      palette: huePalette(rng, rng.int(2, 3), { l: [0.85, 0.6], c: [0.08, 0.18] }, 40),
      rays: rng.int(12, 48),
      origin: rng.pick(ORIGINS),
      twist: rng.bool(0.5) ? 0 : rng.int(-70, 70),
      sun: rng.bool(0.5),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width: w, height: h }) {
      const [ox, oy] = originPoint(p.origin, w, h);
      const R = Math.hypot(w, h) * 1.2;
      const step = (Math.PI * 2) / p.rays;
      const twist = (p.twist * Math.PI) / 180;
      const parts = [
        `<rect width="${w}" height="${h}" fill="${p.palette[1] ?? p.palette[0] ?? "#000"}"/>`,
      ];
      const at = (a: number, r: number): string =>
        `${n(ox + Math.cos(a) * r)} ${n(oy + Math.sin(a) * r)}`;
      for (let i = 0; i < p.rays; i++) {
        const color = p.palette[i % p.palette.length] ?? "#000";
        const a0 = i * step;
        const a1 = a0 + step;
        if (twist === 0) {
          parts.push(`<path d="M${n(ox)} ${n(oy)}L${at(a0, R)}L${at(a1, R)}Z" fill="${color}"/>`);
        } else {
          // Each edge is a curve bending by `twist` on its way out.
          parts.push(
            `<path d="M${n(ox)} ${n(oy)}Q${at(a0 + twist, R * 0.5)} ${at(a0 + twist * 1.6, R)}` +
              `L${at(a1 + twist * 1.6, R)}Q${at(a1 + twist, R * 0.5)} ${n(ox)} ${n(oy)}Z" fill="${color}"/>`,
          );
        }
      }
      if (p.sun) {
        const r = Math.min(w, h) * 0.16;
        parts.push(
          `<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(r * 1.45)}" fill="${p.sunColor}" opacity="0.35"/>`,
          `<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(r * 1.2)}" fill="${p.sunColor}" opacity="0.5"/>`,
          `<circle cx="${n(ox)}" cy="${n(oy)}" r="${n(r)}" fill="${p.sunColor}"/>`,
        );
      }
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
