/**
 * W3: CSS easing (docs/TOOLS.md M9). A timing function as `cubic-bezier()`
 * or a spring as `linear()`, with copy-ready transition, animation and
 * Tailwind code. The preview plots the curve and moves a dot along a track;
 * the GIF over time plays that motion.
 */
import {
  EASING_KINDS,
  easingCss,
  easingSpecimenSvg,
  formatNumber,
  mixHex,
  toCssName,
  type EasingOptions,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, EXTRA_EXPORT_LABELS, optionLabels } from "./shared";

const ID = "css-easing";

/** x of the control points must stay in [0, 1] (CSS); y may overshoot. */
const controlX = z.number().min(0).max(1);
const controlY = z.number().min(-1).max(2);

const schema = z.object({
  kind: z.enum(EASING_KINDS),
  x1: controlX,
  y1: controlY,
  x2: controlX,
  y2: controlY,
  stiffness: z.number().min(10).max(1000),
  damping: z.number().min(1).max(100),
  /** Duration in ms for the code and the label. */
  duration: z.int().min(50).max(5000),
  /** Name of the CSS variable, sanitised with `toCssName`. */
  name: z.string().max(24),
  /** Where the dot stands in the still image, in percent of the duration. */
  progress: z.number().min(0).max(100),
  background: colorSchema,
  ink: colorSchema,
  accent: colorSchema,
});

export type CssEasingParams = z.output<typeof schema>;

const defaults: CssEasingParams = {
  kind: "bezier",
  x1: 0.22,
  y1: 1,
  x2: 0.36,
  y2: 1,
  stiffness: 170,
  damping: 18,
  duration: 400,
  name: "ease-out-quint",
  progress: 55,
  background: "#ffffff",
  ink: "#111827",
  accent: "#4f46e5",
};

const preset = (id: string, params: Partial<CssEasingParams>): Preset<CssEasingParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const optionsOf = (p: CssEasingParams): EasingOptions => p;

const varName = (p: CssEasingParams): string => toCssName(p.name, "ease");

function transitionCss(p: CssEasingParams): string {
  const name = varName(p);
  return (
    `:root {\n  --${name}: ${easingCss(optionsOf(p))};\n}\n\n` +
    `.button {\n  transition: transform ${p.duration}ms var(--${name});\n}\n\n` +
    `@media (prefers-reduced-motion: reduce) {\n  .button {\n    transition: none;\n  }\n}\n`
  );
}

function animationCss(p: CssEasingParams): string {
  const name = varName(p);
  return (
    `@keyframes slide-in {\n  from {\n    transform: translateY(1rem);\n    opacity: 0;\n  }\n}\n\n` +
    `.card {\n  animation: slide-in ${p.duration}ms ${easingCss(optionsOf(p))} both;\n}\n\n` +
    `@media (prefers-reduced-motion: reduce) {\n  .card {\n    animation: none;\n  }\n}\n` +
    `\n/* ${name} */\n`
  );
}

function tailwindTheme(p: CssEasingParams): string {
  // Tailwind v4 maps `--ease-*` theme variables to `ease-*` utilities.
  const name = varName(p).replace(/^ease-/, "");
  return (
    `@theme {\n  --ease-${name}: ${easingCss(optionsOf(p))};\n}\n\n` +
    `/* Usage: class="transition duration-${p.duration} ease-${name}" */\n`
  );
}

