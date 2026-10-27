/**
 * Preview rendering. Calls the tool's single `render` function (the same one
 * the exporters use) and turns the result into something React can show
 * without injecting markup: SVG as a data URL for `<img>`, CSS as a style
 * object.
 */
import {
  createRenderContext,
  type AnyToolDefinition,
  type CanvasSize,
  type RenderKind,
} from "@motivo/tool-registry";
import type { ParamValues } from "../store/editor-store";

/** A React-compatible inline style: camelCase or custom-property keys. */
export type MotifStyle = Readonly<Record<string, string>>;

/**
 * One CSS declaration list, grouped by property. Repeated properties keep all
 * values in source order (fallback first, progressive enhancement last).
 */
export type CssDeclarations = readonly (readonly [property: string, values: readonly string[]])[];

export type MotifOutput =
  | { kind: "svg"; svg: string }
  | { kind: "css"; css: string; declarations: CssDeclarations }
  | { kind: "unsupported"; renderKind: RenderKind };

/** Renders one design through the tool's render path. */
export function renderMotif(
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): MotifOutput {
  const ctx = createRenderContext(seed, size);
  // The store only holds params that passed the tool's schema.
  const p = params as Parameters<typeof tool.randomize>[1];
  const renderer = tool.render;
  switch (renderer.kind) {
    case "svg":
      return { kind: "svg", svg: renderer.render(p, ctx) };
    case "css": {
      const out = renderer.render(p, ctx);
      return { kind: "css", css: out.css, declarations: parseCssDeclarations(out.css) };
    }
    default:
      return { kind: "unsupported", renderKind: renderer.kind };
  }
}

/** `data:` URL for an SVG string, safe to use as `<img src>`. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Splits `prop: value; prop: value` into declarations. Semicolons inside
 * parentheses or quotes (data URLs, `url("a;b")`) do not end a declaration.
 */
export function parseCssDeclarations(css: string): CssDeclarations {
  const order: string[] = [];
  const values = new Map<string, string[]>();
  const push = (raw: string) => {
    const colon = raw.indexOf(":");
    if (colon <= 0) return;
    const property = raw.slice(0, colon).trim().toLowerCase();
    const value = raw.slice(colon + 1).trim();
    if (!property || !value) return;
    const list = values.get(property);
    if (list) list.push(value);
    else {
      values.set(property, [value]);
      order.push(property);
    }
  };

  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote !== null) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      push(css.slice(start, i));
      start = i + 1;
    }
  }
  push(css.slice(start));
  return order.map((property) => [property, values.get(property) ?? []] as const);
}

/** `background-image` -> `backgroundImage`, `-webkit-mask` -> `WebkitMask`, `--x` stays. */
export function toReactStyleProperty(property: string): string {
  if (property.startsWith("--")) return property;
  const camel = property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return property.startsWith("-") ? camel.charAt(0).toUpperCase() + camel.slice(1) : camel;
}

export type CssSupports = (property: string, value: string) => boolean;

/**
 * Builds a React style object. A style object holds one value per property,
 * so for repeated properties the last value the browser supports wins, as it
 * would in a stylesheet. Without `supports` (server render, first client
 * render) the first value, the fallback, is used.
 */
export function cssToStyle(declarations: CssDeclarations, supports?: CssSupports): MotifStyle {
  const style: Record<string, string> = {};
  for (const [property, list] of declarations) {
    let chosen = list[0];
    if (supports) {
      for (let i = list.length - 1; i > 0; i--) {
        const candidate = list[i];
        if (candidate !== undefined && supports(property, candidate)) {
          chosen = candidate;
          break;
        }
      }
    }
    if (chosen !== undefined) style[toReactStyleProperty(property)] = chosen;
  }
  return style;
}
