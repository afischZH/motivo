/**
 * Consistency test (M5b-AP02): every registered tool is complete in the
 * sense of CLAUDE.md, "Neues Tool hinzufügen". A new tool fails here (or in
 * one of the suites below) until it is finished; nothing is skipped.
 *
 * Where each checklist point is enforced:
 * - at least 6 presets, unique ids, defaults and presets pass `schema.parse`,
 *   randomize, well-formed output: `describeToolContract`
 *   (packages/tool-registry/src/testing.ts, run for every tool in tools.test.ts)
 * - a snapshot per preset (seed 1): `describePresetSnapshots` in tools.test.ts,
 *   and tool-snapshot-coverage.test.ts (an entry in the snapshot file for each)
 * - i18n keys of name, description, every control label, option, group,
 *   preset name, size preset and bundle in DE and EN, German style:
 *   packages/tool-registry/src/tools/i18n.test.ts; extra export labels:
 *   packages/editor-ui/src/messages/messages.test.ts
 * - SEO texts (whatIs, howTo, 3 to 5 FAQ) in DE and EN: lib/seo/content.test.ts
 * - slug in DE and EN, valid and unique: i18n/slugs.test.ts
 * - sitemap: lib/seo/sitemap.test.ts; catalogue and category pages:
 *   lib/catalogue.test.ts; changelog entry: lib/changelog.test.ts
 *
 * This file adds what no other suite checks: export formats, related
 * tools, parity between the DE and EN texts and the strict dash rule.
 */
import { supportsAnimatedExport, supportsExport } from "@musterli/exporters";
import {
  DEFAULT_CANVAS_SIZE,
  createRenderContext,
  registry,
  type AnyToolDefinition,
  type CssOutput,
  type ExportFormat,
} from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import de from "@/messages/de.json";
import en from "@/messages/en.json";

import { MIN_RELATED_TOOLS, relatedTools } from "./catalogue";
import { faqEntries, toolKeys } from "./seo/tool-content";

/**
 * Formats a tool may list in `exports`, i.e. what the export dialog builds
 * from `exports` today. The others are not declared per tool: GIF follows
 * from `animation`, Tailwind and JSON are extra exports, video and React
 * are not built yet (ROADMAP M5 and M7). Typed as a full record, so a new
 * `ExportFormat` has to be classified here.
 */
const DECLARABLE: Readonly<Record<ExportFormat, boolean>> = {
  png: true,
  jpg: true,
  webp: true,
  svg: true,
  css: true,
  gif: false,
  mp4: false,
  webm: false,
  react: false,
  json: false,
  tailwind: false,
};

const RASTER: readonly ExportFormat[] = ["png", "jpg", "webp"];

/**
 * Tools without JPG, with the reason. JPG cannot store transparency, and
 * these tools exist to make transparent graphics.
 */
const NO_JPG: Readonly<Record<string, string>> = {
  "favicon-generator": "icons need a transparent background; the ICO and PNG files carry alpha",
  "glass-effects": "the card is used over the user's own page, so the image keeps transparency",
  "css-shadow": "the shadow is placed over other content, so the image keeps transparency",
};

/**
 * Tools whose renderer draws a vector preview but that do not offer SVG,
 * with the reason.
 */
const NO_SVG: Readonly<Record<string, string>> = {
  "glass-effects":
    "docs/TOOLS.md J3: backdrop blur has no SVG equivalent; the preview only approximates it, the product is the code",
};

const MESSAGES = { de, en } as const;

