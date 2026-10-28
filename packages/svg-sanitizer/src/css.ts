/**
 * Just enough CSS to keep the colours of SVG files from design tools, which
 * often style shapes through `<style>` class rules (`.st0{fill:#e63946}`) or
 * `style=""` attributes. Rules are never copied as CSS: matching
 * declarations are turned into presentation attributes on the elements, so
 * the output contains no stylesheet at all. Unsupported selectors and
 * at-rules (`@import`, `@font-face`, `@media`) are ignored.
 */
import { PRESENTATION, isSafeValue } from "./policy";

export type Declarations = Map<string, string>;

/** One simple selector: `tag`, `.class`, `#id` or `tag.class`. */
export interface SimpleSelector {
  tag?: string;
  id?: string;
  classes: string[];
  /** CSS specificity as one comparable number (ids, classes, tags). */
  specificity: number;
}

export interface CssRule {
  selectors: SimpleSelector[];
  declarations: Declarations;
  /** Source order, for ties in specificity. */
  order: number;
}

/** Replaces comments with a space; an unclosed comment runs to the end (CSS). Linear. */
function stripComments(css: string): string {
  if (!css.includes("/*")) return css;
  let out = "";
  let i = 0;
  for (;;) {
    const start = css.indexOf("/*", i);
    if (start === -1) return out + css.slice(i);
    out += `${css.slice(i, start)} `;
    const end = css.indexOf("*/", start + 2);
    if (end === -1) return out;
    i = end + 2;
  }
}

/**
 * Parses `prop: value; prop: value` and keeps whitelisted presentation
 * properties with safe values. `!important` is dropped (the inlined
 * attributes are ordered by the cascade anyway).
 */
export function parseDeclarations(text: string): Declarations {
  const out: Declarations = new Map();
  for (const part of stripComments(text).split(";")) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    let value = part
      .slice(colon + 1)
      .replace(/!\s*important\s*$/i, "")
      .trim();
    if (!PRESENTATION.has(name) || value === "") continue;
    if (name === "font-family") value = value.replace(/["']/g, "");
    if (!isSafeValue(name, value)) continue;
    out.set(name, value);
  }
  return out;
}

const SIMPLE = /^([A-Za-z][\w-]*)?((?:[.#][A-Za-z_][\w-]*)*)$/;

function parseSelector(text: string): SimpleSelector | null {
  const m = SIMPLE.exec(text.trim());
  if (!m || (m[1] === undefined && (m[2] ?? "") === "")) return null;
  const selector: SimpleSelector = { classes: [], specificity: 0 };
  if (m[1] !== undefined) {
    selector.tag = m[1];
    selector.specificity += 1;
  }
  for (const part of (m[2] ?? "").match(/[.#][A-Za-z_][\w-]*/g) ?? []) {
    if (part.startsWith("#")) {
      if (selector.id !== undefined) return null;
      selector.id = part.slice(1);
      selector.specificity += 10_000;
    } else {
      selector.classes.push(part.slice(1));
      selector.specificity += 100;
    }
  }
  return selector;
}

/** Index of the `}` closing the block that starts after `open`, or -1. */
function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const ch = css.charAt(i);
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Most selectors kept from all stylesheets of a document. Design tools write
 * a few dozen (`.st0` to `.st40`); the cap keeps "every element against every
 * selector" bounded for hostile files (DoS).
 */
export const MAX_CSS_SELECTORS = 2000;

/**
 * Parses a stylesheet into rules with simple selectors. Never throws.
 * `budget` is the number of selectors still allowed; rules beyond it are
 * ignored.
 */
export function parseStylesheet(
  css: string,
  firstOrder = 0,
  budget = MAX_CSS_SELECTORS,
): CssRule[] {
  const src = stripComments(css);
  const rules: CssRule[] = [];
  let i = 0;
  let order = firstOrder;
  let left = budget;
  while (i < src.length && left > 0) {
    const open = src.indexOf("{", i);
    if (open === -1) break;
    const prelude = src.slice(i, open).trim();
    const close = matchingBrace(src, open);
    if (close === -1) break;
    // At-rules (and their nested blocks) carry nothing we keep.
    if (!prelude.includes("@")) {
      // Duplicates add nothing; dropping them keeps `.a,.a,.a,...` from eating the budget twice.
      const unique = [...new Set(prelude.split(",").map((t) => t.trim()))].slice(0, left);
      const selectors = unique.map(parseSelector).filter((s): s is SimpleSelector => s !== null);
      const declarations = parseDeclarations(src.slice(open + 1, close));
      if (selectors.length > 0 && declarations.size > 0) {
        rules.push({ selectors, declarations, order: order++ });
        left -= selectors.length;
      }
    }
    i = close + 1;
  }
  return rules;
}

/** Whether `selector` matches an element with this tag, id and classes. */
export function matches(
  selector: SimpleSelector,
  tag: string,
  id: string | undefined,
  classes: readonly string[],
): boolean {
  if (selector.tag !== undefined && selector.tag !== tag) return false;
  if (selector.id !== undefined && selector.id !== id) return false;
  return selector.classes.every((c) => classes.includes(c));
}
