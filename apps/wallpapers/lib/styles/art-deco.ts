import { mixHex, oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, svgOpen } from "./shared";

/**
 * Art Deco: gold linework on a deep ground. Either a tiled pattern of
 * fan scales, or a centrepiece of a stepped sunrise with radiating rays
 * and nested arches. Gold is a banded metallic gradient.
 */
const ID = "art-deco";
const LAYOUTS = ["fans", "sunrise", "arches"] as const;

const schema = z.object({
  background: colorSchema,
  gold: colorSchema,
  layout: z.enum(LAYOUTS),
  /** Pattern scale, percent of the short edge. */
  scale: z.number().min(8).max(40),
  /** Line width, per mille of the short edge. */
  line: z.number().min(1).max(8),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#0e1a2b",
  gold: "#d4af37",
  layout: "sunrise",
  scale: 20,
  line: 2.5,
};

export const artDecoTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["gatsby", {}, 1],
    ["scales", { background: "#101010", layout: "fans", scale: 18 }, 2],
    ["emerald", { background: "#0b2a22", gold: "#e6c36a", layout: "arches", scale: 22 }, 3],
    ["ivory", { background: "#f1e8d4", gold: "#9b7a2f", layout: "fans", scale: 14, line: 2 }, 4],
    ["ruby", { background: "#2a0a12", gold: "#e8b86b", layout: "sunrise", line: 3.5 }, 5],
    [
      "midnight",
      { background: "#05060c", gold: "#c9b27a", layout: "arches", scale: 30, line: 1.5 },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const light = rng.bool(0.2);
    const next: Params = {
      ...current,
      background: light
        ? oklchToHex({ l: 0.92, c: 0.03, h: 80 })
        : oklchToHex({ l: rng.float(0.1, 0.2), c: rng.float(0.02, 0.07), h: rng.float(0, 360) }),
      gold: oklchToHex({
        l: light ? 0.55 : rng.float(0.72, 0.82),
        c: rng.float(0.09, 0.13),
        h: rng.float(75, 90),
      }),
      layout: rng.pick(LAYOUTS),
      scale: rng.int(12, 30),
      line: rng.float(1.5, 4),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width: w, height: h }) {
      const short = Math.min(w, h);
      const lw = Math.max(1, (short * p.line) / 1000);
      const light = mixHex(p.gold, "#fff8e0", 0.55, "oklab");
      const dark = mixHex(p.gold, "#000000", 0.35, "oklab");
      const defs: string[] = [
        `<linearGradient id="ad-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n(w)}" y2="${n(h)}">` +
          `<stop offset="0" stop-color="${dark}"/><stop offset="0.3" stop-color="${light}"/><stop offset="0.5" stop-color="${p.gold}"/>` +
          `<stop offset="0.7" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`,
      ];
      const stroke = `fill="none" stroke="url(#ad-gold)" stroke-width="${n(lw)}"`;
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      const s = (short * p.scale) / 100;

      if (p.layout === "fans") {
        // Overlapping fan scales: each row offset by half a fan.
        let d = "";
        const r = s / 2;
        for (let row = -1; row * r * 0.5 < h + r; row++) {
          const y = row * r * 0.5;
          const shift = row % 2 ? r : 0;
          for (let x = -r + shift; x < w + r * 2; x += r * 2) {
            for (let k = 1; k <= 4; k++) {
              const rk = (r * k) / 4;
              d += `M${n(x - rk)} ${n(y + r)}A${n(rk)} ${n(rk)} 0 0 1 ${n(x + rk)} ${n(y + r)}`;
            }
          }
        }
        parts.push(`<path d="${d}" ${stroke}/>`);
      } else if (p.layout === "sunrise") {
        const cx = w / 2;
        const cy = h * (h > w ? 0.78 : 0.82);
        const reach = Math.hypot(w, h);
        let rays = "";
        for (let i = 0; i <= 36; i++) {
          const a = Math.PI + (i / 36) * Math.PI;
          const r0 = s * 1.4;
          rays += `M${n(cx + Math.cos(a) * r0)} ${n(cy + Math.sin(a) * r0)}L${n(cx + Math.cos(a) * reach)} ${n(cy + Math.sin(a) * reach)}`;
        }
        parts.push(`<path d="${rays}" ${stroke} opacity="0.55"/>`);
        // Stepped sun: nested half circles.
        for (let k = 1; k <= 5; k++) {
          const rk = s * 0.28 * k;
          parts.push(
            `<path d="M${n(cx - rk)} ${n(cy)}A${n(rk)} ${n(rk)} 0 0 1 ${n(cx + rk)} ${n(cy)}" ${stroke}/>`,
          );
        }
        parts.push(
          `<path d="M${n(cx - s * 0.28)} ${n(cy)}A${n(s * 0.28)} ${n(s * 0.28)} 0 0 1 ${n(cx + s * 0.28)} ${n(cy)}Z" fill="url(#ad-gold)"/>`,
        );
        // Ground: stepped bands.
        let ground = "";
        for (let k = 0; k < 4; k++) ground += `M0 ${n(cy + k * lw * 5)}H${w}`;
        parts.push(`<path d="${ground}" ${stroke}/>`);
      } else {
        // Nested stepped arches in the centre, framed by vertical lines.
        const cx = w / 2;
        const base = h * 0.92;
        for (let k = 0; k < 7; k++) {
          const aw = s * (1.2 + k * 0.45);
          const top = base - s * (2.4 + k * 0.6);
          parts.push(
            `<path d="M${n(cx - aw / 2)} ${n(base)}V${n(top + aw / 2)}A${n(aw / 2)} ${n(aw / 2)} 0 0 1 ${n(cx + aw / 2)} ${n(top + aw / 2)}V${n(base)}" ${stroke}/>`,
          );
        }
        let lines = "";
        for (let x = s * 0.4; x < w / 2 - s * 2; x += s * 0.4)
          lines += `M${n(x)} ${n(h * 0.1)}V${n(base)}M${n(w - x)} ${n(h * 0.1)}V${n(base)}`;
        parts.push(`<path d="${lines}" ${stroke} opacity="0.35"/>`);
        parts.push(`<path d="M0 ${n(base)}H${w}" ${stroke}/>`);
      }
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
