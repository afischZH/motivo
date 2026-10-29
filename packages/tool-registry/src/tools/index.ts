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
import { seamlessPatternsTool } from "./seamless-patterns";
import { starrySkyTool } from "./starry-sky";
import { stripedGradientTool } from "./striped-gradient";
import { svgChartsTool } from "./svg-charts";
import { svgWavesTool } from "./svg-waves";
import { tailwindPaletteTool } from "./tailwind-palette";
import { tintsShadesTool } from "./tints-shades";
import { glassEffectsTool } from "./glass-effects";
import { bentoGridTool } from "./bento-grid";
import { geometricPatternsTool } from "./geometric-patterns";
import { contrastCheckerTool } from "./contrast-checker";
import { cssShadowTool } from "./css-shadow";
import { guillocheTool } from "./guilloche";
import { topoLinesTool } from "./topo-lines";
import { flowFieldTool } from "./flow-field";
import { lowPolyTool } from "./low-poly";
import { terrazzoTool } from "./terrazzo";
import { screenshotBeautifierTool } from "./screenshot-beautifier";
import { avatarTool } from "./avatar";
import { placeholderImageTool } from "./placeholder-image";
import { animatedGradientTool } from "./animated-gradient";
import { faviconGeneratorTool } from "./favicon-generator";
import { duotoneTool } from "./duotone";
import { asciiArtTool } from "./ascii-art";
import { perspectiveGridTool } from "./perspective-grid";
import { fluidTypeScaleTool } from "./fluid-type-scale";
import { sectionDividerTool } from "./section-divider";
import { ogImageTool } from "./og-image";
import { halftoneTool } from "./halftone";
import { cmykHalftoneTool } from "./cmyk-halftone";
import { ditherTool } from "./dither";
import { shaderGradientTool } from "./shader-gradient";
import { godRaysTool } from "./god-rays";
import { fractalGlassTool } from "./fractal-glass";
import { pixelateTool } from "./pixelate";

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
  seamlessPatternsTool,
  starrySkyTool,
  stripedGradientTool,
  svgChartsTool,
  svgWavesTool,
  tailwindPaletteTool,
  tintsShadesTool,
  glassEffectsTool,
  bentoGridTool,
  geometricPatternsTool,
  contrastCheckerTool,
  cssShadowTool,
  guillocheTool,
  topoLinesTool,
  flowFieldTool,
  lowPolyTool,
  terrazzoTool,
  screenshotBeautifierTool,
  avatarTool,
  placeholderImageTool,
  animatedGradientTool,
  faviconGeneratorTool,
  duotoneTool,
  asciiArtTool,
  perspectiveGridTool,
  halftoneTool,
  cmykHalftoneTool,
  ditherTool,
  shaderGradientTool,
  godRaysTool,
  fractalGlassTool,
  pixelateTool,
  fluidTypeScaleTool,
  sectionDividerTool,
  ogImageTool,
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
export type { SeamlessPatternsParams } from "./seamless-patterns";
export { SEAMLESS_COLOR_MODES } from "./seamless-patterns";
export type { StarrySkyParams } from "./starry-sky";
export type { StripedGradientParams } from "./striped-gradient";
export type { SvgChartsParams } from "./svg-charts";
export type { SvgWavesParams } from "./svg-waves";
export type { TailwindPaletteParams } from "./tailwind-palette";
export type { TintsShadesParams } from "./tints-shades";
export type { GlassEffectsParams } from "./glass-effects";
export type { BentoGridParams } from "./bento-grid";
export type { GeometricPatternsParams, TileOverride, TileValues } from "./geometric-patterns";
export {
  GEOMETRIC_PACKS,
  GEOMETRIC_SHAPES_MAX,
  TILE_OVERRIDES_MAX,
  geometricShapesOf,
  tileOverrideSchema,
  tileOverridesSchema,
} from "./geometric-patterns";
export type { ContrastCheckerParams } from "./contrast-checker";
export { CONTRAST_SUGGESTION_IDS, contrastSuggestions } from "./contrast-checker";
export type { CssShadowParams } from "./css-shadow";
export type { GuillocheParams } from "./guilloche";
export type { TopoLinesParams } from "./topo-lines";
export type { FlowFieldParams } from "./flow-field";
export type { LowPolyParams } from "./low-poly";
export type { TerrazzoParams } from "./terrazzo";
export type { ScreenshotBeautifierParams } from "./screenshot-beautifier";
export type { AvatarParams } from "./avatar";
export { AVATAR_SOURCES, avatarSourceHash, avatarText } from "./avatar";
export type { PlaceholderImageParams } from "./placeholder-image";
export { PLACEHOLDER_LABELS, placeholderLabel } from "./placeholder-image";
export type { AnimatedGradientParams } from "./animated-gradient";
export type { FaviconParams } from "./favicon-generator";
export {
  faviconHeadSnippet,
  faviconManifest,
  faviconSvgFile,
  faviconThemeColor,
  iconPackFiles,
} from "./favicon-generator";
export type { DuotoneParams } from "./duotone";
export { duotoneStops } from "./duotone";
export type { AsciiArtParams } from "./ascii-art";
export { asciiStyle, sampleAsciiGrid } from "./ascii-art";
export type { PerspectiveGridParams } from "./perspective-grid";
export type { FluidTypeScaleParams } from "./fluid-type-scale";
export { fluidCssVariables, fluidStepsOf, fluidVariable } from "./fluid-type-scale";
export type { SectionDividerParams } from "./section-divider";
export { dividerHeightCss } from "./section-divider";
export type { OgImageParams } from "./og-image";
export { OG_BACKDROPS, ogMetaTags } from "./og-image";
export type { HalftoneParams } from "./halftone";
export { HALFTONE_SVG_MAX_SHAPES, halftoneOptions } from "./halftone";
export type { CmykHalftoneParams } from "./cmyk-halftone";
export { CMYK_SVG_MAX_SHAPES, cmykHalftoneOptions, cmykOffsets } from "./cmyk-halftone";
export type { DitherParams, DitherPaletteId } from "./dither";
export {
  DITHER_FIXED_PALETTES,
  DITHER_PALETTES,
  ditherColorMode,
  ditherGrid,
  ditherPalette,
} from "./dither";
export type { ShaderGradientParams } from "./shader-gradient";
export { shaderGradientOptions } from "./shader-gradient";
export type { GodRaysParams } from "./god-rays";
export { godRaysOptions } from "./god-rays";
export type { FractalGlassParams } from "./fractal-glass";
export { fractalGlassOptions } from "./fractal-glass";
export type { PixelateParams } from "./pixelate";
export { PIXELATE_SVG_MAX_SHAPES, pixelateGrid, posterizeOptions } from "./pixelate";

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
  geometricPatternsTool,
  seamlessPatternsTool,
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
  glassEffectsTool,
  bentoGridTool,
  contrastCheckerTool,
  cssShadowTool,
  guillocheTool,
  topoLinesTool,
  flowFieldTool,
  lowPolyTool,
  terrazzoTool,
  screenshotBeautifierTool,
  avatarTool,
  placeholderImageTool,
  animatedGradientTool,
  faviconGeneratorTool,
  duotoneTool,
  asciiArtTool,
  perspectiveGridTool,
  halftoneTool,
  cmykHalftoneTool,
  ditherTool,
  shaderGradientTool,
  godRaysTool,
  fractalGlassTool,
  pixelateTool,
  fluidTypeScaleTool,
  sectionDividerTool,
  ogImageTool,
];

for (const tool of builtInTools) registry.register(tool);
