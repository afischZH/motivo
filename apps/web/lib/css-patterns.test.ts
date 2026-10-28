import { deflateRawSync } from "node:zlib";

import { designFromHash } from "@musterli/editor-ui/share";
import { exportCss, exportSvg } from "@musterli/exporters";
import { createRenderContext, registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import de from "@/messages/de.json";
import en from "@/messages/en.json";

import {
  PATTERN_CATEGORIES,
  PATTERN_TOOL_ID,
  RELATED_PATTERN_COUNT,
  libraryPatterns,
  patternEditorHash,
  patternKeys,
  patternOgParams,
  patternOgSvg,
  patternShowcase,
  relatedPatterns,
} from "./css-patterns";

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

const tool = required(registry.get(PATTERN_TOOL_ID), "css-patterns tool");

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

/** A layer in the single-pattern shape of M2-AP03 (no `visible`). */
const withoutVisible = (layer: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(layer).filter(([key]) => key !== "visible"));

/** A share code as an attacker would craft it: format byte 1 + raw DEFLATE of the JSON. */
function craftedHash(params: Record<string, unknown>): string {
  const json = JSON.stringify([PATTERN_TOOL_ID, 1, 1, 1080, 1080, params]);
  const bytes = Buffer.concat([Buffer.from([1]), deflateRawSync(Buffer.from(json))]);
  return `#d=${bytes.toString("base64url")}`;
}

describe("CSS pattern library pages", () => {
  it("shows exactly what the tool exports (one render path)", () => {
    for (const spec of libraryPatterns()) {
      const showcase = patternShowcase(spec);
      const ctx = createRenderContext(1, { width: 1200, height: 630 });
      expect(exportCss(tool, showcase.params, ctx)).toBe(showcase.css);
      expect(patternOgSvg(spec)).toBe(exportSvg(tool, patternOgParams(spec), ctx));
      expect(showcase.style.backgroundImage).toBe(showcase.declarations.backgroundImage);
    }
  });

  it("opens each pattern in the editor via a share link that decodes to its showcase", () => {
    for (const spec of libraryPatterns()) {
      const hash = patternEditorHash(spec);
      expect(hash.startsWith("#d=")).toBe(true);
      const decoded = designFromHash(hash);
      expect(decoded.ok && decoded.design.params).toEqual(patternShowcase(spec).params);
    }
  });

  it("rejects crafted share links with CSS in a colour or pattern", () => {
    const valid = patternShowcase(required(libraryPatterns()[0], "pattern")).params;
    const layer = required(valid.layers[0], "layer");
    // The single-pattern shape of M2-AP03 links.
    const single = withoutVisible(layer);
    const legacy = { background: valid.background, ...single };
    expect(designFromHash(craftedHash(valid)).ok).toBe(true);
    expect(designFromHash(craftedHash(legacy)).ok).toBe(true);
    const rejected = { ok: false, error: "invalid-params" };
    for (const attack of [
      { color: "#fff;background:url(https://evil.example/leak)" },
      { accent: "red" },
      { pattern: "polka,url(x)" },
    ]) {
      expect(designFromHash(craftedHash({ ...valid, layers: [{ ...layer, ...attack }] }))).toEqual(
        rejected,
      );
      expect(designFromHash(craftedHash({ ...legacy, ...attack }))).toEqual(rejected);
    }
    const background = { background: "#000}body{display:none" };
    expect(designFromHash(craftedHash({ ...valid, ...background }))).toEqual(rejected);
    expect(designFromHash(craftedHash({ ...legacy, ...background }))).toEqual(rejected);
  });

  it("opens old single-pattern links as a stack of one", () => {
    const valid = patternShowcase(required(libraryPatterns()[0], "pattern")).params;
    const single = withoutVisible(required(valid.layers[0], "layer"));
    const decoded = designFromHash(craftedHash({ background: valid.background, ...single }));
    expect(decoded.ok && decoded.design.params).toEqual(valid);
  });

  it("relates patterns of the same category first, never the pattern itself", () => {
    for (const spec of libraryPatterns()) {
      const related = relatedPatterns(spec);
      expect(related).toHaveLength(RELATED_PATTERN_COUNT);
      expect(related).not.toContain(spec);
      expect(related[0]?.category).toBe(spec.category);
      expect(new Set(related).size).toBe(related.length);
    }
  });
});

describe.each(Object.entries({ de, en }))("CSS pattern texts in %s", (_, messages) => {
  it("has a name and description for every pattern", () => {
    for (const spec of libraryPatterns()) {
      const keys = patternKeys(spec);
      for (const key of [keys.name, keys.description, keys.category]) {
        const value = lookup(messages, key);
        expect(typeof value === "string" && value.trim().length > 0, key).toBe(true);
      }
    }
    for (const category of PATTERN_CATEGORIES) {
      expect(typeof lookup(messages, `tools.${PATTERN_TOOL_ID}.categories.${category}`)).toBe(
        "string",
      );
    }
  });

  it("has the same page texts as German", () => {
    const keys = (node: unknown, prefix = ""): string[] =>
      typeof node === "object" && node !== null
        ? Object.entries(node).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(messages.PatternLibrary)).toEqual(keys(de.PatternLibrary));
    expect(keys(messages.PatternPage)).toEqual(keys(de.PatternPage));
  });
});

describe("German CSS pattern copy", () => {
  const texts = [...strings(de.PatternLibrary), ...strings(de.PatternPage)];

  it("uses Swiss spelling (no ß)", () => {
    expect(texts.filter((s) => s.includes("ß"))).toEqual([]);
  });

  it("uses no dashes as punctuation", () => {
    expect(texts.filter((s) => /\s[–—-]\s/.test(s))).toEqual([]);
  });
});
