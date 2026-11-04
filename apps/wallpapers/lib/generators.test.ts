import { createRenderContext } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import de from "../messages/de.json";
import en from "../messages/en.json";
import { WALLPAPER_TOOL_IDS, wallpaperTool } from "./generators";

describe("wallpaper generators", () => {
  it.each(WALLPAPER_TOOL_IDS)("%s renders SVG at phone and ultrawide sizes", (id) => {
    const tool = wallpaperTool(id);
    expect(tool.render.kind).toBe("svg");
    if (tool.render.kind !== "svg") return;
    for (const size of [
      { width: 402, height: 874 },
      { width: 3440, height: 1440 },
    ]) {
      const svg = tool.render.render(tool.defaults, createRenderContext(1, size));
      expect(svg).toMatch(/^<svg[\s>]/);
      expect(svg).toContain(`viewBox="0 0 ${size.width} ${size.height}"`);
    }
  });

  it.each(WALLPAPER_TOOL_IDS)("%s has a name and named looks in DE and EN", (id) => {
    const tool = wallpaperTool(id);
    for (const messages of [de, en]) {
      const entry = (
        messages.Tools as Record<string, { name: string; presets: Record<string, string> }>
      )[id];
      expect(entry?.name).toBeTruthy();
      for (const preset of tool.presets) expect(entry?.presets[preset.id], preset.id).toBeTruthy();
    }
  });
});
