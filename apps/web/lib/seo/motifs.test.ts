import { designFromHash } from "@musterli/editor-ui/share";
import { registry, withoutDerivedParams } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOTIF,
  LANDING_PRESET_COUNT,
  designEditorHash,
  designSvg,
  effectMotifSvg,
  hasStaticMotif,
  landingPresets,
  motifPath,
  staticDesigns,
  staticMotifSvg,
  toolSize,
} from "./motifs";
import { OG_SIZE, ogElement, ogImagePath } from "./og";

const tools = registry.list().filter(hasStaticMotif);

describe("static motifs", () => {
  it.each(tools.map((t) => [t.id, t] as const))(
    "%s renders every design as SVG",
    async (_, tool) => {
      const designs = staticDesigns(tool);
      expect(designs[0]?.id).toBe(DEFAULT_MOTIF);
      expect(designs).toHaveLength(tool.presets.length + 1);
      for (const design of designs) {
        const svg = await staticMotifSvg(tool, design);
        expect(svg?.startsWith("<svg")).toBe(true);
        // Deterministic: the same design renders to the same file.
        expect(await staticMotifSvg(tool, design)).toBe(svg);
      }
    },
    // Image effects encode a PNG per design (twice); slow on a busy CI runner.
    60_000,
  );

  it("wraps image effects as a compressed PNG of the sample", async () => {
    const tool = registry.get("duotone");
    const design = tool && staticDesigns(tool)[0];
    if (!tool || !design) throw new Error("duotone missing");
    expect(designSvg(tool, design)).toBeUndefined();
    const svg = (await effectMotifSvg(tool, design)) ?? "";
    expect(svg).toMatch(
      /^<svg [^>]*viewBox="0 0 1500 1000"><image [^>]*href="data:image\/png;base64,/,
    );
    // Compressed: far below the 480 x 320 x 4 raw bytes.
    expect(svg.length).toBeLessThan(480 * 320 * 4 * 0.6);
  });

  it.each(tools.map((t) => [t.id, t] as const))("%s preset links open the preset", (_, tool) => {
    const presets = landingPresets(tool);
    expect(presets.length).toBe(Math.min(LANDING_PRESET_COUNT, tool.presets.length));
    for (const preset of presets) {
      const hash = designEditorHash(tool, preset);
      const decoded = designFromHash(hash);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) continue;
      expect(decoded.design).toEqual({
        toolId: tool.id,
        // Image-derived params never travel in a link (share codec resets them).
        params: withoutDerivedParams(tool, tool.schema.parse(preset.params)),
        seed: preset.seed,
        size: toolSize(tool),
      });
    }
  });

  it("builds stable public paths", () => {
    expect(motifPath("blob", DEFAULT_MOTIF)).toBe("/motifs/blob/default.svg");
    expect(ogImagePath("blob", "de")).toBe("/og/de/blob.png");
  });
});

describe("ogElement", () => {
  it("embeds the motif and the caption", () => {
    const element = ogElement({ svg: "<svg/>", brand: "Musterli", title: "Blob" });
    const json = JSON.stringify(element);
    expect(json).toContain("data:image/svg+xml;base64,");
    expect(json).toContain('"Blob"');
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });
});
