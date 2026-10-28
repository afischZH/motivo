/**
 * M4b-AP04: Screenshot beautifier (docs/TOOLS.md K6). The user's screenshot
 * (PNG, JPG, WebP or sanitised SVG; local only) on a background, with
 * padding, rounded corners, a layered soft shadow, an optional border and
 * a self-drawn window or browser bar. Without upload a self-drawn
 * placeholder stands in, so presets, thumbnails and snapshots work.
 *
 * Backgrounds: a solid colour, a linear gradient (CSS gradient engine) or
 * a preset of another Musterli background tool, rendered through that
 * tool's own `render` with this design's seed and size (one render path,
 * the same picture the tool itself would draw). The picker lists the
 * presets of `BACKDROP_TOOLS` grouped by tool, so new presets of those
 * tools appear here without code.
 */
import {
  SCREENSHOT_ALIGNS,
  SCREENSHOT_FRAMES,
  SCREENSHOT_PADDING_MAX,
  SCREENSHOT_THEMES,
  SCREENSHOT_URL_MAX,
  cssGradient,
  formatNumber,
  randomPalette,
  screenshotScene,
  type ScreenshotScene,
  type ScreenshotImage,
} from "@musterli/engine";
import * as z from "zod";
import {
  HEX_COLOR_PATTERN,
  PALETTE_MAX,
  PALETTE_MIN,
  SCREENSHOT_ASSET_RASTER_MAX_EDGE,
  colorSchema,
  paletteSchema,
  screenshotAssetSchema,
} from "../common";
import { fitPalette, mapBrandPalette } from "../brand-palette";
import { keepLocked, parseToolParams } from "../randomize";
import { defineTool } from "../registry";
import { createRenderContext } from "../render";
import { imageAssetHref } from "../svg-asset";
import type { AnyToolDefinition, CssOutput, OptionGroup, Preset, ToolSizePreset } from "../types";
import { blobCompositionTool } from "./blob-composition";
import { blurryGradientTool } from "./blurry-gradient";
import { gridPatternsTool } from "./grid-patterns";
import { meshGradientTool } from "./mesh-gradient";
import { optionLabels } from "./shared";
import { starrySkyTool } from "./starry-sky";
import { stripedGradientTool } from "./striped-gradient";
import { svgWavesTool } from "./svg-waves";

const ID = "screenshot-beautifier";

export const SCREENSHOT_BACKGROUND_TYPES = ["solid", "gradient", "musterli"] as const;
export const SCREENSHOT_BACKDROP_COLORS = ["preset", "palette"] as const;

/**
 * Background tools whose presets the picker offers. Each renders SVG from
 * params plus the render context alone (no uploads, no image input).
 */
export const BACKDROP_TOOLS: readonly AnyToolDefinition[] = [
  meshGradientTool,
  blurryGradientTool,
  stripedGradientTool,
  svgWavesTool,
  blobCompositionTool,
  starrySkyTool,
  gridPatternsTool,
];

interface Backdrop {
  readonly id: string;
  readonly tool: AnyToolDefinition;
  readonly preset: Preset<unknown>;
}

/** Every backdrop as `<tool id>/<preset id>` (stable: preset ids never change). */
export const BACKDROPS: readonly Backdrop[] = BACKDROP_TOOLS.flatMap((tool) =>
  tool.presets.map((preset) => ({ id: `${tool.id}/${preset.id}`, tool, preset })),
);

const BACKDROP_IDS = BACKDROPS.map((b) => b.id) as [string, ...string[]];
const BACKDROP_BY_ID = new Map(BACKDROPS.map((b) => [b.id, b]));

/** Text of the address bar until the user types their own. */
export const SCREENSHOT_DEFAULT_URL = "musterli.app";
/** Accent of the placeholder screenshot. */
const PLACEHOLDER_ACCENT = "#6366f1";

