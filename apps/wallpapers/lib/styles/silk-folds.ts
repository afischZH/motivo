import { hexToRgb, oklchToHex, pngDataUri } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientAt, n, presetsFor, svgOpen } from "./shared";

/**
 * Silk folds: draped satin. A height field of a few curved waves is lit
 * like a surface (diffuse plus a soft satin sheen) into a small raster that
 * the SVG scales up smoothly. The field has no sharp detail, so upscaling
 * stays clean at 6K, and the image stays small (uncompressed PNG).
 */
const ID = "silk-folds";

const schema = z.object({
  shadow: colorSchema,
  color: colorSchema,
  highlight: colorSchema,
  /** Direction of the folds, degrees. */
  angle: z.number().min(0).max(180),
  /** Number of folds across the short edge. */
  folds: z.number().min(1).max(10),
  /** Depth of the folds 0 to 100. */
  depth: z.number().min(5).max(100),
  /** Satin sheen 0 to 100. */
  sheen: z.number().min(0).max(100),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  shadow: "#2a0f1f",
  color: "#9c2d55",
  highlight: "#ffd1dc",
  angle: 62,
  folds: 3,
  depth: 60,
  sheen: 60,
};

/** Longest raster edge; the field is smooth, so the SVG scales it up cleanly. */
const FIELD_EDGE = 420;

/** Light direction (from upper left, towards the viewer), normalised. */
const L = (() => {
  const v = [-0.45, -0.55, 0.7];
  const len = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return v.map((c) => c / len) as [number, number, number];
})();
/** Half vector between the light and a viewer straight above. */
const H = (() => {
  const v = [L[0], L[1], L[2] + 1];
  const len = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return v.map((c) => c / len) as [number, number, number];
})();

export const silkFoldsTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["rose", {}, 3],
    [
      "champagne",
      { shadow: "#3b2a14", color: "#c9a46a", highlight: "#fff4dc", angle: 120, folds: 3 },
      7,
    ],
    [
      "emerald",
      {
        shadow: "#021a12",
        color: "#0e6b4a",
        highlight: "#9ff0c8",
        angle: 40,
        folds: 3.5,
        depth: 70,
      },
      5,
    ],
    [
      "midnight",
      { shadow: "#03040c", color: "#1b2a6b", highlight: "#9fb4ff", angle: 150, sheen: 80 },
      11,
    ],
    [
      "pearl",
      { shadow: "#9a9aa6", color: "#e4e2ea", highlight: "#ffffff", angle: 80, folds: 3, depth: 45 },
      2,
    ],
    [
      "ink",
      { shadow: "#000000", color: "#1c1c1f", highlight: "#8a8a92", angle: 20, folds: 4, sheen: 85 },
      9,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const light = rng.bool(0.25);
    const next: Params = {
      ...current,
      shadow: oklchToHex({ l: light ? 0.55 : 0.12, c: 0.05, h: hue }),
      color: oklchToHex({
        l: light ? 0.88 : rng.float(0.42, 0.6),
        c: rng.float(0.06, 0.16),
        h: hue,
      }),
      highlight: oklchToHex({ l: 0.95, c: 0.05, h: (hue + 20) % 360 }),
      angle: rng.int(0, 180),
      folds: rng.float(1.8, 4.5),
      depth: rng.int(35, 85),
      sheen: rng.int(30, 90),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const scale = FIELD_EDGE / Math.max(w, h);
      const cols = Math.max(8, Math.round(w * scale));
      const rows = Math.max(8, Math.round(h * scale));
      // Fold size follows the area, so tall phones get a few broad folds, not many stripes.
      const short = Math.sqrt(cols * rows);

      // Broad folds along one direction, bent by slow waves across it, plus a
      // weaker set at an angle so the drape does not look combed.
      const base = (p.angle * Math.PI) / 180;
      const k = (p.folds * Math.PI * 2) / short;
      const waves = [
        { turn: 0, f: 1, amp: 1 },
        { turn: rng.float(-0.25, 0.25), f: 1.8, amp: 0.22 },
        { turn: rng.float(0.7, 1.1), f: 0.55, amp: 0.55 },
      ].map((wave) => ({
        ...wave,
        ca: Math.cos(base + wave.turn),
        sa: Math.sin(base + wave.turn),
        f: k * wave.f,
        phase: rng.float(0, Math.PI * 2),
        bend: rng.float(1.2, 2.6),
        bendF: (rng.float(0.35, 0.9) * Math.PI * 2) / short,
        bendPhase: rng.float(0, Math.PI * 2),
      }));
      const height = (x: number, y: number): number => {
        let v = 0;
        for (const wv of waves) {
          const t = -x * wv.sa + y * wv.ca;
          const s = x * wv.ca + y * wv.sa;
          v +=
            wv.amp *
            Math.sin(s * wv.f + wv.phase + wv.bend * Math.sin(t * wv.bendF + wv.bendPhase));
        }
        return v;
      };

      // Colour ramp shadow > colour > highlight, sampled once.
      const ramp = Array.from({ length: 256 }, (_, i) =>
        hexToRgb(gradientAt([p.shadow, p.color, p.highlight], i / 255)),
      );
      const hi = hexToRgb(p.highlight);
      const strength = ((p.depth / 100) * 0.75) / k;
      const sheen = p.sheen / 100;
      const data = new Uint8ClampedArray(cols * rows * 4);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const dx = (height(x + 0.5, y) - height(x - 0.5, y)) * strength;
          const dy = (height(x, y + 0.5) - height(x, y - 0.5)) * strength;
          const len = Math.hypot(dx, dy, 1);
          const nx = -dx / len;
          const ny = -dy / len;
          const nz = 1 / len;
          const diffuse = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          const spec = Math.pow(Math.max(0, nx * H[0] + ny * H[1] + nz * H[2]), 24) * sheen;
          const c =
            ramp[Math.min(255, Math.max(0, Math.round((0.56 + (diffuse - L[2]) * 1.05) * 255)))] ??
            hi;
          const i = (y * cols + x) * 4;
          data[i] = (c.r + (hi.r - c.r) * spec) * 255;
          data[i + 1] = (c.g + (hi.g - c.g) * spec) * 255;
          data[i + 2] = (c.b + (hi.b - c.b) * spec) * 255;
          data[i + 3] = 255;
        }
      }
      const href = pngDataUri({ width: cols, height: rows, data }, "rgb");
      return (
        `${svgOpen(w, h)}<rect width="${w}" height="${h}" fill="${p.color}"/>` +
        `<image width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" href="${href}"/></svg>`
      );
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
