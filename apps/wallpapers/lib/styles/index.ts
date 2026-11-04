import { registry, type AnyToolDefinition } from "@musterli/tool-registry";

import { auroraRibbonsTool } from "./aurora-ribbons";
import { dotGradientTool } from "./dot-gradient";
import { glassOrbsTool } from "./glass-orbs";
import { isoCubesTool } from "./iso-cubes";
import { moireTool } from "./moire";
import { opArtTool } from "./op-art";
import { ridgelinesTool } from "./ridgelines";
import { sunburstTool } from "./sunburst";
import { swissPosterTool } from "./swiss-poster";
import { layeredHillsTool } from "./layered-hills";
import { paperFoldsTool } from "./paper-folds";
import { pixelGradientTool } from "./pixel-gradient";
import { planetTool } from "./planet";
import { retroArcsTool } from "./retro-arcs";

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
];

/**
 * Adds them to this app's copy of the registry (idempotent), so share
 * links, `registry.get` and the exporters treat them like any Musterli tool.
 */
export function registerWallpaperStyles(): void {
  for (const tool of WALLPAPER_ONLY_TOOLS) if (!registry.has(tool.id)) registry.register(tool);
}