const schema = z.object({
  /** The user's screenshot; `null` = the placeholder. Local only. */
  screenshot: screenshotAssetSchema.nullable(),
  align: z.enum(SCREENSHOT_ALIGNS),
  /** Space around the window in percent of the shorter canvas edge. */
  padding: z.number().min(0).max(SCREENSHOT_PADDING_MAX),
  frame: z.enum(SCREENSHOT_FRAMES),
  theme: z.enum(SCREENSHOT_THEMES),
  /** Address (browser bar) or title (window bar). Local only. */
  url: z.string().max(SCREENSHOT_URL_MAX),
  radius: z.int().min(0).max(64),
  shadow: z.int().min(0).max(100),
  shadowColor: colorSchema,
  border: z.int().min(0).max(32),
  borderColor: colorSchema,
  borderOpacity: z.int().min(0).max(100),
  highlight: z.boolean(),
  backgroundType: z.enum(SCREENSHOT_BACKGROUND_TYPES),
  backdrop: z.enum(BACKDROP_IDS),
  backdropColors: z.enum(SCREENSHOT_BACKDROP_COLORS),
  palette: paletteSchema,
  gradientAngle: z.number().min(0).max(360),
  backgroundColor: colorSchema,
});

export type ScreenshotBeautifierParams = z.output<typeof schema>;

const defaults: ScreenshotBeautifierParams = {
  screenshot: null,
  align: "center",
  padding: 9,
  frame: "browser",
  theme: "dark",
  url: SCREENSHOT_DEFAULT_URL,
  radius: 14,
  shadow: 60,
  shadowColor: "#0b1020",
  border: 0,
  borderColor: "#ffffff",
  borderOpacity: 30,
  highlight: true,
  backgroundType: "musterli",
  backdrop: "mesh-gradient/nebula",
  backdropColors: "preset",
  palette: ["#1e1b4b", "#7c3aed", "#ec4899", "#38bdf8"],
  gradientAngle: 135,
  backgroundColor: "#eef2f7",
};

const preset = (
  id: string,
  params: Partial<ScreenshotBeautifierParams>,
): Preset<ScreenshotBeautifierParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/** Output sizes for launch pages, docs and social posts (public platform sizes). */
const SIZE_PRESETS: readonly ToolSizePreset[] = [
  { id: "wide", width: 1600, height: 900, nameKey: `tools.${ID}.sizes.wide` },
  { id: "product-hunt", width: 1270, height: 760, nameKey: `tools.${ID}.sizes.product-hunt` },
  { id: "linkedin", width: 1200, height: 627, nameKey: `tools.${ID}.sizes.linkedin` },
  { id: "docs", width: 1920, height: 1200, nameKey: `tools.${ID}.sizes.docs` },
];

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------

const isHex = (v: unknown): v is string => typeof v === "string" && HEX_COLOR_PATTERN.test(v);

/**
 * Params of a backdrop preset in this design's palette: the first colour
 * becomes the backdrop tool's background (when it has an opaque one), the
 * rest go through the generic brand palette mapping. Falls back to the
 * preset's own colours when the result does not pass that tool's schema.
 */
export function backdropParams(
  backdrop: Backdrop,
  palette: readonly string[] | null,
): Record<string, unknown> {
  const base = backdrop.preset.params as Record<string, unknown>;
  if (!palette) return base;
  const hasBackground = isHex(base.background);
  const colors = hasBackground && palette.length > PALETTE_MIN ? palette.slice(1) : palette;
  const mapped = mapBrandPalette(backdrop.tool, base, colors);
  if (hasBackground) mapped.background = palette[0];
  const parsed = parseToolParams(backdrop.tool, mapped);
  return parsed.success ? (parsed.data as Record<string, unknown>) : base;
}

/** Recent backdrop renders (dragging a slider must not re-render a mesh each frame). */
const backdropCache = new Map<string, string>();
const BACKDROP_CACHE_ENTRIES = 12;

/** SVG of a backdrop through its tool's own render path. Pure (the cache is keyed by every input). */
export function backdropSvg(
  backdrop: Backdrop,
  palette: readonly string[] | null,
  seed: number,
  width: number,
  height: number,
): string {
  const key = `${backdrop.id}|${palette ? palette.join(",") : "-"}|${seed}|${width}x${height}`;
  const hit = backdropCache.get(key);
  if (hit !== undefined) {
    backdropCache.delete(key);
    backdropCache.set(key, hit);
    return hit;
  }
  const renderer = backdrop.tool.render;
  if (renderer.kind !== "svg") return "";
  const svg = renderer.render(
    backdropParams(backdrop, palette) as never,
    createRenderContext(seed, { width, height }),
  );
  backdropCache.set(key, svg);
  if (backdropCache.size > BACKDROP_CACHE_ENTRIES) {
    const oldest = backdropCache.keys().next().value;
    if (oldest !== undefined) backdropCache.delete(oldest);
  }
  return svg;
}

