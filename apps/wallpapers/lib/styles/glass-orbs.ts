import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, shade, stops, svgOpen } from "./shared";

/**
 * Glass orbs: glossy spheres floating over a soft gradient, each with a
 * body gradient, a rim light, a specular highlight and a soft contact
 * shadow below. Orbs are placed largest first and keep their distance.
 */
const ID = "glass-orbs";

const schema = z.object({
  backgroundTop: colorSchema,
  backgroundBottom: colorSchema,
  palette: paletteSchema,
  orbs: z.int().min(1).max(14),
  /** Largest orb diameter, percent of the short edge. */
  size: z.number().min(10).max(90),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  backgroundTop: "#e9e4ff",
  backgroundBottom: "#ffe6f0",
  palette: ["#7b61ff", "#ff6fb5", "#ffc46b"],
  orbs: 6,
  size: 55,
};

export const glassOrbsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["dream", {}, 4],
    [
      "midnight",
      {
        backgroundTop: "#0b0b1e",
        backgroundBottom: "#1d1440",
        palette: ["#5b8cff", "#b06bff", "#3be8ff"],
        orbs: 7,
      },
      9,
    ],
    [
      "citrus",
      {
        backgroundTop: "#fff9e6",
        backgroundBottom: "#ffe1c4",
        palette: ["#ff8a00", "#ffd000", "#9be15d"],
        orbs: 5,
        size: 65,
      },
      2,
    ],
    [
      "mono",
      {
        backgroundTop: "#f2f2f2",
        backgroundBottom: "#d9d9d9",
        palette: ["#ffffff", "#bdbdbd"],
        orbs: 9,
        size: 40,
      },
      6,
    ],
    [
      "ocean",
      {
        backgroundTop: "#001a2c",
        backgroundBottom: "#003a4d",
        palette: ["#00c2ff", "#00ffa3", "#0066ff"],
        orbs: 4,
        size: 75,
      },
      11,
    ],
    [
      "bubbles",
      {
        backgroundTop: "#dff6ff",
        backgroundBottom: "#f6e8ff",
        palette: ["#9ad0ff", "#d7b5ff", "#ffc2e2"],
        orbs: 12,
        size: 35,
      },
      3,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const dark = rng.bool(0.4);
    const count = rng.int(2, 3);
    const next: Params = {
      ...current,
      backgroundTop: oklchToHex({ l: dark ? 0.15 : 0.95, c: 0.04, h: hue }),
      backgroundBottom: oklchToHex({ l: dark ? 0.25 : 0.9, c: 0.06, h: (hue + 40) % 360 }),
      palette: Array.from({ length: count }, (_, i) =>
        oklchToHex({
          l: rng.float(0.6, 0.8),
          c: rng.float(0.12, 0.2),
          h: (hue + 60 + i * 70) % 360,
        }),
      ),
      orbs: rng.int(3, 10),
      size: rng.int(35, 70),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const short = Math.min(w, h);
      const defs: string[] = [
        `<linearGradient id="go-bg" x1="0" y1="0" x2="0" y2="1">${stops([p.backgroundTop, p.backgroundBottom])}</linearGradient>`,
        `<radialGradient id="go-shadow"><stop offset="0" stop-color="#000" stop-opacity="0.28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`,
        `<radialGradient id="go-spec" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
      ];
      p.palette.forEach((c, i) => {
        defs.push(
          `<radialGradient id="go-${i}" cx="0.35" cy="0.3" r="0.8">` +
            `<stop offset="0" stop-color="${shade(c, 0.55)}"/>` +
            `<stop offset="0.45" stop-color="${c}"/>` +
            `<stop offset="1" stop-color="${shade(c, -0.55)}"/></radialGradient>`,
          `<radialGradient id="go-rim-${i}" cx="0.5" cy="0.5" r="0.5">` +
            `<stop offset="0.82" stop-color="${shade(c, 0.6)}" stop-opacity="0"/>` +
            `<stop offset="1" stop-color="${shade(c, 0.6)}" stop-opacity="0.55"/></radialGradient>`,
        );
      });
      // Place largest first; skip spots that overlap too much.
      const placed: [number, number, number][] = [];
      const maxR = (short * p.size) / 200;
      for (let i = 0; i < p.orbs; i++) {
        const r = maxR * Math.pow(0.78, i) * rng.float(0.85, 1.1);
        for (let attempt = 0; attempt < 40; attempt++) {
          const x = rng.float(r * 0.4, w - r * 0.4);
          // On a phone, keep the orbs below the lock-screen clock.
          const minY = h > w ? h * 0.36 : h * 0.12;
          const y = rng.float(Math.min(minY + r * 0.4, h - r), h - r * 0.4);
          const clear = placed.every(
            ([px, py, pr]) => Math.hypot(px - x, py - y) > (pr + r) * 0.82,
          );
          if (clear || attempt === 39) {
            placed.push([x, y, r]);
            break;
          }
        }
      }
      // Draw from the back (smallest, far) to the front (largest).
      const body = placed
        .map(([x, y, r], i) => ({ x, y, r, c: i % p.palette.length }))
        .reverse()
        .map(
          ({ x, y, r, c }) =>
            `<ellipse cx="${n(x + r * 0.15)}" cy="${n(y + r * 1.05)}" rx="${n(r * 0.95)}" ry="${n(r * 0.22)}" fill="url(#go-shadow)"/>` +
            `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#go-${c})"/>` +
            `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#go-rim-${c})"/>` +
            `<ellipse cx="${n(x - r * 0.32)}" cy="${n(y - r * 0.4)}" rx="${n(r * 0.3)}" ry="${n(r * 0.18)}" fill="url(#go-spec)" transform="rotate(-30 ${n(x - r * 0.32)} ${n(y - r * 0.4)})"/>`,
        );
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs><rect width="${w}" height="${h}" fill="url(#go-bg)"/>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
