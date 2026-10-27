/**
 * M2-AP03: CSS Patterns (docs/TOOLS.md B1). One library pattern rendered as
 * pure CSS backgrounds, with an SVG twin for preview-equal SVG and raster
 * exports and a Tailwind extra export.
 *
 * Colours are hex strings validated by `colorSchema`, the pattern is an enum
 * of library ids: a crafted share link cannot get anything else into the
 * CSS. The engine validates colours a second time.
 */
import {
  CSS_PATTERN_IDS,
  CSS_PATTERN_SIZE_MAX,
  CSS_PATTERN_SIZE_MIN,
  CSS_PATTERNS,
  PATTERN_LOOKS,
  cssPattern,
  cssPatternTailwind,
  getCssPattern,
  patternUsesAccent,
  randomPalette,
} from "@motivo/engine";
import * as z from "zod";
import { backgroundSchema, colorSchema } from "../common";
import { keepLocked } from "../randomize";
import { defineTool } from "../registry";
import type { Preset } from "../types";
import { COMMON_GROUPS, COMMON_LABELS, EXTRA_EXPORT_LABELS } from "./shared";

const ID = "css-patterns";

/** i18n key of a library pattern's name (also used by the web pages). */
export const cssPatternNameKey = (id: string): string => `tools.${ID}.patterns.${id}.name`;
/** i18n key of a library pattern's short description. */
export const cssPatternDescriptionKey = (id: string): string =>
  `tools.${ID}.patterns.${id}.description`;

const ROTATABLE = new Set(CSS_PATTERNS.filter((p) => p.rotatable).map((p) => p.id));
const WITH_ACCENT = new Set(CSS_PATTERNS.filter(patternUsesAccent).map((p) => p.id));

const schema = z.object({
  pattern: z.enum(CSS_PATTERN_IDS),
  background: backgroundSchema,
  color: colorSchema,
  accent: colorSchema,
  size: z.int().min(CSS_PATTERN_SIZE_MIN).max(CSS_PATTERN_SIZE_MAX),
  angle: z.number().min(0).max(360),
  opacity: z.number().min(0).max(100),
});

export type CssPatternsParams = z.output<typeof schema>;

const defaults: CssPatternsParams = {
  pattern: "zigzag",
  background: "#f8f5ee",
  color: "#1f3a5f",
  accent: "#e07a5f",
  size: 32,
  angle: 45,
  opacity: 100,
};

const preset = (id: string, params: Partial<CssPatternsParams>): Preset<CssPatternsParams> => ({
  id,
  nameKey: `tools.${ID}.presets.${id}`,
  params: { ...defaults, ...params },
});

/**
 * Params that show a library pattern with its showcase colours, size and
 * angle (library pages and their "open in editor" links).
 */
export function cssPatternShowcase(id: string): CssPatternsParams {
  const spec = getCssPattern(id);
  if (!spec) throw new RangeError(`css-patterns: unknown pattern ${id}`);
  const look = PATTERN_LOOKS[spec.look] ?? PATTERN_LOOKS[0];
  return { ...defaults, ...look, pattern: spec.id, size: spec.size, angle: spec.angle };
}

export const cssPatternsTool = defineTool({
  id: ID,
  version: 1,
  category: ["css-patterns", "patterns", "backgrounds"],
  schema,
  defaults,
  presets: [
    preset("picnic", {
      pattern: "gingham",
      background: "#fffaf5",
      color: "#d62839",
      size: 28,
      angle: 0,
    }),
    preset("blueprint", {
      pattern: "graph-paper",
      background: "#0b3d91",
      color: "#e8f1ff",
      accent: "#9cc3ff",
      size: 16,
      angle: 0,
      opacity: 80,
    }),
    preset("candy-shop", {
      pattern: "candy",
      background: "#ffffff",
      color: "#ef476f",
      accent: "#118ab2",
      size: 36,
      angle: 135,
    }),
    preset("seventies", {
      pattern: "chevron",
      background: "#fef3c7",
      color: "#b45309",
      accent: "#0f766e",
      size: 48,
    }),
    preset("seaside", {
      pattern: "wavy-lines",
      background: "#e0f2fe",
      color: "#0369a1",
      size: 28,
    }),
    preset("highland", {
      pattern: "argyle",
      background: "#f5f0e6",
      color: "#2f5d50",
      accent: "#c9a227",
      size: 56,
    }),
    preset("night-dots", {
      pattern: "dots-duo",
      background: "#0f172a",
      color: "#38bdf8",
      accent: "#f472b6",
      size: 36,
    }),
  ],
  controls: {
    groups: [{ id: "pattern", labelKey: `tools.${ID}.groups.pattern` }, COMMON_GROUPS.colors],
    order: ["pattern", "size", "angle", "background", "color", "accent", "opacity"],
    params: {
      pattern: {
        group: "pattern",
        // A select for now: the shell has no thumbnail picker for enums yet.
        kind: "select",
        optionLabelKeys: Object.fromEntries(
          CSS_PATTERN_IDS.map((id) => [id, cssPatternNameKey(id)]),
        ),
      },
      size: { group: "pattern", step: 2, unit: "px" },
      angle: {
        group: "pattern",
        kind: "angle",
        step: 1,
        unit: "°",
        visibleWhen: (p) => ROTATABLE.has(p.pattern),
      },
      background: { group: "colors", labelKey: COMMON_LABELS.background },
      color: { group: "colors" },
      accent: { group: "colors", visibleWhen: (p) => WITH_ACCENT.has(p.pattern) },
      opacity: { group: "colors", step: 1, unit: "%" },
    },
  },
  randomize(rng, current, locks) {
    const pattern = locks.has("pattern") ? current.pattern : rng.pick(CSS_PATTERN_IDS);
    const spec = getCssPattern(pattern);
    const [background, color, accent] = randomPalette(rng, 3) as [string, string, string];
    const scale = rng.float(0.6, 1.6);
    const size = Math.round(((spec?.size ?? defaults.size) * scale) / 2) * 2;
    const next: CssPatternsParams = {
      pattern,
      background,
      color,
      accent,
      size: Math.min(Math.max(size, CSS_PATTERN_SIZE_MIN), CSS_PATTERN_SIZE_MAX),
      angle: ROTATABLE.has(pattern) ? rng.int(0, 23) * 15 : current.angle,
      opacity: rng.bool(0.8) ? 100 : rng.int(5, 9) * 10,
    };
    return keepLocked(next, current, locks);
  },
  render: {
    kind: "css",
    render(p, { width, height }) {
      const out = cssPattern({ ...p, width, height });
      return { css: out.css, previewSvg: out.svg };
    },
  },
  exports: ["css", "svg", "png", "jpg", "webp"],
  extraExports: [
    {
      id: "tailwind",
      labelKey: EXTRA_EXPORT_LABELS.tailwind,
      language: "html",
      render(p) {
        return cssPatternTailwind(p);
      },
    },
  ],
  gating: {},
});
