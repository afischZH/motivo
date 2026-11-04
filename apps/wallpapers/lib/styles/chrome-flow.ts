import { mixHex, oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, smoothPath, stops, svgOpen } from "./shared";

/**
 * Chrome flow: thick ribbons of liquid metal. The classic chrome look is a
 * reflection of sky and ground: a bright sky band, a sharp dark horizon and
 * a warmer ground, run across each ribbon, with a dark edge and a thin
 * specular line on top.
 */
const ID = "chrome-flow";

const schema = z.object({
  backgroundTop: colorSchema,
  backgroundBottom: colorSchema,
  sky: colorSchema,
  ground: colorSchema,
  ribbons: z.int().min(1).max(6),
  /** Ribbon thickness, percent of the short edge. */
  thickness: z.number().min(4).max(40),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  backgroundTop: "#0a0a0f",
  backgroundBottom: "#1b1b26",
  sky: "#9fc7ff",
  ground: "#3a2c2a",
  ribbons: 3,
  thickness: 16,
};

export const chromeFlowTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["mercury", {}, 3],
    [
      "sunset",
      {
        backgroundTop: "#1a0710",
        backgroundBottom: "#3a0f24",
        sky: "#ffb38a",
        ground: "#2a0b2e",
        ribbons: 2,
        thickness: 22,
      },
      5,
    ],
    [
      "ice",
      {
        backgroundTop: "#e9eef5",
        backgroundBottom: "#c9d4e3",
        sky: "#d8ecff",
        ground: "#53627a",
        ribbons: 3,
      },
      8,
    ],
    [
      "gold",
      {
        backgroundTop: "#0b0904",
        backgroundBottom: "#1d160a",
        sky: "#ffe7a1",
        ground: "#5a3a10",
        ribbons: 2,
        thickness: 26,
      },
      2,
    ],
    [
      "holo",
      {
        backgroundTop: "#0b0620",
        backgroundBottom: "#1b0d3a",
        sky: "#c7b5ff",
        ground: "#ff5fa8",
        ribbons: 4,
        thickness: 12,
      },
      11,
    ],
    ["single", { ribbons: 1, thickness: 34 }, 6],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const light = rng.bool(0.2);
    const next: Params = {
      ...current,
      backgroundTop: oklchToHex({ l: light ? 0.94 : 0.1, c: 0.02, h: hue }),
      backgroundBottom: oklchToHex({ l: light ? 0.85 : 0.2, c: 0.04, h: hue }),
      sky: oklchToHex({ l: rng.float(0.82, 0.92), c: rng.float(0.04, 0.12), h: rng.float(0, 360) }),
      ground: oklchToHex({
        l: rng.float(0.25, 0.4),
        c: rng.float(0.03, 0.12),
        h: rng.float(0, 360),
      }),
      ribbons: rng.int(1, 4),
      thickness: rng.int(10, 28),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const t = (short * p.thickness) / 100;
      const defs: string[] = [
        `<linearGradient id="cf-bg" x1="0" y1="0" x2="0" y2="1">${stops([p.backgroundTop, p.backgroundBottom])}</linearGradient>`,
      ];
      const body: string[] = [`<rect width="${w}" height="${h}" fill="url(#cf-bg)"/>`];
      for (let r = 0; r < p.ribbons; r++) {
        // A loose S-curve across the screen.
        const vertical = h > w;
        const pts: [number, number][] = [];
        const count = 6;
        const offset = rng.float(0.2, 0.8);
        const amp = rng.float(0.15, 0.35);
        const phase = rng.float(0, Math.PI * 2);
        for (let i = 0; i <= count; i++) {
          const u = -0.15 + (1.3 * i) / count;
          const v = offset + amp * Math.sin(u * Math.PI * rng.float(1.2, 2) + phase);
          pts.push(vertical ? [v * w, u * h] : [u * w, v * h]);
        }
        const d = smoothPath(pts);
        // Environment reflection: slow chrome bands across the whole screen,
        // so the colour drifts gently along the ribbon instead of striping.
        const angle = rng.float(-35, 35);
        const id = `cf-${r}`;
        const horizon = mixHex(p.sky, "#000000", 0.85, "oklab");
        const skyHi = mixHex(p.sky, "#ffffff", 0.7, "oklab");
        const groundHi = mixHex(p.ground, "#ffffff", 0.35, "oklab");
        const cycles = 2;
        let bands = "";
        for (let c = 0; c < cycles; c++) {
          const o = (k: number): string => n((c + k) / cycles);
          bands +=
            `<stop offset="${o(0)}" stop-color="${skyHi}"/>` +
            `<stop offset="${o(0.3)}" stop-color="${p.sky}"/>` +
            `<stop offset="${o(0.47)}" stop-color="${mixHex(p.sky, "#ffffff", 0.4, "oklab")}"/>` +
            `<stop offset="${o(0.5)}" stop-color="${horizon}"/>` +
            `<stop offset="${o(0.62)}" stop-color="${p.ground}"/>` +
            `<stop offset="${o(1)}" stop-color="${groundHi}"/>`;
        }
        defs.push(
          `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(w / 2)}" y1="${n(-h * 0.1)}" x2="${n(w / 2)}" y2="${n(h * 1.1)}" gradientTransform="rotate(${n(angle)} ${n(w / 2)} ${n(h / 2)})">${bands}</linearGradient>`,
        );
        const width = t * rng.float(0.7, 1.15);
        body.push(
          `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="${n(width * 1.18)}" stroke-linecap="round" transform="translate(${n(t * 0.08)} ${n(t * 0.12)})"/>`,
          `<path d="${d}" fill="none" stroke="${horizon}" stroke-width="${n(width * 1.06)}" stroke-linecap="round"/>`,
          `<path d="${d}" fill="none" stroke="url(#${id})" stroke-width="${n(width)}" stroke-linecap="round"/>`,
          `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="${n(Math.max(1, width * 0.05))}" stroke-linecap="round" transform="translate(${n(-width * 0.18)} ${n(-width * 0.22)})"/>`,
        );
      }
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
