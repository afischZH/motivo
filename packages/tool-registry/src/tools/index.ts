/**
 * Built-in tools, registered in the app-wide registry in catalogue order.
 * Adding a tool = one definition file plus one line here.
 */
import { registry } from "../registry";
import type { AnyToolDefinition } from "../types";
import { blobTool } from "./blob";
import { cssGradientTool } from "./css-gradient";
import { noiseGrainTool } from "./noise-grain";
import { polkaDotsTool } from "./polka-dots";
import { svgWavesTool } from "./svg-waves";

export { blobTool, cssGradientTool, noiseGrainTool, polkaDotsTool, svgWavesTool };
export type { BlobParams } from "./blob";
export type { CssGradientParams } from "./css-gradient";
export type { NoiseGrainParams } from "./noise-grain";
export type { PolkaDotsParams } from "./polka-dots";
export type { SvgWavesParams } from "./svg-waves";

/** All built-in tools in registration order. */
export const builtInTools: readonly AnyToolDefinition[] = [
  cssGradientTool,
  blobTool,
  svgWavesTool,
  polkaDotsTool,
  noiseGrainTool,
];

for (const tool of builtInTools) registry.register(tool);
