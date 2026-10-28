/**
 * M2-AP03/AP04: CSS Patterns (docs/TOOLS.md B1). One to five library
 * patterns stacked over a background colour, rendered as pure CSS
 * backgrounds, with an SVG twin for preview-equal SVG and raster exports and
 * a Tailwind extra export.
 *
 * The layers are a generic list param (`ListHint`): the editor shell builds
 * the layer list and the sub-form of the selected layer from the schema, the
 * pattern choice is a generic thumbnail picker (`optionPreview`). Nothing in
 * the shell knows about patterns.
 *
 * Colours are hex strings validated by `colorSchema`, the pattern is an enum
 * of library ids, the layer count is capped: a crafted share link cannot get
 * anything else into the CSS. The engine validates colours a second time.
 * Single-pattern params of AP03 (share links, library pages) are upgraded by
 * `migrateParams` to a stack of one.
 */
import {
  CSS_PATTERN_IDS,
  CSS_PATTERN_SIZE_MAX,
  CSS_PATTERN_SIZE_MIN,
  CSS_PATTERN_STACK_MAX,
  CSS_PATTERNS,
  PATTERN_LOOKS,
  cssPatternDeclarations,
  cssPatternStack,
  cssPatternStackTailwind,
  declarationsToCss,
  getCssPattern,
  patternUsesAccent,
  randomPalette,
  type Rng,
} from "@musterli/engine";
import * as z from "zod";
import { HEX_COLOR_PATTERN, backgroundSchema, colorSchema } from "../common";
import { isItemLocked, keepLocked } from "../randomize";
import { COLOR_ANIMATION } from "../animation";
import { defineTool } from "../registry";
import type { ControlHints, OptionPreview, Preset } from "../types";
import { COMMON_LABELS, EXTRA_EXPORT_LABELS } from "./shared";

const ID = "css-patterns";

/** i18n key of a library pattern's name (also used by the web pages). */
export const cssPatternNameKey = (id: string): string => `tools.${ID}.patterns.${id}.name`;
/** i18n key of a library pattern's short description. */
export const cssPatternDescriptionKey = (id: string): string =>
  `tools.${ID}.patterns.${id}.description`;

const ROTATABLE = new Set(CSS_PATTERNS.filter((p) => p.rotatable).map((p) => p.id));
const WITH_ACCENT = new Set(CSS_PATTERNS.filter(patternUsesAccent).map((p) => p.id));

const layerSchema = z.object({
  pattern: z.enum(CSS_PATTERN_IDS),
  color: colorSchema,
  accent: colorSchema,
  size: z.int().min(CSS_PATTERN_SIZE_MIN).max(CSS_PATTERN_SIZE_MAX),
  angle: z.number().min(0).max(360),
  opacity: z.number().min(0).max(100),
  /** Hidden layers stay in the list but are not painted. */
  visible: z.boolean(),
});

const schema = z.object({
  background: backgroundSchema,
  /** Top layer first, as in CSS. */
  layers: z.array(layerSchema).min(1).max(CSS_PATTERN_STACK_MAX),
});

export type CssPatternsParams = z.output<typeof schema>;
export type CssPatternLayer = z.output<typeof layerSchema>;

const defaultLayer: CssPatternLayer = {
  pattern: "zigzag",
  color: "#1f3a5f",
  accent: "#e07a5f",
  size: 32,
  angle: 45,
  opacity: 100,
  visible: true,
};

const defaults: CssPatternsParams = { background: "#f8f5ee", layers: [defaultLayer] };

const layer = (params: Partial<CssPatternLayer>): CssPatternLayer => ({
  ...defaultLayer,
  ...params,
});

const preset = (
  id: string,
  background: string,
  layers: CssPatternLayer[],
): Preset<CssPatternsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { background, layers },
});

/**
 * Params that show a library pattern with its showcase colours, size and
 * angle, as a stack of one (library pages and their "open in editor" links).
 */
