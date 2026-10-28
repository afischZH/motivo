import { SIZE_PRESETS, SIZE_PRESET_GROUPS, builtInTools } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";
import de from "./de.json";
import en from "./en.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const deMessages = flatten(de);
const enMessages = flatten(en);

/** ICU placeholders like {label}, sorted. */
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("editor messages", () => {
  it("DE and EN have the same keys", () => {
    expect([...enMessages.keys()].sort()).toEqual([...deMessages.keys()].sort());
  });

  it("DE and EN use the same placeholders", () => {
    for (const [key, text] of deMessages) {
      expect(placeholders(enMessages.get(key) ?? ""), key).toEqual(placeholders(text));
    }
  });

  it("DE follows Swiss spelling and the no-dash rule", () => {
    for (const [key, text] of deMessages) {
      expect(text, key).not.toMatch(/ß/);
      expect(text, key).not.toMatch(/[–—]/);
      expect(text, key).not.toMatch(/ - /);
    }
  });

  it("labels every extra export of the built-in tools", () => {
    const keys = builtInTools.flatMap((t) => (t.extraExports ?? []).map((e) => e.labelKey));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(enMessages.has(key), key).toBe(true);
      expect(deMessages.has(key), key).toBe(true);
    }
  });

  it("names every common size preset and group", () => {
    for (const p of SIZE_PRESETS) {
      expect(enMessages.has(p.nameKey), p.nameKey).toBe(true);
      expect(deMessages.has(p.nameKey), p.nameKey).toBe(true);
    }
    for (const group of [...SIZE_PRESET_GROUPS, "tool"]) {
      expect(deMessages.has(`Editor.size.groups.${group}`), group).toBe(true);
    }
    // No orphaned names of removed presets.
    const ids = new Set(SIZE_PRESETS.map((p) => p.nameKey));
    expect([...deMessages.keys()].filter((k) => k.startsWith("sizes.") && !ids.has(k))).toEqual([]);
  });

  it("has no empty texts", () => {
    for (const [key, text] of [...deMessages, ...enMessages]) {
      expect(text.trim(), key).not.toBe("");
    }
  });
});
