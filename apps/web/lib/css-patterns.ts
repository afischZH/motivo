/**
 * CSS pattern library pages: every pattern of the engine's library with its
 * showcase params, rendered through the `css-patterns` tool's own engine
 * functions (one render path: the page preview, the copied CSS and the
 * editor link all come from the same params). Server only, build time.
 */
import {
  CSS_PATTERNS,
  CSS_PATTERN_SIZE_MAX,
  PATTERN_CATEGORIES,
  cssPatternStack,
  cssPatternStackDeclarations,
  declarationsToCss,
  declarationsToTailwind,
  getCssPattern,
  type PatternCategory,
  type PatternDeclarations,
  type PatternSpec,
} from "@motivo/engine";
import {
  cssPatternDescriptionKey,
  cssPatternNameKey,
  cssPatternShowcase,
  registry,
} from "@motivo/tool-registry";

import { OG_SIZE } from "./seo/og";
import { designEditorHash, STATIC_SEED } from "./seo/motifs";

/** Registry id of the CSS pattern tool. */
export const PATTERN_TOOL_ID = "css-patterns";

/** How many related patterns a pattern page links to. */
export const RELATED_PATTERN_COUNT = 6;

export type { PatternCategory };
export { PATTERN_CATEGORIES };

export function libraryPatterns(): readonly PatternSpec[] {
  return CSS_PATTERNS;
}

export function findPattern(id: string): PatternSpec | undefined {
  return getCssPattern(id);
}

/** Message keys of a pattern's texts and category. */
export const patternKeys = (spec: PatternSpec) => ({
  name: cssPatternNameKey(spec.id),
  description: cssPatternDescriptionKey(spec.id),
  category: `tools.${PATTERN_TOOL_ID}.categories.${spec.category}`,
});

/** A React inline style for the declarations (inline styles are allowed by the CSP). */
export type PatternStyle = Readonly<Record<string, string>>;

export interface PatternShowcase {
  params: ReturnType<typeof cssPatternShowcase>;
  declarations: PatternDeclarations;
  style: PatternStyle;
  /** CSS declarations, one per line, as the tool exports them. */
  css: string;
  tailwind: string;
}

export function patternShowcase(spec: PatternSpec): PatternShowcase {
  const params = cssPatternShowcase(spec.id);
  const declarations = cssPatternStackDeclarations(params);
  return {
    params,
    declarations,
    style: { ...declarations },
    css: declarationsToCss(declarations),
    tailwind: declarationsToTailwind(declarations),
  };
}

/** Params of the OG image: the showcase at twice its size, so it reads in a small card. */
export function patternOgParams(spec: PatternSpec): PatternShowcase["params"] {
  const params = cssPatternShowcase(spec.id);
  return {
    ...params,
    layers: params.layers.map((l) => ({ ...l, size: Math.min(l.size * 2, CSS_PATTERN_SIZE_MAX) })),
  };
}

/** SVG of the OG image motif (for the OG image build script). */
export function patternOgSvg(spec: PatternSpec): string {
  return cssPatternStack({ ...patternOgParams(spec), width: OG_SIZE.width, height: OG_SIZE.height })
    .svg;
}

/** OG image key below `/og/<locale>/` (see `ogImagePath`). */
export function patternOgKey(id: string): string {
  return `${PATTERN_TOOL_ID}/${id}`;
}

/** `#d=...` that opens the showcase in the editor. */
export function patternEditorHash(spec: PatternSpec): string {
  const tool = registry.get(PATTERN_TOOL_ID);
  if (!tool) return "";
  return designEditorHash(tool, {
    id: spec.id,
    params: cssPatternShowcase(spec.id),
    seed: STATIC_SEED,
  });
}

/** Same category first (library order), then the neighbours in the library. */
export function relatedPatterns(
  spec: PatternSpec,
  max: number = RELATED_PATTERN_COUNT,
): PatternSpec[] {
  const same = CSS_PATTERNS.filter((p) => p.category === spec.category && p.id !== spec.id);
  const index = CSS_PATTERNS.indexOf(spec);
  const others = [...CSS_PATTERNS.slice(index + 1), ...CSS_PATTERNS.slice(0, index)].filter(
    (p) => p.category !== spec.category,
  );
  return [...same, ...others].slice(0, max);
}

/** Patterns per category in category order (for counts and filters). */
export function patternsByCategory(): { category: PatternCategory; patterns: PatternSpec[] }[] {
  return PATTERN_CATEGORIES.map((category) => ({
    category,
    patterns: CSS_PATTERNS.filter((p) => p.category === category),
  }));
}
