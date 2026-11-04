import { registry, type AnyToolDefinition } from "@musterli/tool-registry";

import { auroraRibbonsTool } from "./aurora-ribbons";
import { dotGradientTool } from "./dot-gradient";
import { dunesTool } from "./dunes";
import { glassOrbsTool } from "./glass-orbs";
import { islandHaloTool } from "./island-halo";
import { isoCubesTool } from "./iso-cubes";
import { moireTool } from "./moire";
import { opArtTool } from "./op-art";
import { ridgelinesTool } from "./ridgelines";
import { silkFoldsTool } from "./silk-folds";
import { sunburstTool } from "./sunburst";
import { swissPosterTool } from "./swiss-poster";
import { layeredHillsTool } from "./layered-hills";
import { liquidGlassTool } from "./liquid-glass";
import { paperFoldsTool } from "./paper-folds";
import { pixelGradientTool } from "./pixel-gradient";
import { planetTool } from "./planet";
import { retroArcsTool } from "./retro-arcs";
import { lightLeaksTool } from "./light-leaks";
import { bokehTool } from "./bokeh";
import { skyGradientTool } from "./sky-gradient";
import { japandiTool } from "./japandi";
import { neoBrutalismTool } from "./neo-brutalism";
import { memphisTool } from "./memphis";
import { halftoneFadeTool } from "./halftone-fade";
import { bitDitherTool } from "./bit-dither";
import { crtTool } from "./crt";
import { bentoTool } from "./bento";

/** Styles made for this app only; Musterli does not have them. */
export const WALLPAPER_ONLY_TOOLS: readonly AnyToolDefinition[] = [
  layeredHillsTool,
  retroArcsTool,
  pixelGradientTool,
  dotGradientTool,
  paperFoldsTool,
  planetTool,
  swissPosterTool,
  auroraRibbonsTool,
  isoCubesTool,
  moireTool,
  sunburstTool,
  glassOrbsTool,
  opArtTool,
  ridgelinesTool,
  liquidGlassTool,
  silkFoldsTool,
  dunesTool,
  islandHaloTool,
  lightLeaksTool,
  bokehTool,
  skyGradientTool,
  japandiTool,
  neoBrutalismTool,
  memphisTool,
  halftoneFadeTool,
  bitDitherTool,
  crtTool,
  bentoTool,
];

/**
 * Adds them to this app's copy of the registry (idempotent), so share
 * links, `registry.get` and the exporters treat them like any Musterli tool.
 */
export function registerWallpaperStyles(): void {
  for (const tool of WALLPAPER_ONLY_TOOLS) if (!registry.has(tool.id)) registry.register(tool);
}
