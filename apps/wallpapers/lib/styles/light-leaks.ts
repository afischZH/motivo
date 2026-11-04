import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { huePalette, luminance, n, presetsFor, stops, svgOpen } from "./shared";

/**
 * Light leaks: warm film flares bleeding in from the edges, with a few
 * long streaks and a soft vignette. Large radial gradients blended with
 * `screen`, no blur filters.
 */
const ID = "light-leaks";

const schema = z.object({
  backgroundTop: colorSchema,
  backgroundBottom: colorSchema,
  palette: paletteSchema,
  leaks: z.int().min(1).max(8),
  /** Strength 0 to 100. */
  intensity: z.number().min(10).max(100),
  streaks: z.boolean(),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  backgroundTop: "#1a0d08",
  backgroundBottom: "#0b0604",
  palette: ["#ff6a1a", "#ffb347", "#ff2f5b"],
  leaks: 4,
  intensity: 75,
  streaks: true,
};

export const lightLeaksTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["film", {}, 3],
    [
      "rose",
      {
        backgroundTop: "#1c0b14",
        backgroundBottom: "#0a0408",
        palette: ["#ff4f8b", "#ffb2c8", "#b14bff"],
        leaks: 3,
      },
      7,
    ],
    [
      "golden",
      {
        backgroundTop: "#2a1a06",
        backgroundBottom: "#120b02",
        palette: ["#ffc247", "#ff8a00"],
        leaks: 5,
        intensity: 85,
      },
      2,
    ],
    [
      "cool",
      {
        backgroundTop: "#04101c",
        backgroundBottom: "#02070c",
        palette: ["#2fb8ff", "#7affd9", "#6a5bff"],
        leaks: 4,
      },
      11,
    ],
    [
      "polaroid",
      {
        backgroundTop: "#f3ead8",
        backgroundBottom: "#e2d6bf",
        palette: ["#ff7a3d", "#ffd36b"],
        leaks: 3,
        intensity: 60,
        streaks: false,
      },
      5,
    ],
    [
      "burn",
      {
        backgroundTop: "#140404",
        backgroundBottom: "#000000",
        palette: ["#ff2a00", "#ff8c00", "#ffe066"],
        leaks: 6,
        intensity: 100,
      },
      9,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const next: Params = {
      ...current,
      backgroundTop: oklchToHex({ l: 0.16, c: 0.04, h: hue }),
      backgroundBottom: oklchToHex({ l: 0.08, c: 0.02, h: hue }),
      palette: huePalette(rng, rng.int(2, 3), { l: [0.72, 0.85], c: [0.14, 0.2] }, 50),
      leaks: rng.int(2, 6),
      intensity: rng.int(55, 95),
      streaks: rng.bool(0.6),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const long = Math.max(w, h);
      const k = p.intensity / 100;
      // Light film stock: leaks darken and tint (multiply); dark stock: they glow (screen).
      const blend = luminance(p.backgroundBottom) > 0.5 ? "multiply" : "screen";
      const defs: string[] = [
        `<linearGradient id="ll-bg" x1="0" y1="0" x2="0" y2="1">${stops([p.backgroundTop, p.backgroundBottom])}</linearGradient>`,
        `<radialGradient id="ll-vig"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${luminance(p.backgroundBottom) > 0.5 ? 0.15 : 0.45}"/></radialGradient>`,
      ];
      const body: string[] = [`<rect width="${w}" height="${h}" fill="url(#ll-bg)"/>`];
      p.palette.forEach((c, i) => {
        defs.push(
          `<radialGradient id="ll-${i}"><stop offset="0" stop-color="${c}" stop-opacity="${n(0.95 * k)}"/>` +
            `<stop offset="0.4" stop-color="${c}" stop-opacity="${n(0.5 * k)}"/>` +
            `<stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`,
        );
      });
      for (let i = 0; i < p.leaks; i++) {
        // Leaks enter from an edge: pick a side and sit just outside it.
        const side = rng.int(0, 3);
        const along = rng.float(0.1, 0.9);
        const [x, y] =
          side === 0
            ? [along * w, -long * 0.05]
            : side === 1
              ? [w + long * 0.05, along * h]
              : side === 2
                ? [along * w, h + long * 0.05]
                : [-long * 0.05, along * h];
        const rx = long * rng.float(0.35, 0.7);
        const ry = rx * rng.float(0.35, 0.8);
        const angle = rng.float(0, 180);
        body.push(
          `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" transform="rotate(${n(angle)} ${n(x)} ${n(y)})" fill="url(#ll-${i % p.palette.length})" style="mix-blend-mode:${blend}"/>`,
        );
      }
      if (p.streaks) {
        const count = rng.int(2, 4);
        const angle = rng.float(-35, 35);
        for (let i = 0; i < count; i++) {
          const x = rng.float(0.1, 0.9) * w;
          const y = rng.float(0.1, 0.9) * h;
          body.push(
            `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(long * rng.float(0.4, 0.8))}" ry="${n(long * rng.float(0.01, 0.035))}" transform="rotate(${n(angle + 90)} ${n(x)} ${n(y)})" fill="url(#ll-${i % p.palette.length})" opacity="0.7" style="mix-blend-mode:${blend}"/>`,
          );
        }
      }
      body.push(`<rect width="${w}" height="${h}" fill="url(#ll-vig)"/>`);
      return `${svgOpen(w, h)}<defs>${defs.join("")}</defs>${body.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
