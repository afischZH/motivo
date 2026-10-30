/**
 * Code screenshot (docs/TOOLS.md M6). Code with syntax colours in an editor
 * window on a Musterli background (gradient, mesh, blurry gradient, solid
 * or transparent). Own highlighter in the engine, no library. Code and file
 * name travel in share links (`contentParams`).
 */
import {
  CODE_FRAMES,
  CODE_LANGUAGES,
  CODE_THEMES,
  blurryGradientSvg,
  codeScreenshotSvg,
  fillMarkup,
  meshGradientSvg,
  randomPalette,
  svgDocument,
  type CodeScreenshotOptions,
} from "@musterli/engine";
import * as z from "zod";
import { colorSchema, paletteSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset, RenderContext, ToolSizePreset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, optionLabels } from "./shared";

const ID = "code-screenshot";

/** Longest code; keeps share links usable. */
export const CODE_TEXT_MAX = 3000;

export const CODE_BACKDROPS = ["gradient", "mesh", "blurry", "solid", "none"] as const;
export type CodeBackdrop = (typeof CODE_BACKDROPS)[number];

const schema = z.object({
  code: z.string().max(CODE_TEXT_MAX),
  language: z.enum(CODE_LANGUAGES),
  title: z.string().max(60),
  theme: z.enum(CODE_THEMES),
  frame: z.enum(CODE_FRAMES),
  lineNumbers: z.boolean(),
  /** Highlighted lines, e.g. "2, 4-6". */
  highlight: z.string().max(40),
  /** Font size in px; the window shrinks when it would not fit. */
  fontSize: z.int().min(12).max(64),
  backdrop: z.enum(CODE_BACKDROPS),
  palette: paletteSchema,
  background: colorSchema,
  gradientAngle: z.int().min(0).max(359),
  padding: z.int().min(0).max(25),
  radius: z.int().min(0).max(32),
  shadow: z.int().min(0).max(100),
});

export type CodeScreenshotParams = z.output<typeof schema>;

const SAMPLE = `// Pick a fresh accent for every visit
function pickAccent(palette, seed = 7) {
  const index = seed % palette.length;
  return palette[index] ?? "#6366f1";
}

const accent = pickAccent(["#f97316", "#ec4899", "#8b5cf6"]);
document.body.style.setProperty("--accent", accent);`;

const defaults: CodeScreenshotParams = {
  code: SAMPLE,
  language: "javascript",
  title: "accent.js",
  theme: "midnight",
  frame: "window",
  lineNumbers: false,
  highlight: "",
  fontSize: 30,
  backdrop: "gradient",
  palette: ["#6366f1", "#ec4899"],
  background: "#0f172a",
  gradientAngle: 135,
  padding: 8,
  radius: 12,
  shadow: 60,
};

const preset = (
  id: string,
  params: Partial<CodeScreenshotParams>,
): Preset<CodeScreenshotParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

const size = (id: string, width: number, height: number): ToolSizePreset => ({
  id,
  width,
  height,
  nameKey: `tools.${ID}.sizes.${id}`,
});

function backdropSvg(p: CodeScreenshotParams, ctx: RenderContext): string {
  const { width, height, rng } = ctx;
  const [first = p.background, second = first] = p.palette;
  switch (p.backdrop) {
    case "none":
      return "";
    case "solid":
      return svgDocument(
        width,
        height,
        `<rect width="${width}" height="${height}" fill="${p.background}"/>`,
      );
    case "gradient": {
      const fill = fillMarkup(
        {
          fill: "gradient",
          base: first,
          second,
          ink: first,
          gradientAngle: p.gradientAngle,
          pattern: "polka",
          patternSize: 32,
          patternOpacity: 0,
        },
        0,
        0,
        width,
        height,
      );
      return svgDocument(
        width,
        height,
        `${fill.defs ? `<defs>${fill.defs}</defs>` : ""}${fill.body}`,
      );
    }
    case "mesh":
      return meshGradientSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        points: Math.min(6, p.palette.length + 2),
        blur: 0.85,
        warp: 0.4,
        rng,
      });
    case "blurry":
      return blurryGradientSvg({
        width,
        height,
        background: p.background,
        colors: p.palette,
        circles: Math.min(5, Math.max(3, p.palette.length + 1)),
        layout: "corners",
        size: 0.55,
        spread: 0.4,
        opacity: 0.9,
        blur: 0.8,
        rng,
      });
  }
}

const optionsOf = (p: CodeScreenshotParams, ctx: RenderContext): CodeScreenshotOptions => ({
  width: ctx.width,
  height: ctx.height,
  backdrop: backdropSvg(p, ctx),
  code: p.code,
  language: p.language,
  theme: p.theme,
  frame: p.frame,
  title: p.title,
  lineNumbers: p.lineNumbers,
  highlight: p.highlight,
  fontSize: p.fontSize,
  padding: p.padding,
  radius: p.radius,
  shadow: p.shadow,
});

const PYTHON = `def fibonacci(n: int) -> list[int]:
    """The first n Fibonacci numbers."""
    a, b = 0, 1
    out = []
    for _ in range(n):
        out.append(a)
        a, b = b, a + b
    return out

print(fibonacci(10))`;

const CSS = `.card {
  border-radius: 16px;
  background: linear-gradient(135deg, #6366f1, #ec4899);
  box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.35);
}

@media (prefers-reduced-motion: no-preference) {
  .card:hover { transform: translateY(-4px); }
}`;

