/**
 * Built-in tools, registered in the app-wide registry in catalogue order.
 * Adding a tool = one definition file plus one line here.
 */
import { registry } from "../registry";
import type { AnyToolDefinition } from "../types";
import { blobTool } from "./blob";
import { blobCompositionTool } from "./blob-composition";
import { blurryGradientTool } from "./blurry-gradient";
import { confettiTool } from "./confetti";
import { cssGradientTool } from "./css-gradient";
import { cssPatternsTool } from "./css-patterns";
import { dieterDotsTool } from "./dieter-dots";
import { doodlesTool } from "./doodles";
import { gridPatternsTool } from "./grid-patterns";
import { meshGradientTool } from "./mesh-gradient";
import { noiseGrainTool } from "./noise-grain";
import { paletteFromImageTool } from "./palette-from-image";
import { paletteGeneratorTool } from "./palette-generator";
import { polkaDotsTool } from "./polka-dots";
import { starrySkyTool } from "./starry-sky";
import { stripedGradientTool } from "./striped-gradient";
import { svgChartsTool } from "./svg-charts";
import { svgWavesTool } from "./svg-waves";
import { tailwindPaletteTool } from "./tailwind-palette";
import { tintsShadesTool } from "./tints-shades";

export {
  blobTool,
  blobCompositionTool,
  blurryGradientTool,
  confettiTool,
  cssGradientTool,
  cssPatternsTool,
  dieterDotsTool,
  doodlesTool,
  gridPatternsTool,
  meshGradientTool,
  noiseGrainTool,
  paletteFromImageTool,
  paletteGeneratorTool,
  polkaDotsTool,
  starrySkyTool,
  stripedGradientTool,
  svgChartsTool,
  svgWavesTool,
  tailwindPaletteTool,
  tintsShadesTool,
};
export type { BlobParams } from "./blob";
export type { BlobCompositionBlob, BlobCompositionParams } from "./blob-composition";
export type { BlurryGradientParams } from "./blurry-gradient";
export type { ConfettiParams } from "./confetti";
export type { CssGradientParams } from "./css-gradient";
export type { CssPatternsParams } from "./css-patterns";
export { cssPatternDescriptionKey, cssPatternNameKey, cssPatternShowcase } from "./css-patterns";
export type { DieterDotsParams } from "./dieter-dots";
export type { DoodlesParams } from "./doodles";
export type { GridPatternsParams } from "./grid-patterns";
export type { MeshGradientParams } from "./mesh-gradient";
export type { NoiseGrainParams } from "./noise-grain";
export type { PaletteFromImageParams } from "./palette-from-image";
export type { PaletteGeneratorParams } from "./palette-generator";
export type { PolkaDotsParams } from "./polka-dots";
export type { StarrySkyParams } from "./starry-sky";
export type { StripedGradientParams } from "./striped-gradient";
export type { SvgChartsParams } from "./svg-charts";
export type { SvgWavesParams } from "./svg-waves";
export type { TailwindPaletteParams } from "./tailwind-palette";
export type { TintsShadesParams } from "./tints-shades";

/** All built-in tools in registration order. */
export const builtInTools: readonly AnyToolDefinition[] = [
  cssGradientTool,
  cssPatternsTool,
  blobTool,
  svgWavesTool,
  blobCompositionTool,
  doodlesTool,
  svgChartsTool,
  polkaDotsTool,
  noiseGrainTool,
  gridPatternsTool,
  confettiTool,
  starrySkyTool,
  dieterDotsTool,
  meshGradientTool,
  blurryGradientTool,
  stripedGradientTool,
  paletteGeneratorTool,
  tintsShadesTool,
  tailwindPaletteTool,
  paletteFromImageTool,
];

for (const tool of builtInTools) registry.register(tool);
