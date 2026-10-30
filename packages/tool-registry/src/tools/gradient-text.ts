/**
 * W3: Gradient text (docs/TOOLS.md M8). A headline with a gradient fill:
 * the image comes from the SVG, the web version is CSS with
 * `background-clip: text` (plain, Tailwind classes, and with an optional
 * sliding shine).
 */
import {
  AVATAR_FONTS,
  GRADIENT_TEXT_MAX,
  formatNumber,
  gradientTextBackground,
  gradientTextSvg,
  oklchToHex,
  type Rng,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "gradient-text";

const schema = z.object({
  text: z.string().max(GRADIENT_TEXT_MAX),
  font: z.enum(AVATAR_FONTS),
  fontWeight: z.int().min(100).max(900),
  italic: z.boolean(),
  /** Letter spacing in hundredths of an em. */
  letterSpacing: z.number().min(-10).max(30),
  /** Largest font size in px. */
  size: z.number().min(16).max(400),
  palette: paletteSchema,
  angle: z.number().min(0).max(360),
  /** Sliding shine (CSS animation, GIF over time). */
  shine: z.boolean(),
  /** Duration of one shine loop in seconds (CSS only). */
  speed: z.number().min(1).max(20),
  background: colorSchema,
});

export type GradientTextParams = z.output<typeof schema>;

const defaults: GradientTextParams = {
  text: "Make it shine",
  font: "sans",
  fontWeight: 800,
  italic: false,
  letterSpacing: -2,
  size: 160,
  palette: ["#6366f1", "#ec4899", "#f59e0b"],
  angle: 90,
  shine: true,
  speed: 4,
  background: "#0b0b12",
};

const preset = (id: string, params: Partial<GradientTextParams>): Preset<GradientTextParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Vivid colours a step apart on the hue wheel, readable on dark and light grounds. */
function textPalette(rng: Rng, count: number): string[] {
  const start = rng.float(0, 360);
  const step = rng.float(30, 80);
  return Array.from({ length: count }, (_, i) =>
    oklchToHex({ l: rng.float(0.62, 0.78), c: 0.2, h: (start + i * step) % 360 }),
  );
}

const css = (p: GradientTextParams, selector: string): string => {
  const shine = p.shine
    ? `  background-size: 200% 100%;\n  animation: ${selector.slice(1)}-shine ${formatNumber(p.speed, 1)}s linear infinite;\n`
    : "";
  const rule =
    `${selector} {\n` +
    `  background-image: ${gradientTextBackground(p.palette, p.angle, p.shine)};\n` +
    shine +
    `  -webkit-background-clip: text;\n` +
    `  background-clip: text;\n` +
    `  color: transparent;\n` +
    `}\n`;
  if (!p.shine) return rule;
  return (
    rule +
    `\n@keyframes ${selector.slice(1)}-shine {\n  to {\n    background-position: -200% 0;\n  }\n}\n` +
    `\n@media (prefers-reduced-motion: reduce) {\n  ${selector} {\n    animation: none;\n  }\n}\n`
  );
};

function tailwindClasses(p: GradientTextParams): string {
  const value = gradientTextBackground(p.palette, p.angle, false).replace(/ /g, "_");
  return `bg-[${value}] bg-clip-text text-transparent\n`;
}

export const gradientTextTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 600 },
  contentParams: ["text"],
  presets: [
    preset("sunset", {}),
    preset("ocean", {
      text: "Deep blue",
      palette: ["#22d3ee", "#3b82f6", "#8b5cf6"],
      angle: 135,
      shine: false,
      background: "#020617",
    }),
    preset("mint", {
      text: "Fresh start",
      font: "rounded",
      fontWeight: 700,
      palette: ["#10b981", "#84cc16"],
      background: "#f0fdf4",
      letterSpacing: 0,
      shine: false,
    }),
    preset("gold", {
      text: "Premium",
      font: "serif",
      fontWeight: 700,
      italic: true,
      letterSpacing: 2,
      palette: ["#a16207", "#facc15", "#fef3c7", "#ca8a04"],
      angle: 100,
      shine: true,
      background: "#1c1917",
    }),
    preset("neon", {
      text: "Night shift",
      fontWeight: 900,
      palette: ["#f0abfc", "#22d3ee", "#a3e635"],
      shine: true,
      speed: 3,
      background: "#09090b",
    }),
    preset("ink", {
      text: "Editorial",
      font: "serif",
      fontWeight: 600,
      letterSpacing: -1,
      palette: ["#111827", "#6b21a8"],
      angle: 180,
      shine: false,
      background: "#fafaf9",
    }),
    preset("code", {
      text: "npm run dev",
      font: "mono",
      fontWeight: 700,
      letterSpacing: 0,
      palette: ["#4ade80", "#22d3ee"],
      background: "#0a0a0a",
    }),
    preset("candy", {
      text: "Sweet deal",
      font: "rounded",
      fontWeight: 800,
      palette: ["#f472b6", "#fb923c", "#facc15"],
      angle: 45,
      background: "#fff7ed",
    }),
  ],
  controls: {
    groups: [
      { id: "text", labelKey: `tools.${ID}.groups.text` },
      { id: "gradient", labelKey: `tools.${ID}.groups.gradient` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "text",
      "font",
      "fontWeight",
      "italic",
      "letterSpacing",
      "size",
      "palette",
      "angle",
      "shine",
      "speed",
      "background",
    ],
    params: {
      text: { group: "text", kind: "text", lockable: false },
      font: {
        group: "text",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "font", AVATAR_FONTS),
      },
      fontWeight: { group: "text", step: 100 },
      italic: { group: "text" },
      letterSpacing: { group: "text", step: 0.5, unit: "%" },
      size: { group: "text", step: 1, unit: "px" },
      palette: { group: "gradient", labelKey: COMMON_LABELS.palette },
      angle: { group: "gradient", step: 1, unit: "°" },
      shine: { group: "gradient" },
      speed: { group: "gradient", step: 0.5, unit: "s", visibleWhen: (p) => p.shine },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    // New colours and direction; the text and its type stay.
    const next: GradientTextParams = {
      ...current,
      palette: textPalette(rng, rng.int(2, 4)),
      angle: rng.pick([45, 90, 90, 135, 180]),
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "svg",
    render(p, { width, height, t }) {
      return gradientTextSvg({
        width,
        height,
        text: p.text,
        font: p.font,
        fontWeight: p.fontWeight,
        italic: p.italic,
        letterSpacing: p.letterSpacing / 100,
        size: p.size,
        colors: p.palette,
        angle: p.angle,
        background: p.background,
        shine: p.shine,
        ...(t !== undefined ? { t } : {}),
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "css",
      labelKey: EXTRA_EXPORT_LABELS.css,
      language: "css",
      render: (p) => css(p, ".gradient-text"),
    },
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render: (p) => tailwindClasses(p),
    },
  ],
  animation: { sources: ["time", "colors"] },
});
