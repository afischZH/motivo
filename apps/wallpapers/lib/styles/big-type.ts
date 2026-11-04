import { oklchToHex } from "@musterli/engine";
import { colorSchema, defineTool, keepLocked } from "@musterli/tool-registry";
import * as z from "zod";

import { n, presetsFor, svgOpen } from "./shared";

/**
 * Big type: one huge word, number or initial as the whole motif. Text is
 * stretched to an exact width with `textLength`, so it fills the screen
 * the same way whatever system font draws it. Layouts: one giant word,
 * a stack of repeats alternating fill and outline, or a word turned on
 * its side.
 */
const ID = "big-type";
const LAYOUTS = ["giant", "stack", "side"] as const;
const FONTS = ["sans", "serif", "mono"] as const;

const FAMILY: Record<(typeof FONTS)[number], string> = {
  sans: "Helvetica Neue, Helvetica, Arial, system-ui, sans-serif",
  serif: "Georgia, Times New Roman, serif",
  mono: "SFMono-Regular, Menlo, Consolas, monospace",
};

const schema = z.object({
  text: z.string().min(1).max(16),
  background: colorSchema,
  ink: colorSchema,
  accent: colorSchema,
  layout: z.enum(LAYOUTS),
  font: z.enum(FONTS),
});

type Params = z.output<typeof schema>;

const defaults: Params = {
  text: "2026",
  background: "#111111",
  ink: "#f2f0e9",
  accent: "#ff4d00",
  layout: "giant",
  font: "sans",
};

const escapeXml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

export const bigTypeTool = defineTool({
  id: ID,
  version: 1,
  category: ["backgrounds"],
  schema,
  defaults,
  presets: presetsFor(ID, defaults, [
    ["year", {}, 1],
    [
      "hello",
      { text: "HELLO", background: "#ff4d00", ink: "#111111", accent: "#ffffff", layout: "stack" },
      2,
    ],
    [
      "calm",
      { text: "calm", background: "#e9e4d8", ink: "#2f3b2f", accent: "#b5543a", font: "serif" },
      3,
    ],
    [
      "focus",
      { text: "FOCUS", background: "#0047ff", ink: "#ffffff", accent: "#ffe600", layout: "side" },
      4,
    ],
    [
      "code",
      {
        text: "<dev/>",
        background: "#0d1117",
        ink: "#39d353",
        accent: "#58a6ff",
        font: "mono",
        layout: "stack",
      },
      5,
    ],
    [
      "initial",
      { text: "A", background: "#f6d6d6", ink: "#3a1c32", accent: "#ff7a90", font: "serif" },
      6,
    ],
  ]),
  randomize(rng, current, locks) {
    const hue = rng.float(0, 360);
    const dark = rng.bool(0.5);
    const next: Params = {
      ...current,
      background: oklchToHex({ l: dark ? 0.15 : 0.92, c: rng.float(0.01, 0.12), h: hue }),
      ink: oklchToHex({ l: dark ? 0.94 : 0.2, c: 0.02, h: hue }),
      accent: oklchToHex({ l: 0.68, c: 0.2, h: (hue + 150) % 360 }),
      layout: rng.pick(LAYOUTS),
      font: rng.pick(FONTS),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width: w, height: h }) {
      const text = escapeXml(p.text);
      const chars = Math.max(1, [...p.text].length);
      const family = `font-family="${FAMILY[p.font]}" font-weight="${p.font === "serif" ? 700 : 900}"`;
      const parts: string[] = [`<rect width="${w}" height="${h}" fill="${p.background}"/>`];
      const fit = `lengthAdjust="spacingAndGlyphs"`;
      if (p.layout === "giant") {
        const width = w * 0.92;
        const size = Math.min(h * 0.62, (width / chars) * 1.7);
        // Sits low on phones so the clock stays clear.
        const base = h > w ? h * 0.82 : h * 0.62 + size * 0.35;
        parts.push(
          `<text x="${n(w * 0.04)}" y="${n(base)}" font-size="${n(size)}" ${family} textLength="${n(width)}" ${fit} fill="${p.ink}">${text}</text>`,
          `<rect x="${n(w * 0.04)}" y="${n(base + size * 0.08)}" width="${n(width * 0.22)}" height="${n(Math.max(2, size * 0.05))}" fill="${p.accent}"/>`,
        );
      } else if (p.layout === "stack") {
        const width = w * 1.1;
        const size = Math.min(h / 5, (width / chars) * 1.5);
        const rows = Math.ceil(h / (size * 0.86)) + 1;
        for (let i = 0; i < rows; i++) {
          const y = size * 0.8 + i * size * 0.86;
          const solid = i % 3 === 1;
          const style = solid
            ? `fill="${i % 6 === 4 ? p.accent : p.ink}"`
            : `fill="none" stroke="${p.ink}" stroke-width="${n(Math.max(1, size * 0.018))}"`;
          parts.push(
            `<text x="${n(-w * 0.05 - (i % 2) * size * 0.3)}" y="${n(y)}" font-size="${n(size)}" ${family} textLength="${n(width)}" ${fit} ${style}>${text}</text>`,
          );
        }
      } else {
        const length = h * 0.9;
        const size = Math.min(w * 0.8, (length / chars) * 1.6);
        const x = w * 0.5 + size * 0.35;
        parts.push(
          `<text x="${n(h * 0.05)}" y="0" transform="translate(${n(x)} 0) rotate(90)" font-size="${n(size)}" ${family} textLength="${n(length)}" ${fit} fill="${p.ink}">${text}</text>`,
          `<circle cx="${n(w * 0.18)}" cy="${n(h * 0.88)}" r="${n(Math.min(w, h) * 0.05)}" fill="${p.accent}"/>`,
        );
      }
      return `${svgOpen(w, h)}${parts.join("")}</svg>`;
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
});