const backdropOf = (p: ScreenshotBeautifierParams): Backdrop =>
  BACKDROP_BY_ID.get(p.backdrop) ?? (BACKDROPS[0] as Backdrop);

/** The background markup of a design: a rect or a nested `<svg>`. */
export function backgroundMarkup(
  p: ScreenshotBeautifierParams,
  seed: number,
  width: number,
  height: number,
): string {
  if (p.backgroundType === "solid") {
    return `<rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${p.backgroundColor}"/>`;
  }
  if (p.backgroundType === "gradient") {
    return cssGradient({
      type: "linear",
      colors: p.palette,
      angle: p.gradientAngle,
      centerX: 50,
      centerY: 50,
      shape: "ellipse",
      interpolation: "oklch",
      hue: "shorter",
      easing: "linear",
      steps: 0,
      loop: false,
      width,
      height,
    }).previewSvg;
  }
  return backdropSvg(
    backdropOf(p),
    p.backdropColors === "palette" ? p.palette : null,
    seed,
    width,
    height,
  );
}

/** The screenshot as an engine image; `undefined` for the placeholder or a rejected SVG. */
function screenshotImage(p: ScreenshotBeautifierParams): ScreenshotImage | undefined {
  const asset = p.screenshot;
  if (!asset) return undefined;
  const href = imageAssetHref(asset);
  if (!href || !(asset.width > 0 && asset.height > 0)) return undefined;
  return { href, width: asset.width, height: asset.height };
}

/** One-entry memo: a multi-megabyte data URI is checked once per picture, not per render. */
let lastHref = "";
let lastCssHref = "";
/** The picture's data URI for CSS `url("…")`; valid ones contain no quotes, backslashes or newlines. */
function cssHref(href: string): string {
  if (href !== lastHref) {
    lastHref = href;
    lastCssHref = /["\\\n\r]/.test(href) ? href.replace(/["\\\n\r]/g, "") : href;
  }
  return lastCssHref;
}

/**
 * Preview and exports. `previewSvg` is the finished picture: the exports
 * (PNG, JPG, WebP, SVG) and thumbnails elsewhere use it. The editor preview
 * shows the same scene in two layers: the stage (everything but the
 * picture) as a CSS background, and the picture as an element on top. The
 * browser decodes a multi-megabyte screenshot once for the element instead
 * of parsing a new SVG document around it on every change (about 150 ms for
 * a 4K screenshot in Chromium, M4b-AP04). Position, size, corner radius and
 * light edge match the SVG exactly; "preview == PNG" checks it in E2E.
 */
