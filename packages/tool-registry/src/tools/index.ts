/**
 * Built-in tools, registered in the app-wide registry in catalogue order.
 * Adding a tool = one definition file plus one line here.
 */
import { registry } from "../registry";
import type { AnyToolDefinition } from "../types";
import { blobTool } from "./blob";
import { confettiTool } from "./confetti";
import { cssGradientTool } from "./css-gradient";
import { dieterDotsTool } from "./dieter-dots";
import { gridPatternsTool } from "./grid-patterns";
import { polkaDotsTool } from "./polka-dots";
import { starrySkyTool } from "./starry-sky";
import { svgWavesTool } from "./svg-waves";

export {
  blobTool,
  confettiTool,
  cssGradientTool,
  dieterDotsTool,
  gridPatternsTool,
  polkaDotsTool,
  starrySkyTool,
  svgWavesTool,
};
export type { BlobParams } from "./blob";
export type { ConfettiParams } from "./confetti";
export type { CssGradientParams } from "./css-gradient";
export type { DieterDotsParams } from "./dieter-dots";
export type { GridPatternsParams } from "./grid-patterns";
export type { PolkaDotsParams } from "./polka-dots";
export type { StarrySkyParams } from "./starry-sky";
export type { SvgWavesParams } from "./svg-waves";

/** All built-in tools in registration order. */
export const builtInTools: readonly AnyToolDefinition[] = [
  cssGradientTool,
  blobTool,
  svgWavesTool,
  polkaDotsTool,
  gridPatternsTool,
  confettiTool,
  starrySkyTool,
  dieterDotsTool,
];

for (const tool of builtInTools) registry.register(tool);