function lookup(messages: unknown, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const strings = (node: unknown): string[] =>
  typeof node === "string"
    ? [node]
    : typeof node === "object" && node !== null
      ? Object.values(node).flatMap(strings)
      : [];

/** Defaults and every preset, with the seed the preset pins (default 1). */
function paramSets(tool: AnyToolDefinition): { name: string; params: Record<string, unknown> }[] {
  return [
    { name: "defaults", params: tool.defaults },
    ...tool.presets.map((p) => ({ name: `preset ${p.id}`, params: p.params })),
  ];
}

/** The formats offered for one param set (`exportsFor`, or all of `exports`). */
function offered(
  tool: AnyToolDefinition,
  params: Record<string, unknown>,
): readonly ExportFormat[] {
  return tool.exportsFor?.(tool.schema.parse(params)) ?? tool.exports;
}

/** The preview SVG of a css tool for one param set. */
function cssPreview(tool: AnyToolDefinition, params: Record<string, unknown>): string | undefined {
  if (tool.render.kind !== "css") return undefined;
  const ctx = createRenderContext(1, tool.defaultSize ?? DEFAULT_CANVAS_SIZE);
  const out: CssOutput = tool.render.render(tool.schema.parse(params), ctx);
  return out.previewSvg;
}

/** Whether the renderer produces vector output (SVG) at all. */
function drawsVectors(tool: AnyToolDefinition): boolean {
  switch (tool.render.kind) {
    case "svg":
      return true;
    case "css":
      return cssPreview(tool, tool.defaults) !== undefined;
    case "image-effect":
      return tool.render.vector !== undefined;
    default:
      return false;
  }
}

/** Em dash anywhere, en dash except in number ranges ("3–5"). */
const DASH_PUNCTUATION = /—|(?<!\d)–|–(?!\d)/;

describe.each(registry.list().map((t) => [t.id, t] as const))("tool %s", (id, tool) => {
  describe("exports", () => {
    it("declares only formats the export dialog builds from `exports`", () => {
      expect(tool.exports.filter((f) => !DECLARABLE[f])).toEqual([]);
    });

    it("declares only formats its render kind can produce", () => {
      expect(tool.exports.filter((f) => !supportsExport(tool, f))).toEqual([]);
    });

    it("offers PNG (every tool is visual)", () => {
      expect(tool.exports).toContain("png");
    });

    it("offers PNG, JPG and WebP, or documents why not", () => {
      const missing = RASTER.filter((f) => !tool.exports.includes(f));
      expect(missing).toEqual(NO_JPG[id] === undefined ? [] : ["jpg"]);
    });

    it("offers SVG when it draws vectors, or documents why not", () => {
      expect(tool.exports.includes("svg")).toBe(drawsVectors(tool) && NO_SVG[id] === undefined);
    });

    it("offers a raster format next to SVG", () => {
      const raster = RASTER.some((f) => tool.exports.includes(f));
      expect(!tool.exports.includes("svg") || raster).toBe(true);
    });

    it("narrows `exportsFor` within `exports` and keeps code when images drop out", () => {
      for (const { name, params } of paramSets(tool)) {
        const formats = offered(tool, params);
        expect(
          formats.filter((f) => !tool.exports.includes(f)),
          name,
        ).toEqual([]);
        if (formats.length === 0) expect(tool.extraExports?.length ?? 0, name).toBeGreaterThan(0);
      }
    });

    it("renders the preview SVG that SVG and image exports of a css tool need", () => {
      const lacking = paramSets(tool).filter(
        ({ params }) =>
          tool.render.kind === "css" &&
          offered(tool, params).some((f) => f !== "css") &&
          cssPreview(tool, params) === undefined,
      );
      expect(lacking.map((p) => p.name)).toEqual([]);
    });

    it("gives extra exports ids that do not shadow a declared format", () => {
      const ids = (tool.extraExports ?? []).map((e) => e.id);
      expect(ids.filter((x) => (tool.exports as readonly string[]).includes(x))).toEqual([]);
    });

    it("can export the GIF its `animation` opts into", () => {
      expect(tool.animation === undefined || supportsAnimatedExport(tool)).toBe(true);
    });
  });

  it(`links at least ${MIN_RELATED_TOOLS} related tools`, () => {
    expect(relatedTools(tool).length).toBeGreaterThanOrEqual(MIN_RELATED_TOOLS);
  });

  describe("texts", () => {
    it.each(Object.entries(MESSAGES))("names every preset differently in %s", (_, messages) => {
      const names = tool.presets.map((p) => lookup(messages, p.nameKey));
      expect(new Set(names).size).toBe(names.length);
    });

    it("has as many FAQ entries in DE as in EN", () => {
      const faq = toolKeys(id).faq;
      expect(faqEntries(lookup(de, faq)).length).toBe(faqEntries(lookup(en, faq)).length);
    });

    it("translates the SEO texts (DE differs from EN)", () => {
      for (const key of [toolKeys(id).whatIs, toolKeys(id).howTo]) {
        expect(lookup(de, key), key).not.toBe(lookup(en, key));
      }
    });

    it("uses no em or en dash as punctuation in German", () => {
      const texts = strings(lookup(de, `tools.${id}`));
      expect(texts.filter((s) => DASH_PUNCTUATION.test(s))).toEqual([]);
    });
  });
});
