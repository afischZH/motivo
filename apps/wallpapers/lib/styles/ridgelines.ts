import { colorSchema, defineTool, keepLocked, paletteSchema } from "@musterli/tool-registry";
import * as z from "zod";

import { gradientAt, huePalette, n, presetsFor, svgOpen } from "./shared";

/**
 * Ridgelines: stacked line plots with sharp peaks in the middle, each line
 * hiding the ones behind it, like a radio signal chart on an album cover.
 * Peaks are seeded sums of narrow bumps, strongest near the centre.
 */
const ID = "ridgelines";

const schema = z.object({
  background: colorSchema,
  /** Line colours from the back to the front. */
  palette: paletteSchema,
  lines: z.int().min(10).max(120),
  /** Peak height, percent. */
  height: z.number().min(5).max(100),
  /** Width of the peak zone, percent of the screen. */
  spread: z.number().min(20).max(100),
  /** Line weight in design pixels. */
  weight: z.number().min(0.5).max(6),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  background: "#000000",
  palette: ["#ffffff", "#ffffff"],
  lines: 50,
  height: 55,
  spread: 60,
  weight: 1.4,
};

export const ridgelinesTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["pulsar", { palette: ["#ffffff", "#ffffff"] }, 3],
    ["sunset", { palette: ["#ffd166", "#ef476f", "#7b2cbf"], background: "#10002b", lines: 40 }, 8],
    [
      "paper",
      { palette: ["#1b1b1b", "#1b1b1b"], background: "#f2efe9", lines: 60, weight: 1.1 },
      5,
    ],
    [
      "aqua",
      { palette: ["#80ffdb", "#48bfe3", "#5390d9"], background: "#03045e", height: 75, spread: 70 },
      12,
    ],
    [
      "dense",
      {
        palette: ["#e0e0e0", "#9e9e9e"],
        background: "#121212",
        lines: 100,
        height: 40,
        weight: 0.8,
      },
      2,
    ],
    [
      "bold",
      { palette: ["#ff006e", "#ffbe0b"], background: "#1a1a1a", lines: 24, height: 90, weight: 3 },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const dark = rng.bool(0.7);
    const next: Params = {
      ...current,
      background: dark ? "#0a0a0f" : "#f3efe8",
      palette: huePalette(
        rng,
        rng.int(2, 3),
        { l: dark ? [0.9, 0.65] : [0.3, 0.5], c: [0, 0.2] },
        60,
      ),
      lines: rng.int(30, 80),
      height: rng.int(35, 85),
      spread: rng.int(35, 80),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { rng, width: w, height: h }) {
      const portrait = h > w;
      // Leave the top of a phone free for the clock.
      const top = h * (portrait ? 0.32 : 0.14);
      const bottom = h * 0.92;
      const gap = (bottom - top) / p.lines;
      const amp = gap * 9 * (p.height / 100);
      const margin = w * 0.08;
      const zone = ((w - margin * 2) * p.spread) / 100;
      const samples = 140;
      const parts = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      parts.push(`<g stroke-width="${n(p.weight)}" stroke-linejoin="round">`);
      for (let l = 0; l < p.lines; l++) {
        const base = top + gap * (l + 1);
        const bumps = Array.from({ length: rng.int(3, 7) }, () => ({
          x: w / 2 + rng.gaussian(0, zone / 5),
          s: zone * rng.float(0.02, 0.08),
          a: rng.float(0.2, 1),
        }));
        const pts: string[] = [];
        for (let i = 0; i <= samples; i++) {
          const x = margin + ((w - margin * 2) * i) / samples;
          let y = 0;
          for (const b of bumps) y += b.a * Math.exp(-(((x - b.x) / b.s) ** 2));
          // Small noise everywhere, peaks only inside the zone.
          const edge = Math.exp(-(((x - w / 2) / (zone / 1.6)) ** 4));
          const noise = (rng.next() - 0.5) * 0.04;
          pts.push(`${n(x)} ${n(base - amp * Math.min(1.25, y) * edge - amp * noise)}`);
        }
        const color = gradientAt(p.palette, p.lines === 1 ? 0 : l / (p.lines - 1));
        parts.push(
          `<path d="M${pts.join("L")}L${n(w - margin)} ${n(base + gap)}L${n(margin)} ${n(base + gap)}Z" fill="${p.background}" stroke="none"/>`,
          `<path d="M${pts.join("L")}" fill="none" stroke="${color}"/>`,
        );
      }
      parts.push("</g>");
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
