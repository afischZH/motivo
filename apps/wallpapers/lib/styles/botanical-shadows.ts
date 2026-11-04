import { mixHex, oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, smoothPath, svgOpen } from "./shared";

/**
 * Botanical shadows: afternoon sun through a window onto a warm wall, with
 * the shadows of leafy stems falling across it. Soft shadow edges come from
 * three stacked, slightly offset copies at low opacity (a penumbra), not
 * from blur.
 */
const ID = "botanical-shadows";
const LEAVES = ["olive", "palm", "round"] as const;

const schema = z.object({
  wall: colorSchema,
  light: colorSchema,
  shadow: colorSchema,
  leaves: z.enum(LEAVES),
  stems: z.int().min(1).max(6),
  window: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  wall: "#e7d8c4",
  light: "#fff1d6",
  shadow: "#6b5440",
  leaves: "olive",
  stems: 3,
  window: true,
};

export const botanicalShadowsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["afternoon", {}, 1],
    ["palm", { wall: "#efe3d3", light: "#fff6e5", shadow: "#5c4a3b", leaves: "palm", stems: 2 }, 2],
    [
      "sage",
      { wall: "#d9dccf", light: "#f5f7ea", shadow: "#47513f", leaves: "round", stems: 4 },
      3,
    ],
    [
      "terracotta",
      { wall: "#d9a382", light: "#ffe2c6", shadow: "#6e3420", leaves: "olive", stems: 3 },
      4,
    ],
    [
      "dusk",
      {
        wall: "#b9a7b8",
        light: "#ffd9b8",
        shadow: "#3e2c46",
        leaves: "palm",
        stems: 3,
        window: false,
      },
      5,
    ],
    [
      "linen",
      {
        wall: "#f2ede4",
        light: "#ffffff",
        shadow: "#7d7466",
        leaves: "round",
        stems: 2,
        window: false,
      },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(20, 120);
    const next: Params = {
      ...current,
      wall: oklchToHex({ l: rng.float(0.78, 0.9), c: rng.float(0.02, 0.06), h: hue }),
      light: oklchToHex({ l: 0.96, c: 0.04, h: rng.float(60, 85) }),
      shadow: oklchToHex({ l: 0.35, c: 0.04, h: hue }),
      leaves: rng.pick(LEAVES),
      stems: rng.int(2, 5),
      window: rng.bool(0.6),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const sun = rng.float(-0.35, 0.35); // horizontal lean of the light
      const parts: string[] = [
        `<rect width="${w}" height="${h}" fill="${mixHex(p.wall, p.shadow, 0.12, "oklab")}"/>`,
      ];
      const defs: string[] = [];

      if (p.window) {
        // A slanted patch of sunlight with the window cross as shadow bars.
        const x0 = w * rng.float(0.05, 0.35);
        const y0 = h * 0.12;
        const pw = w * 0.6;
        const ph = h * 0.7;
        const skew = pw * sun;
        defs.push(
          `<linearGradient id="bs-light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.light}" stop-opacity="0.85"/><stop offset="1" stop-color="${p.light}" stop-opacity="0.35"/></linearGradient>`,
        );
        const quad = (ax: number, ay: number, bw: number, bh: number): string =>
          `M${n(ax)} ${n(ay)}L${n(ax + bw)} ${n(ay)}L${n(ax + bw + skew * (bh / ph))} ${n(ay + bh)}L${n(ax + skew * (bh / ph))} ${n(ay + bh)}Z`;
        const bar = short * 0.025;
        let d = "";
        for (const [qx, qy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          const bw = (pw - bar) / 2;
          const bh = (ph - bar) / 2;
          d += quad(
            x0 + qx * (bw + bar) + skew * ((qy * (bh + bar)) / ph),
            y0 + qy * (bh + bar),
            bw,
            bh,
          );
        }
        parts.push(`<path d="${d}" fill="url(#bs-light)"/>`);
      } else {
        defs.push(
          `<radialGradient id="bs-light"><stop offset="0" stop-color="${p.light}" stop-opacity="0.7"/><stop offset="1" stop-color="${p.light}" stop-opacity="0"/></radialGradient>`,
        );
        parts.push(
          `<ellipse cx="${n(w * 0.5)}" cy="${n(h * 0.45)}" rx="${n(w * 0.7)}" ry="${n(h * 0.5)}" fill="url(#bs-light)"/>`,
        );
      }

      // Leafy stems entering from the edges.
      let leaves = "";
      for (let s = 0; s < p.stems; s++) {
        const fromLeft = s % 2 === 0;
        const startX = fromLeft ? -short * 0.05 : w + short * 0.05;
        const startY = h * rng.float(0.35, 1);
        const len = short * rng.float(0.7, 1.2);
        const angle = fromLeft ? -rng.float(0.3, 1.1) : Math.PI + rng.float(0.3, 1.1);
        const bend = rng.float(-0.4, 0.4);
        const pts: [number, number][] = [];
        for (let i = 0; i <= 4; i++) {
          const t = i / 4;
          const a = angle + bend * t;
          pts.push([startX + Math.cos(a) * len * t, startY + Math.sin(a) * len * t]);
        }
        leaves += `<path d="${smoothPath(pts)}" fill="none" stroke="currentColor" stroke-width="${n(short * 0.006)}"/>`;
        const count = p.leaves === "palm" ? 16 : 9;
        for (let i = 1; i <= count; i++) {
          const t = i / (count + 1);
          const a = angle + bend * t;
          const x = startX + Math.cos(a) * len * t;
          const y = startY + Math.sin(a) * len * t;
          for (const side of [-1, 1]) {
            const la = a + side * (p.leaves === "palm" ? 1.1 : 0.7);
            const size =
              short *
              (p.leaves === "palm" ? 0.16 : p.leaves === "round" ? 0.05 : 0.09) *
              (1 - t * 0.4);
            const ry =
              p.leaves === "round" ? size * 0.85 : p.leaves === "palm" ? size * 0.09 : size * 0.3;
            const lx = x + Math.cos(la) * size;
            const ly = y + Math.sin(la) * size;
            leaves += `<ellipse cx="${n(lx)}" cy="${n(ly)}" rx="${n(size)}" ry="${n(ry)}" transform="rotate(${n((la * 180) / Math.PI)} ${n(lx)} ${n(ly)})"/>`;
          }
        }
      }
      defs.push(`<g id="bs-leaves" fill="currentColor">${leaves}</g>`);
      // Penumbra: three offset copies, the sharpest one darkest.
      const spread = short * 0.012;
      for (const [k, o] of [
        [2, 0.1],
        [1, 0.14],
        [0, 0.2],
      ] as const) {
        parts.push(
          `<use href="#bs-leaves" color="${p.shadow}" opacity="${o}" transform="translate(${n(k * spread * (1 + sun))} ${n(k * spread)})"/>`,
        );
      }
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
