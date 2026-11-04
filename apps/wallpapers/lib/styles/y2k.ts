import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, stops, svgOpen } from "./shared";

/**
 * Y2K: the turn-of-the-millennium look. Chrome bubbles with a bright
 * highlight and a tinted rim, four-point sparkles, thin orbit rings and a
 * baby-blue to silver gradient.
 */
const ID = "y2k";

const schema = z.object({
  backgroundTop: colorSchema,
  backgroundBottom: colorSchema,
  tint: colorSchema,
  bubbles: z.int().min(1).max(16),
  sparkles: z.int().min(0).max(40),
  orbits: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  backgroundTop: "#bfe3ff",
  backgroundBottom: "#eef3f8",
  tint: "#7aa8ff",
  bubbles: 6,
  sparkles: 14,
  orbits: true,
};

const sparkle = (x: number, y: number, r: number): string =>
  `M${n(x)} ${n(y - r)}Q${n(x + r * 0.12)} ${n(y - r * 0.12)} ${n(x + r)} ${n(y)}Q${n(x + r * 0.12)} ${n(y + r * 0.12)} ${n(x)} ${n(y + r)}Q${n(x - r * 0.12)} ${n(y + r * 0.12)} ${n(x - r)} ${n(y)}Q${n(x - r * 0.12)} ${n(y - r * 0.12)} ${n(x)} ${n(y - r)}Z`;

export const y2kTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["millennium", {}, 2],
    [
      "bubblegum",
      { backgroundTop: "#ffc8e8", backgroundBottom: "#f8eefe", tint: "#ff6fcf", bubbles: 8 },
      5,
    ],
    [
      "cyber",
      {
        backgroundTop: "#05070f",
        backgroundBottom: "#1a2140",
        tint: "#5df2ff",
        bubbles: 5,
        sparkles: 24,
      },
      8,
    ],
    [
      "silver",
      {
        backgroundTop: "#d9dde3",
        backgroundBottom: "#f7f8fa",
        tint: "#9aa3b5",
        bubbles: 7,
        orbits: false,
      },
      3,
    ],
    [
      "lime",
      {
        backgroundTop: "#e6ffb3",
        backgroundBottom: "#f6fbe9",
        tint: "#7bd400",
        bubbles: 4,
        sparkles: 8,
      },
      6,
    ],
    [
      "galaxy",
      {
        backgroundTop: "#1b0b3a",
        backgroundBottom: "#4a1f7a",
        tint: "#c69bff",
        bubbles: 10,
        sparkles: 30,
      },
      9,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const dark = rng.bool(0.3);
    const next: Params = {
      ...current,
      backgroundTop: oklchToHex({ l: dark ? 0.15 : 0.88, c: 0.08, h: hue }),
      backgroundBottom: oklchToHex({ l: dark ? 0.3 : 0.96, c: 0.03, h: (hue + 30) % 360 }),
      tint: oklchToHex({ l: 0.75, c: 0.15, h: hue }),
      bubbles: rng.int(3, 10),
      sparkles: rng.int(6, 26),
      orbits: rng.bool(0.6),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const defs: string[] = [
        `<linearGradient id="y2-bg" x1="0" y1="0" x2="0" y2="1">${stops([p.backgroundTop, p.backgroundBottom])}</linearGradient>`,
        `<radialGradient id="y2-bub" cx="0.38" cy="0.32" r="0.7">` +
          `<stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>` +
          `<stop offset="0.25" stop-color="#eef4ff" stop-opacity="0.55"/>` +
          `<stop offset="0.75" stop-color="${p.tint}" stop-opacity="0.25"/>` +
          `<stop offset="0.95" stop-color="${p.tint}" stop-opacity="0.8"/>` +
          `<stop offset="1" stop-color="#ffffff" stop-opacity="0.9"/></radialGradient>`,
        `<linearGradient id="y2-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${p.tint}"/><stop offset="0.5" stop-color="#2b3550"/><stop offset="1" stop-color="#e8eef8"/></linearGradient>`,
      ];
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="url(#y2-bg)"/>`];
      if (p.orbits) {
        const cx = w * rng.float(0.3, 0.7);
        const cy = h * rng.float(0.45, 0.7);
        for (let i = 0; i < 3; i++) {
          parts.push(
            `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(short * (0.3 + i * 0.16))}" ry="${n(short * (0.1 + i * 0.05))}" transform="rotate(${n(rng.float(-25, 25))} ${n(cx)} ${n(cy)})" fill="none" stroke="${p.tint}" stroke-opacity="0.55" stroke-width="${n(Math.max(1, short * 0.003))}"/>`,
          );
        }
      }
      for (let i = 0; i < p.bubbles; i++) {
        const r = short * rng.float(0.04, 0.16) * (i === 0 ? 1.8 : 1);
        const x = rng.float(0, w);
        const y = rng.float(h > w ? h * 0.3 : 0, h);
        parts.push(
          `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#y2-bub)"/>`,
          `<ellipse cx="${n(x - r * 0.35)}" cy="${n(y - r * 0.45)}" rx="${n(r * 0.28)}" ry="${n(r * 0.14)}" transform="rotate(-30 ${n(x - r * 0.35)} ${n(y - r * 0.45)})" fill="#fff" opacity="0.9"/>`,
        );
      }
      let d = "";
      for (let i = 0; i < p.sparkles; i++)
        d += sparkle(rng.float(0, w), rng.float(0, h), short * rng.float(0.012, 0.05));
      if (d) parts.push(`<path d="${d}" fill="url(#y2-chrome)"/>`);
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