export function cssPatternShowcase(id: string): CssPatternsParams {
  const spec = getCssPattern(id);
  if (!spec) throw new RangeError(`css-patterns: unknown pattern ${id}`);
  const look = PATTERN_LOOKS[spec.look] ?? PATTERN_LOOKS[0];
  return {
    background: look.background,
    layers: [
      layer({
        pattern: spec.id,
        color: look.color,
        accent: look.accent,
        size: spec.size,
        angle: spec.angle,
      }),
    ],
  };
}

/** Thumbnail edge of the pattern picker in px; previews show about three periods. */
const THUMB_PERIOD_MAX = 20;

/** Thumbnail of a library pattern in the layer's colours over the design background. */
function patternPreview(
  value: string | number,
  item: CssPatternLayer,
  root: Readonly<Record<string, unknown>>,
): OptionPreview {
  const spec = getCssPattern(String(value));
  if (!spec) return { css: "" };
  const bg = root.background;
  const background =
    typeof bg === "string" && HEX_COLOR_PATTERN.test(bg) ? bg : PATTERN_LOOKS[0].background;
  const size = Math.max(
    CSS_PATTERN_SIZE_MIN,
    Math.min(THUMB_PERIOD_MAX, Math.round(spec.size / 2)),
  );
  const declarations = cssPatternDeclarations({
    pattern: spec.id,
    background,
    color: item.color,
    accent: item.accent,
    size,
    angle: spec.angle,
    opacity: 100,
  });
  return { css: declarationsToCss(declarations) };
}

const itemHints: ControlHints<CssPatternLayer> = {
  order: ["pattern", "size", "angle", "color", "accent", "opacity"],
  params: {
    pattern: {
      kind: "thumbnails",
      optionLabelKeys: Object.fromEntries(CSS_PATTERN_IDS.map((id) => [id, cssPatternNameKey(id)])),
      optionPreview: patternPreview,
    },
    size: { step: 2, unit: "px" },
    angle: {
      kind: "angle",
      step: 1,
      unit: "°",
      visibleWhen: (l) => ROTATABLE.has(l.pattern),
    },
    color: {},
    accent: { visibleWhen: (l) => WITH_ACCENT.has(l.pattern) },
    opacity: { step: 1, unit: "%" },
    // Toggled by the eye button in the layer list.
    visible: { kind: "hidden" },
  },
};

/** "Add layer": the first library pattern not in use yet, in the top layer's colours. */
function newLayer(items: readonly CssPatternLayer[]): CssPatternLayer {
  const used = new Set(items.map((l) => l.pattern));
  const spec = CSS_PATTERNS.find((p) => !used.has(p.id)) ?? CSS_PATTERNS[0];
  const top = items[0] ?? defaultLayer;
  return layer({
    pattern: spec?.id ?? defaultLayer.pattern,
    color: top.color,
    accent: top.accent,
    size: spec?.size ?? defaultLayer.size,
    angle: spec?.angle ?? 0,
    opacity: 60,
  });
}

/** Rolls one layer; draws the same amount of randomness whatever is locked. */
function rollLayer(
  rng: Rng,
  current: CssPatternLayer,
  index: number,
  count: number,
  palette: readonly string[],
  locks: ReadonlySet<string>,
): CssPatternLayer {
  const locked = (field: keyof CssPatternLayer) => isItemLocked(locks, "layers", index, field);
  const rolledPattern = rng.pick(CSS_PATTERN_IDS);
  const pattern = locked("pattern") ? current.pattern : rolledPattern;
  const spec = getCssPattern(pattern);
  const scale = rng.float(0.6, 1.6);
  const size = Math.round(((spec?.size ?? defaultLayer.size) * scale) / 2) * 2;
  const angle = rng.int(0, 23) * 15;
  // The bottom layer is mostly opaque, layers above let it shine through.
  const bottom = index === count - 1;
  const opaque = rng.bool(bottom ? 0.8 : 0.2);
  const opacity = opaque ? 100 : rng.int(bottom ? 5 : 3, 9) * 10;
  return {
    pattern,
    color: palette[1 + (index % 3)] ?? current.color,
    accent: palette[1 + ((index + 1) % 3)] ?? current.accent,
    size: Math.min(Math.max(size, CSS_PATTERN_SIZE_MIN), CSS_PATTERN_SIZE_MAX),
    angle: ROTATABLE.has(pattern) ? angle : current.angle,
    opacity,
    visible: current.visible,
  };
}

