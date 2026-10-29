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

import {
  FAQ_MAX,
  FAQ_MIN,
  TIP_COUNT,
  USE_CASE_COUNT,
  faqEntries,
  landingHeading,
  tipEntries,
  toolKeys,
  landingUseCases,
} from "./tool-content";

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

  it.each(registry.list().map((t) => t.id))("tool %s has use cases and tips", (id) => {
    const keys = toolKeys(id);
    const useCases = landingUseCases(lookup(messages, keys.useCases));
    expect(useCases, keys.useCases).toHaveLength(USE_CASE_COUNT);
    expect(Object.keys(lookup(messages, keys.useCases) as object)).toHaveLength(USE_CASE_COUNT);
    for (const useCase of useCases) {
      expect(useCase.title.trim()).not.toBe("");
      expect(useCase.text.trim()).not.toBe("");
    }
    const tips = tipEntries(lookup(messages, keys.tips));
    expect(tips, keys.tips).toHaveLength(TIP_COUNT);
    expect(Object.keys(lookup(messages, keys.tips) as object)).toHaveLength(TIP_COUNT);
    for (const tip of tips) expect(tip.trim()).not.toBe("");
    const heading = lookup(messages, `${keys.seo}.heading`);
    if (heading !== undefined) {
      expect(typeof heading).toBe("string");
      // The heading names the tool, it does not replace the name.
      expect(heading as string).toContain(lookup(messages, keys.name) as string);
    }
  });

  it("gives every tool distinct use cases and tips", () => {
    const all = registry
      .list()
      .flatMap((t) => [
        ...landingUseCases(lookup(messages, toolKeys(t.id).useCases)).map((u) => u.text),
        ...tipEntries(lookup(messages, toolKeys(t.id).tips)),
      ]);
    expect(new Set(all).size).toBe(all.length);
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

  // Decision Andreas 2026-10-29: German names on German pages. English
  // terms that are usual in German (Halftone, Bento-Grid, Flow Fields ...)
  // stay; these were replaced and may only appear as an alias in brackets.
  it("uses German tool names instead of the replaced English ones", () => {
    const names = registry.list().map((t) => lookup(de, toolKeys(t.id).name));
    for (const english of [
      "Polka Dots",
      "Grid Patterns",
      "Confetti",
      "Starry Sky",
      "Dieter Dots",
      "Tints",
      "Shades",
      "Noise",
      "Grain",
      "Gradient Map",
    ]) {
      expect(
        names.filter((name) => String(name).includes(english)),
        english,
      ).toEqual([]);
    }
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

describe("landingUseCases, tipEntries and landingHeading", () => {
  it("read entries in numeric order and skip malformed ones", () => {
    expect(
      landingUseCases({
        u10: { title: "J", text: "j" },
        u2: { title: "B", text: "b" },
        u3: { title: "no text" },
        x1: { title: "X", text: "x" },
      }),
    ).toEqual([
      { title: "B", text: "b" },
      { title: "J", text: "j" },
    ]);
    expect(tipEntries({ t2: "second", t1: "first", t3: 3, tip: "no" })).toEqual([
      "first",
      "second",
    ]);
    expect(landingUseCases(undefined)).toEqual([]);
    expect(tipEntries("t1")).toEqual([]);
  });

  it("falls back to the tool name without a heading", () => {
    expect(landingHeading({ heading: "Punktmuster (Polka Dots)" }, "Punktmuster")).toBe(
      "Punktmuster (Polka Dots)",
    );
    expect(landingHeading({ heading: " " }, "Punktmuster")).toBe("Punktmuster");
    expect(landingHeading({}, "Punktmuster")).toBe("Punktmuster");
    expect(landingHeading(undefined, "Punktmuster")).toBe("Punktmuster");
  });
});
