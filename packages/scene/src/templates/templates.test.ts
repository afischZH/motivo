import { parseToolParams, registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import { libraryFont } from "../fonts";
import { SOCIAL_FORMATS } from "../formats";
import { checkSceneFit } from "../resize";
import { isColorSlot, paletteSchema, sceneSchema, type ColorRef, type Layer } from "../schema";
import { createStubMeasure } from "../text";
import {
  TEMPLATES,
  TEMPLATE_THEMES,
  findTemplate,
  instantiateTemplate,
  templateTextKey,
  type ResolvedBackground,
  type TemplateBackground,
} from "./index";

/** The registry resolution the app does (`resolveTemplateBackground`). */
function background(spec: TemplateBackground): ResolvedBackground | null {
  const tool = registry.get(spec.toolId);
  const preset = tool?.presets.find((p) => p.id === spec.preset);
  if (!tool || !preset) return null;
  const parsed = parseToolParams(tool, { ...(preset.params as object), ...spec.params });
  if (!parsed.success) return null;
  return {
    toolId: tool.id,
    version: tool.version,
    params: parsed.data as Record<string, unknown>,
    seed: spec.seed ?? 1,
  };
}

function colorsOf(layer: Layer): ColorRef[] {
  if (layer.kind === "text") {
    const e = layer.effects;
    return [
      layer.color,
      e.shadow?.color,
      e.stroke?.color,
      e.highlight?.color,
      e.gradient?.from,
      e.gradient?.to,
    ].filter((c): c is ColorRef => c !== undefined);
  }
  if (layer.kind === "shape") {
    return [layer.fill, layer.stroke].filter((c): c is ColorRef => c !== null);
  }
  return [];
}

describe("template library", () => {
  it("has 40 templates with unique ids over all six themes", () => {
    expect(TEMPLATES).toHaveLength(40);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(40);
    for (const theme of TEMPLATE_THEMES) {
      expect(TEMPLATES.filter((t) => t.theme === theme).length, theme).toBeGreaterThanOrEqual(6);
    }
    expect(findTemplate("quote-classic")?.theme).toBe("quote");
    expect(findTemplate("nope")).toBeUndefined();
  });

  it("uses at least six native formats", () => {
    const ids = new Set(SOCIAL_FORMATS.map((f) => f.id));
    for (const t of TEMPLATES) expect(ids.has(t.format), t.id).toBe(true);
    expect(new Set(TEMPLATES.map((t) => t.format)).size).toBeGreaterThanOrEqual(6);
  });

  for (const t of TEMPLATES) {
    describe(t.id, () => {
      it("is a valid scene with its background and placeholders", () => {
        expect(paletteSchema.safeParse(t.palette).success).toBe(true);
        const scene = instantiateTemplate(t, { text: (key) => `Text ${key}`, background });
        const parsed = sceneSchema.safeParse(scene);
        expect(parsed.success, parsed.success ? "" : parsed.error.message).toBe(true);
        expect(scene.layers[0]?.kind).toBe("background");
        expect(scene.format.id).toBe(t.format);
      });

      it("draws texts and shapes only with colour slots of its palette", () => {
        for (const layer of t.layers) {
          for (const ref of colorsOf(layer)) {
            expect(isColorSlot(ref), `${layer.id} ${ref}`).toBe(true);
            expect(Number(ref.slice(6)), `${layer.id} ${ref}`).toBeLessThanOrEqual(
              t.palette.length,
            );
          }
        }
      });

      it("marks its texts as placeholders with a font role and an OFL library font", () => {
        const texts = t.layers.filter((l) => l.kind === "text");
        expect(texts.length).toBeGreaterThanOrEqual(2);
        for (const layer of texts) {
          expect(layer.placeholder, layer.id).toBe(true);
          expect(layer.text, layer.id).toBe("");
          expect(layer.fontRole, layer.id).toBeDefined();
          expect(layer.font?.kind, layer.id).toBe("library");
          expect(libraryFont(layer.font?.id ?? ""), layer.id).toBeDefined();
        }
        expect(texts.some((l) => l.fontRole === "heading")).toBe(true);
      });

      it("has a hidden logo slot inside the canvas", () => {
        const logos = t.layers.filter((l) => l.kind === "logo");
        expect(logos).toHaveLength(1);
        const scene = instantiateTemplate(t, { text: () => "x", background });
        const shown = {
          ...scene,
          layers: scene.layers.map((l) => (l.kind === "logo" ? { ...l, visible: true } : l)),
        };
        const outside = checkSceneFit(shown, createStubMeasure()).filter(
          (p) => p.problem === "outside",
        );
        expect(outside).toEqual([]);
      });

      it("takes its texts from i18n keys of template and layer id", () => {
        const keys: string[] = [];
        instantiateTemplate(t, {
          text: (key) => {
            keys.push(key);
            return key;
          },
          background,
        });
        const texts = t.layers.filter((l) => l.kind === "text");
        expect(keys).toEqual(texts.map((l) => templateTextKey(t, l)));
        expect(keys.every((k) => k.startsWith(`${t.id}.`))).toBe(true);
      });
    });
  }

  it("leaves the background out when the tool cannot be resolved", () => {
    const t = TEMPLATES[0];
    if (!t) throw new Error("no templates");
    const scene = instantiateTemplate(t, { text: () => "x", background: () => null });
    expect(scene.layers.some((l) => l.kind === "background")).toBe(false);
    expect(sceneSchema.safeParse(scene).success).toBe(true);
  });

  it("returns fresh objects (instances never share state with the library)", () => {
    const t = TEMPLATES[0];
    if (!t) throw new Error("no templates");
    const a = instantiateTemplate(t, { text: () => "a", background });
    (a.palette as string[])[0] = "#123456";
    const b = instantiateTemplate(t, { text: () => "b", background });
    expect(b.palette[0]).toBe(t.palette[0]);
    expect(a.layers[1]).not.toBe(t.layers[0]);
  });
});
