/**
 * Helpers shared by the built-in tool definitions. Internal to the package.
 */
import type { ControlGroup } from "../types";

/** Rounds to a fixed number of decimals, so randomised params stay readable. */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** i18n keys of enum option labels: `tools.<toolId>.params.<key>.options.<value>`. */
export function optionLabels(
  toolId: string,
  key: string,
  values: readonly string[],
): Readonly<Record<string, string>> {
  return Object.fromEntries(values.map((v) => [v, `tools.${toolId}.params.${key}.options.${v}`]));
}

/** Label keys shared by all tools for the common visual params. */
export const COMMON_LABELS = {
  background: "tools.common.params.background.label",
  palette: "tools.common.params.palette.label",
} as const;

/** Control groups whose titles are shared across tools. */
export const COMMON_GROUPS = {
  colors: { id: "colors", labelKey: "tools.common.groups.colors" },
  shape: { id: "shape", labelKey: "tools.common.groups.shape" },
  layout: { id: "layout", labelKey: "tools.common.groups.layout" },
} as const satisfies Record<string, ControlGroup>;
