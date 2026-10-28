/**
 * Pieces shared by the avatar and placeholder tools (docs/TOOLS.md L1):
 * fill, pattern picker, font and foreground params.
 */
import {
  AVATAR_FILLS,
  AVATAR_FONTS,
  CSS_PATTERNS,
  CSS_PATTERN_IDS,
  PATTERN_CATEGORIES,
  cssPatternDeclarations,
  declarationsToCss,
  getCssPattern,
} from "@musterli/engine";
import * as z from "zod";
import { HEX_COLOR_PATTERN, colorSchema } from "../common";
import type { OptionGroup, OptionPreview } from "../types";
import { cssPatternNameKey } from "./css-patterns";

/** Fill, pattern, font and foreground params of both tools. */
export const fillShape = {
  /** Solid colour, linear gradient or a pattern of the CSS pattern library. */
  fill: z.enum(AVATAR_FILLS),
  /** CSS angle of the gradient, 0 = to top. */
  gradientAngle: z.number().min(0).max(360),
  pattern: z.enum(CSS_PATTERN_IDS),
  /** Pattern ink opacity in percent. */
  patternOpacity: z.number().min(5).max(100),
  font: z.enum(AVATAR_FONTS),
  fontWeight: z.int().min(300).max(900),
  /** White or near black, whichever reads better on the base colour. */
  inkAuto: z.boolean(),
  /** Foreground (text, cells, lines) when `inkAuto` is off. */
  ink: colorSchema,
} as const;

/** Pattern picker groups: the categories of the CSS pattern library. */
export const PATTERN_GROUPS: readonly OptionGroup[] = PATTERN_CATEGORIES.map((category) => ({
  id: category,
  labelKey: `tools.css-patterns.categories.${category}`,
  values: CSS_PATTERNS.filter((p) => p.category === category).map((p) => p.id),
}));

export const PATTERN_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  CSS_PATTERN_IDS.map((id) => [id, cssPatternNameKey(id)]),
);

/** Thumbnail of a library pattern in the given colours (inline CSS, cheap). */
export function patternThumbnail(
  value: string | number,
  base: unknown,
  ink: unknown,
): OptionPreview {
  const spec = getCssPattern(String(value));
  if (!spec) return { css: "" };
  const hex = (v: unknown, fallback: string) =>
    typeof v === "string" && HEX_COLOR_PATTERN.test(v) ? v : fallback;
  const background = hex(base, "#94a3b8");
  const color = hex(ink, "#ffffff");
  return {
    css: declarationsToCss(
      cssPatternDeclarations({
        pattern: spec.id,
        background,
        color,
        accent: color,
        size: Math.max(6, Math.min(16, Math.round(spec.size / 2))),
        angle: 45,
        opacity: 70,
      }),
    ),
  };
}
