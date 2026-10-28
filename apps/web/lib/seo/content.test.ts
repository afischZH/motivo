/**
 * Contract for the SEO pages: every registered tool has finished texts
 * (no placeholders) and 3 to 5 FAQ entries in every enabled locale, every
 * category has a name and description, and the German copy follows the
 * style rules. A new tool fails here until its texts are written.
 */
import { TOOL_CATEGORIES, registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import de from "@/messages/de.json";
import en from "@/messages/en.json";

import { FAQ_MAX, FAQ_MIN, faqEntries, toolKeys } from "./tool-content";

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

describe.each(Object.entries(MESSAGES))("SEO texts in %s", (_, messages) => {
  it.each(registry.list().map((t) => t.id))("tool %s is complete", (id) => {
    const keys = toolKeys(id);
    for (const key of [keys.name, keys.description, keys.whatIs, keys.howTo]) {
      const value = lookup(messages, key);
      expect(typeof value === "string" && value.trim().length > 0, key).toBe(true);
    }
    expect(lookup(messages, `tools.${id}.seo.todo`), "placeholder left").toBeUndefined();
    const faq = faqEntries(lookup(messages, keys.faq));
    expect(faq.length).toBeGreaterThanOrEqual(FAQ_MIN);
    expect(faq.length).toBeLessThanOrEqual(FAQ_MAX);
    for (const entry of faq) {
      expect(entry.question.trim()).not.toBe("");
      expect(entry.answer.trim()).not.toBe("");
    }
  });

  it.each(TOOL_CATEGORIES)("category %s has a name and description", (category) => {
    expect(typeof lookup(messages, `Categories.${category}.name`)).toBe("string");
    expect(typeof lookup(messages, `Categories.${category}.description`)).toBe("string");
  });
});

// Every namespace, not only the SEO ones: home, support, footer and editor
// pages follow the same rules (CLAUDE.md, "Sprache und Stil").
describe("German web copy", () => {
  const texts = strings(de);

  it("uses Swiss spelling (no ß)", () => {
    expect(texts.filter((s) => s.includes("ß"))).toEqual([]);
  });

  it("uses no dashes as punctuation", () => {
    expect(texts.filter((s) => /\s[–—-]\s/.test(s))).toEqual([]);
  });
});

describe("faqEntries", () => {
  it("reads both message shapes in numeric order", () => {
    expect(
      faqEntries({ q2: { question: "B", answer: "b" }, q1: { question: "A", answer: "a" } }),
    ).toEqual([
      { question: "A", answer: "a" },
      { question: "B", answer: "b" },
    ]);
    expect(faqEntries({ q10: "J", a10: "j", q2: "B", a2: "b" })).toEqual([
      { question: "B", answer: "b" },
      { question: "J", answer: "j" },
    ]);
    expect(faqEntries({ q1: "no answer", x: 1 })).toEqual([]);
    expect(faqEntries(undefined)).toEqual([]);
  });
});
