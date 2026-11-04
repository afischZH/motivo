import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, svgOpen } from "./shared";

/**
 * Op art: alternating stripes that bulge around invisible spheres, so the
 * flat page seems to swell, in the tradition of 1960s optical art. The
 * stripes are filled bands between displaced lines, so they never cross.
 */
const ID = "op-art";
const MAX_STRIPES = 240;

const schema = z.object({
  ink: colorSchema,
  paper: colorSchema,
  /** Stripe height in design pixels. */
  stripe: z.number().min(3).max(60),
  bulges: z.int().min(1).max(4),
  /** Bulge strength, percent. */
  strength: z.number().min(0).max(100),
  vertical: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  ink: "#111111",
  paper: "#f5f2ea",
  stripe: 12,
  bulges: 1,
  strength: 70,
  vertical: false,
};

export const opArtTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds", "patterns"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["classic", {}, 1],
    ["twin", { bulges: 2, stripe: 9, strength: 60 }, 4],
    ["neon", { ink: "#ff2bd6", paper: "#0b0221", stripe: 10, bulges: 3, strength: 55 }, 7],
    ["ocean", { ink: "#023e8a", paper: "#caf0f8", stripe: 16, strength: 85, vertical: true }, 2],
    ["fine", { ink: "#222222", paper: "#ffffff", stripe: 5, bulges: 2, strength: 45 }, 9],
    [
      "sunny",
      { ink: "#e85d04", paper: "#ffe8a3", stripe: 20, bulges: 1, strength: 90, vertical: true },
      3,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const dark = rng.bool(0.35);
    const next: Params = {
      ...current,
      ink: oklchToHex({ l: dark ? 0.75 : 0.25, c: rng.float(0, 0.2), h: hue }),
      paper: oklchToHex({ l: dark ? 0.12 : 0.96, c: 0.02, h: (hue + 180) % 360 }),
      stripe: rng.int(6, 22),
      bulges: rng.int(1, 3),
      strength: rng.int(40, 90),
      vertical: rng.bool(0.3),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      // Work in a frame where stripes run along u; swap axes for vertical.
      const U = p.vertical ? h : w;
      const V = p.vertical ? w : h;
      const short = Math.min(w, h);
      const bumps = Array.from({ length: p.bulges }, () => ({
        u: rng.float(0.2, 0.8) * U,
        v: rng.float(0.25, 0.8) * V,
        r: short * rng.float(0.25, 0.42),
      }));
      const lift = (u: number, v: number): number => {
        let d = 0;
        for (const b of bumps) {
          const q = ((u - b.u) ** 2 + (v - b.v) ** 2) / (b.r * b.r);
          // Pushes lines away from the bump centre: a lens-like swelling.
          d += (v - b.v) * Math.exp(-q) * (p.strength / 100) * 1.5;
        }
        return v + d;
      };
      const stripe = Math.max(p.stripe, V / MAX_STRIPES);
      const samples = 120;
      const line = (v: number): [number, number][] =>
        Array.from({ length: samples + 1 }, (_, i) => {
          const u = (i / samples) * U;
          return [u, lift(u, v)];
        });
      const pt = ([u, v]: [number, number]) => (p.vertical ? `${n(v)} ${n(u)}` : `${n(u)} ${n(v)}`);
      const bands: string[] = [];
      let prev = line(-stripe * 2);
      for (let k = -1; k * stripe < V + stripe * 2; k++) {
        const next = line(k * stripe);
        if (k % 2 === 0) {
          bands.push(`M${prev.map(pt).join("L")}L${[...next].reverse().map(pt).join("L")}Z`);
        }
        prev = next;
      }
      return `${svgOpen(w, h)}<rect width="${w}" height="${h}" fill="${p.paper}"/><path d="${bands.join("")}" fill="${p.ink}"/></svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
