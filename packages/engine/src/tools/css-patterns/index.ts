/**
 * CSS pattern library (docs/TOOLS.md B1): one call renders a library
 * pattern as CSS declarations, Tailwind classes and an equivalent SVG.
 *
 * Stacking (layer editor, M2-AP04): a pattern instance is
 * `CssPatternInstance` (pattern id, colours, size, angle, opacity). Each
 * instance expands to a list of `PatternLayer`s painted with its own
 * colours; `cssPatternStack` concatenates the painted layers of several
 * instances (top first) over one background. The single-pattern functions
 * are a stack of one.
 */
import {
  MAX_PATTERN_LAYERS,
  declarationsToCss,
  declarationsToTailwind,
  stackDeclarations,
  stackSvg,
  type PaintedLayers,
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

/** Most pattern instances in one stack (layer editor). */
export const CSS_PATTERN_STACK_MAX = 5;

export interface CssPatternStackOptions {
  /** Background colour (hex) or "transparent". */
  readonly background: string;
  /** Pattern instances, top first. May be empty (background only). */
  readonly layers: readonly CssPatternInstance[];
}

function painted(o: CssPatternStackOptions): PaintedLayers[] {
  if (o.layers.length > CSS_PATTERN_STACK_MAX) {
    throw new RangeError(`css-patterns: more than ${CSS_PATTERN_STACK_MAX} stacked patterns`);
  }
  return o.layers.map((instance) => ({
    layers: cssPatternLayers(instance),
    inks: { color: instance.color, accent: instance.accent, opacity: instance.opacity / 100 },
  }));
}

/** CSS values of a stack of pattern instances over one background. */
export function cssPatternStackDeclarations(o: CssPatternStackOptions): PatternDeclarations {
  return stackDeclarations(painted(o), o.background);
}

export function cssPatternStackTailwind(o: CssPatternStackOptions): string {
  return declarationsToTailwind(cssPatternStackDeclarations(o));
}

/** CSS and the SVG twin of a stack, from the same layer list (one render path). */
export function cssPatternStack(
  o: CssPatternStackOptions & { width: number; height: number },
): CssPatternResult {
  const stack = painted(o);
  const declarations = stackDeclarations(stack, o.background);
  return {
    declarations,
    css: declarationsToCss(declarations),
    svg: stackSvg(stack, o.background, o.width, o.height),
  };
}

const single = (o: CssPatternOptions): CssPatternStackOptions => ({
  background: o.background,
  layers: [o],
});

export function cssPatternDeclarations(o: CssPatternOptions): PatternDeclarations {
  return cssPatternStackDeclarations(single(o));
}

export function cssPatternTailwind(o: CssPatternOptions): string {
  return cssPatternStackTailwind(single(o));
}

export function cssPattern(
  o: CssPatternOptions & { width: number; height: number },
): CssPatternResult {
  return cssPatternStack({ ...single(o), width: o.width, height: o.height });
}