const HTML = `<section class="hero">
  <h1>Ship it today</h1>
  <p>Patterns, gradients and code for your launch.</p>
  <a class="button" href="/start">Get started</a>
</section>`;

const TS = `type Theme = "light" | "dark";

export function nextTheme(current: Theme): Theme {
  return current === "light" ? "dark" : "light";
}`;

const BASH = `# Install and start the dev server
pnpm install
pnpm dev --port 3000`;

const JSON_SAMPLE = `{
  "name": "musterli",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build" }
}`;

export const codeScreenshotTool = defineTool({
  id: ID,
  version: 1,
  category: ["social"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 1000 },
  sizePresets: [
    size("landscape", 1600, 1000),
    size("social", 1200, 675),
    size("square", 1080, 1080),
    size("slide", 1920, 1080),
  ],
  contentParams: ["code", "title", "highlight"],
  presets: [
    preset("midnight", {}),
    preset("paper", {
      theme: "paper",
      palette: ["#e0f2fe", "#fce7f3"],
      gradientAngle: 120,
    }),
    preset("python", {
      code: PYTHON,
      language: "python",
      title: "fibonacci.py",
      theme: "ocean",
      backdrop: "mesh",
      palette: ["#0ea5e9", "#22d3ee", "#6366f1"],
      background: "#082f49",
      lineNumbers: true,
    }),
    preset("css", {
      code: CSS,
      language: "css",
      title: "card.css",
      theme: "dusk",
      palette: ["#f97316", "#facc15"],
      highlight: "3",
    }),
    preset("html", {
      code: HTML,
      language: "html",
      title: "index.html",
      theme: "forest",
      backdrop: "blurry",
      palette: ["#22c55e", "#14b8a6", "#a3e635"],
      background: "#052e16",
    }),
    preset("typescript", {
      code: TS,
      language: "typescript",
      title: "theme.ts",
      theme: "mono",
      backdrop: "solid",
      background: "#e4e4e7",
      lineNumbers: true,
    }),
    preset("terminal", {
      code: BASH,
      language: "bash",
      title: "Terminal",
      theme: "midnight",
      palette: ["#0f172a", "#334155"],
      gradientAngle: 180,
    }),
    preset("json", {
      code: JSON_SAMPLE,
      language: "json",
      title: "package.json",
      theme: "paper",
      backdrop: "solid",
      background: "#f1f5f9",
      shadow: 30,
    }),
    preset("bare", {
      backdrop: "none",
      padding: 2,
      shadow: 0,
    }),
  ],
  controls: {
    groups: [
      { id: "content", labelKey: `tools.${ID}.groups.content` },
      { id: "window", labelKey: `tools.${ID}.groups.window` },
      COMMON_GROUPS.colors,
    ],
    order: [
      "code",
      "language",
      "title",
      "highlight",
      "theme",
      "frame",
      "lineNumbers",
      "fontSize",
      "radius",
      "shadow",
      "padding",
      "backdrop",
      "palette",
      "background",
      "gradientAngle",
    ],
    params: {
      code: { group: "content", kind: "text", lockable: false, rows: 10, monospace: true },
      language: {
        group: "content",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "language", CODE_LANGUAGES),
      },
      title: { group: "content", kind: "text", lockable: false },
      highlight: {
        group: "content",
        kind: "text",
        lockable: false,
        descriptionKey: `tools.${ID}.params.highlight.description`,
      },
      theme: {
        group: "window",
        kind: "select",
        optionLabelKeys: optionLabels(ID, "theme", CODE_THEMES),
      },
      frame: {
        group: "window",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "frame", CODE_FRAMES),
      },
      lineNumbers: { group: "window" },
      fontSize: { group: "window", step: 1, unit: "px" },
      radius: { group: "window", step: 1, unit: "px" },
      shadow: { group: "window", step: 1, unit: "%" },
      padding: { group: "colors", step: 1, unit: "%" },
      backdrop: {
        group: "colors",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "backdrop", CODE_BACKDROPS),
      },
      palette: {
        group: "colors",
        labelKey: COMMON_LABELS.palette,
        visibleWhen: (p) =>
          p.backdrop === "gradient" || p.backdrop === "mesh" || p.backdrop === "blurry",
      },
      background: {
        group: "colors",
        labelKey: COMMON_LABELS.background,
        visibleWhen: (p) => p.backdrop !== "gradient" && p.backdrop !== "none",
      },
      gradientAngle: {
        group: "colors",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => p.backdrop === "gradient",
      },
    },
  },
  randomize(rng, current, locks) {
    // New theme and backdrop colours; code, language and layout stay.
    const palette = randomPalette(rng, 3);
    const next: CodeScreenshotParams = {
      ...current,
      theme: rng.pick(CODE_THEMES),
      backdrop: rng.pick(["gradient", "gradient", "mesh", "blurry"] as const),
      palette,
      gradientAngle: rng.pick([45, 90, 135, 180, 225]),
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    return colors.length >= 2 ? { palette: colors.slice(0, 3) } : {};
  },
  render: {
    kind: "svg",
    render: (p, ctx) => codeScreenshotSvg(optionsOf(p, ctx)),
  },
  exports: ["png", "jpg", "webp", "svg"],
});
