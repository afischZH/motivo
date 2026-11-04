import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientAt, n, presetsFor, stops, svgOpen } from "./shared";

/**
 * Planet: one large lit sphere with an optional tilted ring in front of a
 * starfield. The ring's back half is drawn behind the planet, its front
 * half over it, so it wraps around. The palette runs from the lit side to
 * the night side.
 */
const ID = "planet";
const PLACES = ["low", "center", "corner"] as const;

const schema = z.object({
  background: colorSchema,
  palette: paletteSchema,
  /** Planet diameter relative to the short screen edge, percent. */
  size: z.number().min(20).max(140),
  place: z.enum(PLACES),
  ring: z.boolean(),
  ringColor: colorSchema,
  /** Number of stars, relative. */
  stars: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#070b1a",
  palette: ["#ffd3a5", "#fd6585", "#5b247a", "#120b2e"],
  size: 80,
  place: "low",
  ring: true,
  ringColor: "#ffe7c4",
  stars: 50,
};

function center(place: (typeof PLACES)[number], w: number, h: number, r: number): [number, number] {
  switch (place) {
    case "center":
      return [w / 2, h / 2];
    case "corner":
      return [w - r * 0.35, h - r * 0.35];
    case "low":
      // On a tall phone, lift it above the dock so the whole ring shows.
      return [w / 2, Math.min(h - r * 0.55, h * 0.72)];
  }
}

export const planetTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["saturn", {}, 3],
    [
      "ice",
      {
        background: "#020814",
        palette: ["#e0fbfc", "#98c1d9", "#3d5a80", "#0b132b"],
        size: 60,
        place: "center",
        ringColor: "#e0fbfc",
      },
      8,
    ],
    [
      "mars",
      {
        background: "#0b0606",
        palette: ["#ffb38a", "#d9603b", "#7a2417", "#1c0a07"],
        size: 110,
        place: "corner",
        ring: false,
        stars: 70,
      },
      5,
    ],
    [
      "emerald",
      {
        background: "#03120e",
        palette: ["#d8f3dc", "#52b788", "#1b4332", "#081c15"],
        size: 70,
        place: "low",
        ringColor: "#b7e4c7",
        stars: 30,
      },
      12,
    ],
    [
      "dawn",
      {
        background: "#fde2e4",
        palette: ["#ffffff", "#fad2e1", "#cdb4db", "#6d597a"],
        size: 75,
        place: "center",
        ringColor: "#6d597a",
        stars: 0,
      },
      2,
    ],
    [
      "void",
      {
        background: "#000000",
        palette: ["#f5f5f5", "#6b6b6b", "#1a1a1a", "#000000"],
        size: 120,
        place: "low",
        ring: false,
        stars: 90,
      },
      7,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const count = rng.int(3, 4);
    const palette = Array.from({ length: count }, (_, i) =>
      oklchToHex({
        l: 0.92 - (i / (count - 1)) * 0.78,
        c: rng.float(0.05, 0.16),
        h: (hue + i * rng.float(15, 45)) % 360,
      }),
    );
    const next: Params = {
      ...current,
      palette,
      background: oklchToHex({ l: 0.1, c: 0.03, h: (hue + 200) % 360 }),
      ringColor: oklchToHex({ l: 0.88, c: 0.06, h: (hue + 40) % 360 }),
      size: rng.int(50, 120),
      place: rng.pick(PLACES),
      ring: rng.bool(0.6),
      stars: rng.int(20, 90),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const r = (Math.min(w, h) * p.size) / 200;
      const [cx, cy] = center(p.place, w, h, r);
      const parts: string[] = [
        `<defs><radialGradient id="pl-body" cx="0.32" cy="0.28" r="0.85">${stops(p.palette)}</radialGradient>` +
          `<radialGradient id="pl-glow"><stop offset="0.6" stop-color="${gradientAt(p.palette, 0.15)}" stop-opacity="0.35"/><stop offset="1" stop-color="${gradientAt(p.palette, 0.15)}" stop-opacity="0"/></radialGradient></defs>`,
        `<rect width="${w}" height="${h}" fill="${p.background}"/>`,
      ];
      const count = Math.round(((w * h) / 2600) * (p.stars / 100));
      if (count > 0) {
        const dots: string[] = [];
        for (let i = 0; i < count; i++) {
          const size = rng.next() < 0.92 ? rng.float(0.4, 1.1) : rng.float(1.2, 2);
          dots.push(
            `<circle cx="${n(rng.float(0, w))}" cy="${n(rng.float(0, h))}" r="${n(size)}" opacity="${n(rng.float(0.35, 1))}"/>`,
          );
        }
        parts.push(`<g fill="#fff">${dots.join("")}</g>`);
      }
      parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.25)}" fill="url(#pl-glow)"/>`);
      const tilt = -18;
      const rx = r * 1.75;
      const ry = r * 0.36;
      const ringWidth = r * 0.14;
      const ringPath = (front: boolean) =>
        `<path d="M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 0 ${front ? 0 : 1} ${n(cx + rx)} ${n(cy)}" fill="none" stroke="${p.ringColor}" stroke-width="${n(ringWidth)}" stroke-opacity="${front ? 0.9 : 0.55}" transform="rotate(${tilt} ${n(cx)} ${n(cy)})"/>`;
      if (p.ring) parts.push(ringPath(false));
      parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#pl-body)"/>`);
      if (p.ring) parts.push(ringPath(true));
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
