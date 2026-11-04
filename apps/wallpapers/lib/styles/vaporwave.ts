import { mixHex, oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, stops, svgOpen } from "./shared";

/**
 * Vaporwave: a pastel dream of the early web. A pink-to-teal sky, a sun cut
 * by horizontal slits, a checkerboard floor in perspective and a few
 * floating wireframe solids.
 */
const ID = "vaporwave";

const schema = z.object({
  skyTop: colorSchema,
  skyBottom: colorSchema,
  sun: colorSchema,
  floorA: colorSchema,
  floorB: colorSchema,
  solids: z.int().min(0).max(5),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  skyTop: "#7ee8fa",
  skyBottom: "#f9a8d4",
  sun: "#ffd166",
  floorA: "#2d1b4e",
  floorB: "#ff71ce",
  solids: 2,
};

export const vaporwaveTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["aesthetic", {}, 1],
    [
      "mall",
      {
        skyTop: "#b8f2e6",
        skyBottom: "#ffa69e",
        sun: "#fff3b0",
        floorA: "#5e548e",
        floorB: "#e0b1cb",
        solids: 3,
      },
      2,
    ],
    [
      "night",
      {
        skyTop: "#0b0033",
        skyBottom: "#7a00ff",
        sun: "#ff2fd1",
        floorA: "#000000",
        floorB: "#00f0ff",
        solids: 2,
      },
      3,
    ],
    [
      "sorbet",
      {
        skyTop: "#ffd1e8",
        skyBottom: "#c1f0ff",
        sun: "#ff9de2",
        floorA: "#ffffff",
        floorB: "#9be7ff",
        solids: 1,
      },
      4,
    ],
    [
      "mint",
      {
        skyTop: "#a1ffce",
        skyBottom: "#faffd1",
        sun: "#ff7eb3",
        floorA: "#14213d",
        floorB: "#3df2c0",
        solids: 0,
      },
      5,
    ],
    [
      "sunset",
      {
        skyTop: "#5f0f40",
        skyBottom: "#fb8b24",
        sun: "#ffe066",
        floorA: "#1b1b3a",
        floorB: "#e36414",
        solids: 3,
      },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const next: Params = {
      ...current,
      skyTop: oklchToHex({ l: rng.float(0.3, 0.9), c: 0.12, h: hue }),
      skyBottom: oklchToHex({ l: 0.8, c: 0.13, h: (hue + 120) % 360 }),
      sun: oklchToHex({ l: 0.85, c: 0.16, h: rng.float(0, 360) }),
      floorA: oklchToHex({ l: rng.float(0.1, 0.3), c: 0.08, h: (hue + 240) % 360 }),
      floorB: oklchToHex({ l: 0.75, c: 0.17, h: (hue + 300) % 360 }),
      solids: rng.int(0, 3),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const horizon = h * (h > w ? 0.62 : 0.6);
      const defs: string[] = [
        `<linearGradient id="vw-sky" x1="0" y1="0" x2="0" y2="1">${stops([p.skyTop, p.skyBottom])}</linearGradient>`,
        `<linearGradient id="vw-sun" x1="0" y1="0" x2="0" y2="1">${stops([p.sun, mixHex(p.sun, p.floorB, 0.7, "oklab")])}</linearGradient>`,
      ];
      const parts: string[] = [`<rect width="${w}" height="${horizon + 1}" fill="url(#vw-sky)"/>`];

      // Sun with slits that widen towards the horizon.
      const r = short * 0.32;
      const sx = w / 2;
      const sy = horizon - r * 0.35;
      let mask = `<rect x="${n(sx - r)}" y="${n(sy - r)}" width="${n(r * 2)}" height="${n(r * 2)}" fill="#fff"/>`;
      for (let i = 0; i < 6; i++) {
        const y = sy + r * (0.05 + i * 0.16);
        mask += `<rect x="${n(sx - r)}" y="${n(y)}" width="${n(r * 2)}" height="${n(r * 0.02 * (i + 1))}" fill="#000"/>`;
      }
      defs.push(
        `<mask id="vw-cut">${mask}</mask>`,
        `<clipPath id="vw-above"><rect width="${w}" height="${n(horizon)}"/></clipPath>`,
      );
      parts.push(
        `<g clip-path="url(#vw-above)"><circle cx="${n(sx)}" cy="${n(sy)}" r="${n(r)}" fill="url(#vw-sun)" mask="url(#vw-cut)"/></g>`,
      );

      // Checkerboard floor in one-point perspective.
      parts.push(
        `<rect y="${n(horizon)}" width="${w}" height="${n(h - horizon)}" fill="${p.floorA}"/>`,
      );
      const depth = h - horizon;
      const rows = 12;
      const cols = 14;
      const spread = w * 2.4;
      const rowY = (k: number): number => horizon + depth * Math.pow(k / rows, 2.2);
      const colX = (c: number, y: number): number => {
        const t = (y - horizon) / depth;
        return w / 2 + (c / cols - 0.5) * (w * 0.3 + (spread - w * 0.3) * t);
      };
      let d = "";
      for (let k = 0; k < rows; k++) {
        const y0 = rowY(k);
        const y1 = rowY(k + 1);
        for (let c = 0; c < cols; c++) {
          if ((c + k) % 2) continue;
          d += `M${n(colX(c, y0))} ${n(y0)}L${n(colX(c + 1, y0))} ${n(y0)}L${n(colX(c + 1, y1))} ${n(y1)}L${n(colX(c, y1))} ${n(y1)}Z`;
        }
      }
      parts.push(`<path d="${d}" fill="${p.floorB}"/>`);

      // Floating wireframe solids (cube or pyramid) in the sky.
      for (let i = 0; i < p.solids; i++) {
        const s = short * rng.float(0.08, 0.16);
        const x = rng.float(s, w - s);
        const y = rng.float(h > w ? h * 0.3 : s, horizon - s * 1.5);
        const turn = rng.float(0, 360);
        const stroke = `fill="none" stroke="${mixHex(p.floorB, "#ffffff", 0.3, "oklab")}" stroke-width="${n(Math.max(1, short * 0.003))}" stroke-linejoin="round"`;
        if (rng.bool(0.5)) {
          const o = s * 0.4;
          parts.push(
            `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(turn)})" ${stroke}><rect x="${n(-s / 2)}" y="${n(-s / 2)}" width="${n(s)}" height="${n(s)}"/><rect x="${n(-s / 2 + o)}" y="${n(-s / 2 - o)}" width="${n(s)}" height="${n(s)}"/>` +
              `<path d="M${n(-s / 2)} ${n(-s / 2)}l${n(o)} ${n(-o)}M${n(s / 2)} ${n(-s / 2)}l${n(o)} ${n(-o)}M${n(s / 2)} ${n(s / 2)}l${n(o)} ${n(-o)}M${n(-s / 2)} ${n(s / 2)}l${n(o)} ${n(-o)}"/></g>`,
          );
        } else {
          parts.push(
            `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(turn)})" ${stroke}><path d="M0 ${n(-s * 0.7)}L${n(-s * 0.6)} ${n(s * 0.4)}L${n(s * 0.15)} ${n(s * 0.55)}L${n(s * 0.6)} ${n(s * 0.3)}ZM0 ${n(-s * 0.7)}L${n(s * 0.15)} ${n(s * 0.55)}"/></g>`,
          );
        }
      }
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
