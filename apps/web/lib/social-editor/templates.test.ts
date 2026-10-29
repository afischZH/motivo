/**
 * Templates (M6-AP05) with their real texts in both languages:
 *
 *  - every text layer has a DE and an EN sample text, every template a name
 *    and every theme a label;
 *  - the M6 definition of done: every template, put through Magic Resize
 *    into every social format (the six of the roadmap and all others), keeps
 *    every text inside the canvas and inside its box, with the real fitting
 *    logic of `@musterli/scene`. Text is measured by deterministic stubs of
 *    two widths (narrow and wide fonts), so the test runs in Node; the
 *    Chromium spec `social-templates.spec.ts` repeats a sample with the real
 *    fonts and the Konva text engine.
 */
import {
  MAGIC_RESIZE_TEST_FORMATS,
  SOCIAL_FORMATS,
  checkSceneFit,
  createStubMeasure,
  resizeScene,
  sceneFormat,
  sceneSchema,
  type Scene,
} from "@musterli/scene";
import * as library from "@musterli/scene/templates";
import { TEMPLATES, TEMPLATE_THEMES, templateTextKey } from "@musterli/scene/templates";
import { describe, expect, it } from "vitest";

import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { resolveTemplateBackground, templateScene } from "./templates";

/** The part of the messages the templates use (both languages have the same keys). */
interface Messages {
  SocialEditor: {
    templates: {
      names: Record<string, string>;
      themes: Record<string, string>;
      texts: Record<string, Record<string, string>>;
    };
  };
}

const LOCALES: Record<string, Messages> = { de, en };

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages.SocialEditor.templates.texts;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

const textOf = (messages: Messages) => (key: string) => lookup(messages, key) ?? "";

/** Narrow (Bebas-like) to wide (Montserrat bold capitals) average advances. */
const MEASURES = { narrow: createStubMeasure(0.5), wide: createStubMeasure(0.64) };

describe("template texts", () => {
  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`has a name, a theme label and every text in ${locale}`, () => {
      const { names, themes } = messages.SocialEditor.templates;
      for (const theme of TEMPLATE_THEMES) expect(themes[theme], theme).toBeTruthy();
      for (const template of TEMPLATES) {
        expect(names[template.id], template.id).toBeTruthy();
        for (const layer of template.layers) {
          if (layer.kind !== "text") continue;
          const key = templateTextKey(template, layer);
          expect(lookup(messages, key)?.trim(), `${locale} ${key}`).toBeTruthy();
        }
      }
      // No texts of templates that no longer exist.
      const ids = new Set(TEMPLATES.map((t) => t.id));
      expect(Object.keys(names).filter((id) => !ids.has(id))).toEqual([]);
      expect(
        Object.keys(messages.SocialEditor.templates.texts).filter((id) => !ids.has(id)),
      ).toEqual([]);
    });
  }

  it("follows the Swiss German rules (no Eszett, no dashes as punctuation)", () => {
    const all = JSON.stringify(de.SocialEditor.templates);
    expect(all).not.toMatch(/ß/);
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/ - /);
  });
});

describe("template backgrounds", () => {
  it("resolve to a valid preset of a background tool", () => {
    for (const template of TEMPLATES) {
      expect(resolveTemplateBackground(template.background), template.id).not.toBeNull();
    }
  });
});

function instantiate(templateId: string, messages: Messages): Scene {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) throw new Error(templateId);
  return library.instantiateTemplate(template, {
    text: textOf(messages),
    background: resolveTemplateBackground,
  });
}

// M6 definition of done: a template in 6 formats via Magic Resize, no text cut off.
describe("templates through Magic Resize", () => {
  const formats = SOCIAL_FORMATS.map((f) => f.id);
  it("covers the six formats of the definition of done", () => {
    for (const id of MAGIC_RESIZE_TEST_FORMATS) expect(formats).toContain(id);
    for (const id of ["square", "portrait", "story", "landscape", "banner", "youtube-thumbnail"]) {
      expect(formats).toContain(id);
    }
  });

  for (const [locale, messages] of Object.entries(LOCALES)) {
    for (const [width, measure] of Object.entries(MEASURES)) {
      it(`fits every template into every format (${locale}, ${width} text)`, () => {
        for (const template of TEMPLATES) {
          const scene = instantiate(template.id, messages);
          expect(sceneSchema.safeParse(scene).success, template.id).toBe(true);
          // As opened in the editor: fitted in its own format.
          const native = templateScene(
            library.instantiateTemplate,
            template,
            textOf(messages),
            measure,
          );
          expect(checkSceneFit(native, measure), `${template.id} native`).toEqual([]);
          for (const format of formats) {
            const out = resizeScene(scene, sceneFormat(format), { measure });
            const label = `${template.id} -> ${format}`;
            expect(sceneSchema.safeParse(out).success, label).toBe(true);
            expect(checkSceneFit(out, measure), label).toEqual([]);
            const short = Math.min(out.format.width, out.format.height);
            for (const layer of out.layers) {
              if (layer.kind !== "text") continue;
              // Still readable: at least 2 % of the short side (10 px on a 500 px banner).
              expect(layer.fontSize, `${label} ${layer.id}`).toBeGreaterThanOrEqual(
                Math.min(10, short * 0.02),
              );
            }
          }
        }
      });
    }
  }

  it("fits every template in its own format as designed (German, average text)", () => {
    for (const template of TEMPLATES) {
      const scene = instantiate(template.id, de);
      expect(checkSceneFit(scene, createStubMeasure()), template.id).toEqual([]);
    }
  });

  it("survives a chain through all formats", () => {
    for (const template of TEMPLATES) {
      let scene = instantiate(template.id, de);
      for (const format of formats) {
        scene = resizeScene(scene, sceneFormat(format), { measure: MEASURES.wide });
        expect(checkSceneFit(scene, MEASURES.wide), `${template.id} ${format}`).toEqual([]);
      }
    }
  });
});