export const cssEasingTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-effects"],
  schema,
  defaults,
  defaultSize: { width: 1200, height: 800 },
  presets: [
    preset("smooth-out", {}),
    preset("ease-in-out", {
      x1: 0.65,
      y1: 0,
      x2: 0.35,
      y2: 1,
      name: "ease-in-out-cubic",
      accent: "#0ea5e9",
    }),
    preset("back-out", {
      x1: 0.34,
      y1: 1.56,
      x2: 0.64,
      y2: 1,
      name: "ease-out-back",
      accent: "#db2777",
    }),
    preset("snappy", {
      x1: 0.2,
      y1: 0,
      x2: 0,
      y2: 1,
      duration: 250,
      name: "ease-snappy",
      accent: "#16a34a",
    }),
    preset("anticipate", {
      x1: 0.68,
      y1: -0.6,
      x2: 0.32,
      y2: 1.6,
      duration: 600,
      name: "ease-in-out-back",
      background: "#0f172a",
      ink: "#f8fafc",
      accent: "#38bdf8",
    }),
    preset("spring", {
      kind: "spring",
      stiffness: 170,
      damping: 12,
      duration: 800,
      name: "spring-bouncy",
      background: "#fff7ed",
      ink: "#431407",
      accent: "#f97316",
    }),
    preset("gentle-spring", {
      kind: "spring",
      stiffness: 120,
      damping: 20,
      duration: 700,
      name: "spring-gentle",
      accent: "#7c3aed",
    }),
    preset("wobbly", {
      kind: "spring",
      stiffness: 300,
      damping: 8,
      duration: 1200,
      name: "spring-wobbly",
      background: "#111111",
      ink: "#e5e5e5",
      accent: "#a3e635",
    }),
  ],
  controls: {
    groups: [
      { id: "curve", labelKey: `tools.${ID}.groups.curve` },
      { id: "code", labelKey: `tools.${ID}.groups.code` },
      { id: "preview", labelKey: `tools.${ID}.groups.preview` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "kind",
      "x1",
      "y1",
      "x2",
      "y2",
      "stiffness",
      "damping",
      "duration",
      "name",
      "progress",
      "background",
      "ink",
      "accent",
    ],
    params: {
      kind: {
        group: "curve",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "kind", EASING_KINDS),
      },
      x1: { group: "curve", step: 0.01, visibleWhen: (p) => p.kind === "bezier" },
      y1: { group: "curve", step: 0.01, visibleWhen: (p) => p.kind === "bezier" },
      x2: { group: "curve", step: 0.01, visibleWhen: (p) => p.kind === "bezier" },
      y2: { group: "curve", step: 0.01, visibleWhen: (p) => p.kind === "bezier" },
      stiffness: { group: "curve", step: 1, visibleWhen: (p) => p.kind === "spring" },
      damping: { group: "curve", step: 0.5, visibleWhen: (p) => p.kind === "spring" },
      duration: { group: "code", step: 10, unit: "ms" },
      name: { group: "code", kind: "text", lockable: false },
      progress: { group: "preview", step: 1, unit: "%" },
      background: { group: "colors" },
      ink: { group: "colors" },
      accent: { group: "colors" },
    },
  },
  randomize(rng, current, locks) {
    // A new curve of the same kind; code settings and colours stay.
    const r = (lo: number, hi: number) => Number(formatNumber(rng.float(lo, hi), 2));
    const next: CssEasingParams = {
      ...current,
      x1: r(0, 1),
      y1: r(-0.5, 1.6),
      x2: r(0, 1),
      y2: r(-0.5, 1.6),
      stiffness: rng.int(80, 400),
      damping: rng.int(6, 30),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors, current) {
    return { accent: colors[0] ?? current.accent };
  },
  render: {
    kind: "svg",
    render(p, { width, height, t }) {
      // Frame 0 of the GIF is the still image; the loop starts from there.
      const time = (((p.progress / 100 + (t ?? 0)) % 1) + 1) % 1;
      return easingSpecimenSvg({
        easing: optionsOf(p),
        width,
        height,
        background: p.background,
        ink: p.ink,
        muted: mixHex(p.ink, p.background, 0.45, "oklab"),
        accent: p.accent,
        duration: p.duration,
        t: time,
      });
    },
  },
  exports: ["svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "css-transition",
      labelKey: EXTRA_EXPORT_LABELS.css,
      language: "css",
      render: (p) => transitionCss(p),
    },
    {
      id: "css-animation",
      labelKey: EXTRA_EXPORT_LABELS.cssAnimation,
      language: "css",
      render: (p) => animationCss(p),
    },
    {
      id: "tailwind-theme",
      labelKey: EXTRA_EXPORT_LABELS.tailwindTheme,
      language: "css",
      render: (p) => tailwindTheme(p),
    },
  ],
  animation: { sources: ["time"] },
});
