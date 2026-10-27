/**
 * Built-in tools, registered in the app-wide registry in catalogue order.
 * Adding a tool = one definition file plus one line here.
 */
import { registry } from "../registry";
import type { AnyToolDefinition } from "../types";
import { blobTool } from "./blob";
import { cssGradientTool } from "./css-gradient";
import { paletteGeneratorTool } from "./palette-generator";
import { polkaDotsTool } from "./polka-dots";
import { svgWavesTool } from "./svg-waves";
import { tailwindPaletteTool } from "./tailwind-palette";
import { tintsShadesTool } from "./tints-shades";

export {
  blobTool,
  cssGradientTool,
  paletteGeneratorTool,
  polkaDotsTool,
  svgWavesTool,
  tailwindPaletteTool,
  tintsShadesTool,
};
export type { BlobParams } from "./blob";
export type { CssGradientParams } from "./css-gradient";
export type { PaletteGeneratorParams } from "./palette-generator";
export type { PolkaDotsParams } from "./polka-dots";
export type { SvgWavesParams } from "./svg-waves";
export type { TailwindPaletteParams } from "./tailwind-palette";
export type { TintsShadesParams } from "./tints-shades";

/** All built-in tools in registration order. */
export const builtInTools: readonly AnyToolDefinition[] = [
  cssGradientTool,
  blobTool,
  svgWavesTool,
  polkaDotsTool,
  paletteGeneratorTool,
  tintsShadesTool,
  tailwindPaletteTool,
];

for (const tool of builtInTools) registry.register(tool);