function sceneOutput(scene: ScreenshotScene, image: ScreenshotImage | undefined): CssOutput {
  const stage =
    `background-image: url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(scene.stageSvg)}");\n` +
    "background-size: 100% 100%;\nbackground-repeat: no-repeat;";
  const out: CssOutput = { css: stage, previewSvg: scene.svg };
  const layer = scene.picture;
  if (!layer || !image) return out;
  const { window: win, barHeight, radius, highlight, highlightOpacity } = layer;
  const n = (v: number) => formatNumber(v, 2);
  const decls = [
    `background-image: url("${cssHref(image.href)}");`,
    "background-repeat: no-repeat;",
    `background-position: 0 ${n(barHeight)}px;`,
    `background-size: ${n(win.width)}px ${n(win.height - barHeight)}px;`,
    `border-radius: ${n(radius)}px;`,
  ];
  if (highlight > 0) {
    decls.push(`box-shadow: inset 0 0 0 ${n(highlight)}px rgb(255 255 255 / ${highlightOpacity});`);
  }
  out.element = { x: win.x, y: win.y, width: win.width, height: win.height, css: decls.join("\n") };
  return out;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const BACKDROP_GROUPS: readonly OptionGroup[] = BACKDROP_TOOLS.map((tool) => ({
  id: tool.id,
  labelKey: `tools.${tool.id}.name`,
  values: BACKDROPS.filter((b) => b.tool === tool).map((b) => b.id),
}));

const BACKDROP_LABELS = Object.fromEntries(BACKDROPS.map((b) => [b.id, b.preset.nameKey]));

/** Size of the backdrop thumbnails in the picker (rendered small, shown at about 56 px). */
const THUMB = { width: 96, height: 64 } as const;

const isType =
  (type: ScreenshotBeautifierParams["backgroundType"]) => (p: ScreenshotBeautifierParams) =>
    p.backgroundType === type;
const usesPalette = (p: ScreenshotBeautifierParams) =>
  p.backgroundType === "gradient" ||
  (p.backgroundType === "musterli" && p.backdropColors === "palette");

/** Params added later stay valid; an unknown backdrop (a preset removed upstream) falls back. */
function migrateParams(raw: Readonly<Record<string, unknown>>): unknown {
  const backdrop = raw.backdrop;
  if (typeof backdrop !== "string" || BACKDROP_BY_ID.has(backdrop)) return raw;
  return { ...raw, backdrop: defaults.backdrop };
}

export const screenshotBeautifierTool = defineTool({
  id: ID,
  version: 1,
  category: ["social", "backgrounds"],
  schema,
  defaults,
  defaultSize: { width: 1600, height: 900 },
  sizePresets: SIZE_PRESETS,
  // The picture and the address typed for it never leave the device.
  localParams: ["screenshot", "url"],
  migrateParams,
  presets: [
    preset("aurora", {}),
    preset("clean", {
      backgroundType: "solid",
      backgroundColor: "#e8edf4",
      frame: "window",
      theme: "light",
      radius: 12,
      shadow: 35,
      shadowColor: "#334155",
      highlight: false,
      padding: 10,
    }),
    preset("sunset", {
      backgroundType: "gradient",
      palette: ["#f97316", "#ec4899", "#8b5cf6"],
      gradientAngle: 135,
      frame: "browser",
      theme: "light",
      radius: 16,
      shadow: 55,
      shadowColor: "#4c0519",
      border: 12,
      borderColor: "#ffffff",
      borderOpacity: 35,
      highlight: false,
    }),
    preset("ocean", {
      backdrop: "blurry-gradient/ocean",
      frame: "window",
      theme: "dark",
      radius: 12,
      shadow: 50,
      padding: 11,
    }),
    preset("paper", {
      backgroundType: "solid",
      backgroundColor: "#ffffff",
      frame: "none",
      theme: "light",
      radius: 8,
      shadow: 22,
      shadowColor: "#475569",
      border: 1,
      borderColor: "#cbd5e1",
      borderOpacity: 100,
      highlight: false,
      padding: 8,
    }),
    preset("waves", {
      backdrop: "svg-waves/tide",
      frame: "browser",
      theme: "light",
      align: "bottom",
      padding: 7,
      radius: 18,
      shadow: 45,
      shadowColor: "#03045e",
      highlight: false,
    }),
    preset("night-sky", {
      backdrop: "starry-sky/midnight",
      frame: "window",
      theme: "dark",
      radius: 10,
      shadow: 70,
      shadowColor: "#000000",
      border: 6,
      borderColor: "#ffffff",
      borderOpacity: 12,
    }),
  ],
  controls: {
    groups: [
      { id: "screenshot", labelKey: `tools.${ID}.groups.screenshot` },
      { id: "frame", labelKey: `tools.${ID}.groups.frame` },
      { id: "style", labelKey: `tools.${ID}.groups.style` },
      { id: "background", labelKey: `tools.${ID}.groups.background` },
    ],
    order: [
      "screenshot",
      "padding",
      "align",
      "frame",
      "theme",
      "url",
      "radius",
      "shadow",
      "shadowColor",
      "border",
      "borderColor",
      "borderOpacity",
      "highlight",
      "backgroundType",
      "backdrop",
      "backdropColors",
      "palette",
      "gradientAngle",
      "backgroundColor",
    ],
    params: {
      screenshot: {
        group: "screenshot",
        kind: "image",
        lockable: false,
        descriptionKey: `tools.${ID}.params.screenshot.description`,
        image: { maxEdge: SCREENSHOT_ASSET_RASTER_MAX_EDGE },
      },
      padding: { group: "screenshot", unit: "%", step: 0.5 },
      align: {
        group: "screenshot",
        optionLabelKeys: optionLabels(ID, "align", SCREENSHOT_ALIGNS),
        descriptionKey: `tools.${ID}.params.align.description`,
      },
      frame: {
        group: "frame",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "frame", SCREENSHOT_FRAMES),
      },
      theme: {
        group: "frame",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "theme", SCREENSHOT_THEMES),
        descriptionKey: `tools.${ID}.params.theme.description`,
      },
      url: {
        group: "frame",
        lockable: false,
        descriptionKey: `tools.${ID}.params.url.description`,
        visibleWhen: (p) => p.frame !== "none",
      },
      radius: { group: "style", unit: "px" },
      shadow: { group: "style", unit: "%" },
      shadowColor: { group: "style", visibleWhen: (p) => p.shadow > 0 },
      border: { group: "style", unit: "px" },
      borderColor: { group: "style", visibleWhen: (p) => p.border > 0 },
      borderOpacity: { group: "style", unit: "%", visibleWhen: (p) => p.border > 0 },
      highlight: {
        group: "style",
        descriptionKey: `tools.${ID}.params.highlight.description`,
      },
      backgroundType: {
        group: "background",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "backgroundType", SCREENSHOT_BACKGROUND_TYPES),
      },
      backdrop: {
        group: "background",
        kind: "thumbnails",
        optionLabelKeys: BACKDROP_LABELS,
        optionGroups: BACKDROP_GROUPS,
        optionPreview(value, params) {
          const b = BACKDROP_BY_ID.get(String(value));
          if (!b) return { css: "" };
          const palette = params.backdropColors === "palette" ? params.palette : null;
          return { svg: backdropSvg(b, palette, 1, THUMB.width, THUMB.height) };
        },
        visibleWhen: isType("musterli"),
      },
      backdropColors: {
        group: "background",
        kind: "segmented",
        optionLabelKeys: optionLabels(ID, "backdropColors", SCREENSHOT_BACKDROP_COLORS),
        visibleWhen: isType("musterli"),
      },
      palette: { group: "background", visibleWhen: usesPalette },
      gradientAngle: {
        group: "background",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: isType("gradient"),
      },
      backgroundColor: { group: "background", visibleWhen: isType("solid") },
    },
  },
  randomize(rng, current, locks) {
    // A new background only: the screenshot, its frame and its style stay.
    const palette = randomPalette(rng, rng.int(3, 5));
    const next: ScreenshotBeautifierParams = {
      ...current,
      palette,
      gradientAngle: rng.int(0, 71) * 5,
      backdrop: rng.pick(BACKDROP_IDS),
      backgroundColor: randomPalette(rng, 2)[0] ?? current.backgroundColor,
    };
    return keepLocked(next, current, locks);
  },
  brandPalette(colors) {
    // Brand colours fill the background; shadow and border keep their contrast colours.
    return {
      palette: fitPalette(colors, PALETTE_MIN, PALETTE_MAX),
      backgroundColor: colors[0] ?? defaults.backgroundColor,
      backdropColors: "palette" as const,
    };
  },
  render: {
    kind: "css",
    render(p, ctx) {
      const image = screenshotImage(p);
      const scene = screenshotScene({
        width: ctx.width,
        height: ctx.height,
        padding: p.padding,
        align: p.align,
        frame: p.frame,
        border: p.border,
        radius: p.radius,
        backgroundSvg: backgroundMarkup(p, ctx.seed, ctx.width, ctx.height),
        image,
        shadow: p.shadow,
        shadowColor: p.shadowColor,
        borderColor: p.borderColor,
        borderOpacity: p.borderOpacity,
        highlight: p.highlight,
        theme: p.theme,
        url: p.url,
        accent: PLACEHOLDER_ACCENT,
      });
      return sceneOutput(scene, image);
    },
  },
  exports: ["png", "jpg", "webp", "svg"],
});
