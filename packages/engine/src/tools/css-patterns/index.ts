/**
 * CSS pattern library (docs/TOOLS.md B1): one call renders a library
 * pattern as CSS declarations, Tailwind classes and an equivalent SVG.
 *
 * Data model for stacking (layer editor, M2-AP04): a pattern instance is
 * `CssPatternInstance` (pattern id, colours, size, angle, opacity). Each
 * instance expands to a list of `PatternLayer`s painted with its own
 * colours; stacking several instances means concatenating their painted
 * layers (top first) over one background, which `layers.ts` already handles
 * for any layer count.
 */
import {
  MAX_PATTERN_LAYERS,
  declarationsToCss,
  declarationsToTailwind,
  patternDeclarations,
  patternSvg,
  type PatternDeclarations,
  type PatternLayer,
} from "./layers";
import { getCssPattern, type PatternSpec } from "./library";

export * from "./layers";
export * from "./library";

/** Smallest and largest pattern size in px. */
export const CSS_PATTERN_SIZE_MIN = 4;
export const CSS_PATTERN_SIZE_MAX = 200;

export interface CssPatternInstance {
  readonly pattern: string;
  /** Primary colour, hex. */
  readonly color: string;
  /** Accent colour, hex. */
  readonly accent: string;
  /** Pattern period in px. */
  readonly size: number;
  /** Rotation in degrees (rotatable patterns only). */
  readonly angle: number;
  /** Pattern opacity in percent (0 to 100). */
  readonly opacity: number;
}

export interface CssPatternOptions extends CssPatternInstance {
  /** Background colour (hex) or "transparent". */
  readonly background: string;
}

export interface CssPatternResult {
  readonly declarations: PatternDeclarations;
  /** CSS declarations without selector, one per line. */
  readonly css: string;
  /** SVG of the same pattern on a `width` × `height` canvas. */
  readonly svg: string;
}

function requireSpec(id: string): PatternSpec {
  const spec = getCssPattern(id);
  if (!spec) throw new RangeError(`css-patterns: unknown pattern ${JSON.stringify(id)}`);
  return spec;
}

/** The layers of one pattern instance (size clamped, angle ignored when not rotatable). */
export function cssPatternLayers(
  instance: Pick<CssPatternInstance, "pattern" | "size" | "angle">,
): PatternLayer[] {
  const spec = requireSpec(instance.pattern);
  if (!Number.isFinite(instance.size) || !Number.isFinite(instance.angle)) {
    throw new RangeError("css-patterns: size and angle must be finite");
  }
  const size = Math.min(
    Math.max(Math.round(instance.size), CSS_PATTERN_SIZE_MIN),
    CSS_PATTERN_SIZE_MAX,
  );
  const layers = spec.layers({ size, angle: spec.rotatable ? instance.angle : 0 });
  if (layers.length > MAX_PATTERN_LAYERS) {
    throw new RangeError(`css-patterns: ${spec.id} has more than ${MAX_PATTERN_LAYERS} layers`);
  }
  return layers;
}

function paintOf(o: CssPatternOptions) {
  return { color: o.color, accent: o.accent, background: o.background, opacity: o.opacity / 100 };
}

export function cssPatternDeclarations(o: CssPatternOptions): PatternDeclarations {
  return patternDeclarations(cssPatternLayers(o), paintOf(o));
}

export function cssPatternTailwind(o: CssPatternOptions): string {
  return declarationsToTailwind(cssPatternDeclarations(o));
}

export function cssPattern(
  o: CssPatternOptions & { width: number; height: number },
): CssPatternResult {
  const layers = cssPatternLayers(o);
  const paint = paintOf(o);
  const declarations = patternDeclarations(layers, paint);
  return {
    declarations,
    css: declarationsToCss(declarations),
    svg: patternSvg(layers, paint, o.width, o.height),
  };
}
