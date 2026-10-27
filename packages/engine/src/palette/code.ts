/**
 * Code exports for colour lists: CSS custom properties, plain value lists,
 * `tailwind.config.js` (Tailwind v3 and earlier) and a Tailwind v4 `@theme`
 * block. Pure string builders.
 */
import { formatColor, type ColorFormat } from "./format";

export interface NamedColor {
  /** Name suffix, e.g. "500", "tint-2" or "1". Must already be CSS-safe. */
  name: string;
  color: string;
}

/** One formatted value per line. */
export function colorList(colors: readonly NamedColor[], format: ColorFormat): string {
  return colors.map((c) => formatColor(c.color, format)).join("\n") + "\n";
}

/**
 * `:root { --<prefix>-<name>: <value>; }`. An empty `name` yields just
 * `--<prefix>` (e.g. the base colour of a scale).
 */
export function cssVariables(
  prefix: string,
  colors: readonly NamedColor[],
  format: ColorFormat = "hex",
): string {
  const lines = colors.map((c) => {
    const name = c.name.length > 0 ? `--${prefix}-${c.name}` : `--${prefix}`;
    return `  ${name}: ${formatColor(c.color, format)};`;
  });
  return `:root {\n${lines.join("\n")}\n}\n`;
}

/** Quotes a key for a JS object literal only when needed. */
function jsKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) || /^(?:0|[1-9]\d*)$/.test(key) ? key : `'${key}'`;
}

/**
 * `tailwind.config.js` that extends the theme with one colour family, so
 * classes like `bg-brand-500` work without replacing the default colours.
 */
export function tailwindConfig(name: string, colors: readonly NamedColor[]): string {
  const entries = colors.map(
    (c) => `          ${jsKey(c.name)}: '${formatColor(c.color, "hex")}',`,
  );
  return [
    "/** @type {import('tailwindcss').Config} */",
    "module.exports = {",
    "  theme: {",
    "    extend: {",
    "      colors: {",
    `        ${jsKey(name)}: {`,
    ...entries,
    "        },",
    "      },",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n");
}

/** Tailwind v4 `@theme` block with `--color-<name>-<step>` variables. */
export function tailwindTheme(
  name: string,
  colors: readonly NamedColor[],
  format: ColorFormat = "oklch",
): string {
  const lines = colors.map((c) => `  --color-${name}-${c.name}: ${formatColor(c.color, format)};`);
  return `@theme {\n${lines.join("\n")}\n}\n`;
}