export const cssPatternsTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-patterns", "patterns", "backgrounds"],
  schema,
  defaults,
  migrateParams(raw) {
    // AP03 shape: one pattern as top-level params, no layer list.
    if (Object.prototype.hasOwnProperty.call(raw, "layers") || !("pattern" in raw)) return raw;
    const { background, pattern, color, accent, size, angle, opacity } = raw;
    return {
      background,
      layers: [{ pattern, color, accent, size, angle, opacity, visible: true }],
    };
  },
  presets: [
    preset("picnic", "#fffaf5", [
      layer({ pattern: "polka", color: "#ffffff", size: 28, opacity: 70 }),
      layer({ pattern: "gingham", color: "#d62839", size: 28, angle: 0 }),
    ]),
    preset("blueprint", "#0b3d91", [
      layer({ pattern: "grid-lines", color: "#e8f1ff", size: 80, angle: 0, opacity: 60 }),
      layer({
        pattern: "graph-paper",
        color: "#e8f1ff",
        accent: "#9cc3ff",
        size: 16,
        angle: 0,
        opacity: 50,
      }),
    ]),
    preset("candy-shop", "#ffffff", [
      layer({ pattern: "dotted-grid", color: "#ffffff", size: 24, opacity: 80 }),
      layer({ pattern: "candy", color: "#ef476f", accent: "#118ab2", size: 36, angle: 135 }),
    ]),
    preset("seventies", "#fef3c7", [
      layer({ pattern: "rings", color: "#fef3c7", accent: "#0f766e", size: 48, opacity: 40 }),
      layer({ pattern: "chevron", color: "#b45309", accent: "#0f766e", size: 48 }),
    ]),
    preset("seaside", "#e0f2fe", [
      layer({ pattern: "wavy-lines", color: "#0369a1", size: 28 }),
      layer({ pattern: "ripples", color: "#7dd3fc", accent: "#bae6fd", size: 56, opacity: 60 }),
    ]),
    preset("highland", "#f5f0e6", [
      layer({ pattern: "pinstripes", color: "#c9a227", size: 16, angle: 45, opacity: 50 }),
      layer({ pattern: "argyle", color: "#2f5d50", accent: "#c9a227", size: 56 }),
      layer({
        pattern: "plaid",
        color: "#8c2f39",
        accent: "#2f5d50",
        size: 64,
        angle: 0,
        opacity: 30,
      }),
    ]),
    preset("night-dots", "#0f172a", [
      layer({ pattern: "dots-duo", color: "#38bdf8", accent: "#f472b6", size: 36 }),
      layer({ pattern: "crosses", color: "#1e293b", size: 18, opacity: 100 }),
      layer({ pattern: "grid-lines", color: "#334155", size: 72, angle: 0, opacity: 80 }),
    ]),
  ],
  controls: {
    order: ["layers", "background"],
    params: {
      layers: {
        kind: "list",
        list: {
          item: itemHints,
          visibilityField: "visible",
          titleField: "pattern",
          newItem: newLayer,
          itemLabelKey: `tools.${ID}.layer`,
        },
      },
      background: { labelKey: COMMON_LABELS.background },
    },
  },
  randomize(rng, current, locks) {
    const palette = randomPalette(rng, 4);
    const count = current.layers.length;
    const layers = current.layers.map((l, i) => rollLayer(rng, l, i, count, palette, locks));
    const next: CssPatternsParams = { background: palette[0] ?? current.background, layers };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "css",
    render(p, { width, height }) {
      const out = cssPatternStack({
        background: p.background,
        layers: p.layers.filter((l) => l.visible),
        width,
        height,
      });
      return { css: out.css, previewSvg: out.svg };
    },
  },
  exports: ["css", "svg", "png", "jpg", "webp"],
  animation: COLOR_ANIMATION,
  extraExports: [
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render(p) {
        return cssPatternStackTailwind({
          background: p.background,
          layers: p.layers.filter((l) => l.visible),
        });
      },
    },
  ],
});
