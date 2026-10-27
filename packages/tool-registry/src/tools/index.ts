/**
 * Built-in tools, registered in the app-wide registry in catalogue order.
 * Adding a tool = one definition file plus one line here.
 */
import { registry } from "../registry";
import type { AnyToolDefinition } from "../types";
import { blobTool } from "./blob";
import { confettiTool } from "./confetti";
import { cssGradientTool } from "./css-gradient";
import { cssPatternsTool } from "./css-patterns";
import { dieterDotsTool } from "./dieter-dots";
import { gridPatternsTool } from "./grid-patterns";
import { noiseGrainTool } from "./noise-grain";
import { paletteFromImageTool } from "./palette-from-image";
import { paletteGeneratorTool } from "./palette-generator";
import { polkaDotsTool } from "./polka-dots";
import { starrySkyTool } from "./starry-sky";
import { svgWavesTool } from "./svg-waves";
import { tailwindPaletteTool } from "./tailwind-palette";
import { tintsShadesTool } from "./tints-shades";

export {
  blobTool,
  confettiTool,
  cssGradientTool,
  cssPatternsTool,
  dieterDotsTool,
  gridPatternsTool,
  noiseGrainTool,
  paletteFromImageTool,
  paletteGeneratorTool,
  polkaDotsTool,
  starrySkyTool,
  svgWavesTool,
  tailwindPaletteTool,
  tintsShadesTool,
};
export type { BlobParams } from "./blob";
export type { ConfettiParams } from "./confetti";
export type { CssGradientParams } from "./css-gradient";
export type { CssPatternsParams } from "./css-patterns";
export { cssPatternDescriptionKey, cssPatternNameKey, cssPatternShowcase } from "./css-patterns";
export type { DieterDotsParams } from "./dieter-dots";
export type { GridPatternsParams } from "./grid-patterns";
export type { NoiseGrainParams } from "./noise-grain";
export type { PaletteFromImageParams } from "./palette-from-image";
export type { PaletteGeneratorParams } from "./palette-generator";
export type { PolkaDotsParams } from "./polka-dots";
export type { StarrySkyParams } from "./starry-sky";
export type { SvgWavesParams } from "./svg-waves";
export type { TailwindPaletteParams } from "./tailwind-palette";
export type { TintsShadesParams } from "./tints-shades";

/** All built-in tools in registration order. */
export const builtInTools: readonly AnyToolDefinition[] = [
  cssGradientTool,
  cssPatternsTool,
  blobTool,
  svgWavesTool,
  polkaDotsTool,
  noiseGrainTool,
  gridPatternsTool,
  confettiTool,
  starrySkyTool,
  dieterDotsTool,
  paletteGeneratorTool,
  tintsShadesTool,
  tailwindPaletteTool,
  paletteFromImageTool,
];

for (const tool of builtInTools) registry.register(tool);
