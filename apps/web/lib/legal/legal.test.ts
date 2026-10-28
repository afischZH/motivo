import { describe, expect, it } from "vitest";

import de from "@/messages/de.json";
import en from "@/messages/en.json";

import { LEGAL_CONFIG, isPlaceholder, legalPagesIndexable, missingOperatorFields } from "./config";
import { LEGAL_SECTIONS, OPERATOR_AFTER, type LegalPageId } from "./sections";

const PAGES = Object.keys(LEGAL_SECTIONS) as LegalPageId[];

describe("legal config", () => {
  it("lists the placeholders the owner still has to fill in", () => {
    expect(isPlaceholder("[Name]")).toBe(true);
    expect(isPlaceholder("Andreas")).toBe(false);
    // Until the owner fills them in, every field is a placeholder.
    if (!LEGAL_CONFIG.legalReviewed) {
      expect(missingOperatorFields()).toEqual(Object.keys(LEGAL_CONFIG.operator));
    }
  });

  it("is noindex until reviewed, and a review needs real operator data", () => {
    expect(legalPagesIndexable({ legalReviewed: false })).toBe(false);
    expect(legalPagesIndexable({ legalReviewed: true })).toBe(true);
    if (LEGAL_CONFIG.legalReviewed) {
      expect(missingOperatorFields().filter((f) => !["registerId", "vatId"].includes(f))).toEqual(
        [],
      );
      expect(isPlaceholder(LEGAL_CONFIG.terms.jurisdiction)).toBe(false);
    }
  });

  it("has an ISO date as last update", () => {
    for (const date of [LEGAL_CONFIG.lastUpdated, LEGAL_CONFIG.terms.lastUpdated]) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(date))).toBe(false);
    }
  });
});

describe.each([
  ["de", de],
  ["en", en],
] as const)("legal texts in %s", (locale, messages) => {
  it.each(PAGES)("%s has every section with a heading and text", (page) => {
    const sections = messages.Legal[page].sections as Record<string, unknown>;
    expect(Object.keys(sections).sort()).toEqual([...LEGAL_SECTIONS[page]].sort());
    for (const id of LEGAL_SECTIONS[page]) {
      const section = sections[id] as { heading: string; paragraphs: string[] };
      expect(section.heading.length, `${page}.${id}`).toBeGreaterThan(0);
      expect(section.paragraphs.length, `${page}.${id}`).toBeGreaterThan(0);
      for (const p of section.paragraphs) expect(p.trim().length).toBeGreaterThan(20);
    }
    const after = OPERATOR_AFTER[page];
    if (typeof after === "string") expect(LEGAL_SECTIONS[page]).toContain(after);
  });

  it("covers the required topics in the privacy policy", () => {
    const text = JSON.stringify(messages.Legal.privacy);
    // IndexedDB: saved designs, drafts and the brand kit (M3-AP03 to AP05).
    for (const term of [
      "Cloudflare",
      "Sentry",
      "localStorage",
      "IndexedDB",
      "Brand Kit",
      "#",
      "EU",
    ]) {
      expect(text).toContain(term);
    }
  });

  it("covers the required topics in the terms of use", () => {
    const { sections } = messages.Legal.terms;
    const text = JSON.stringify(messages.Legal.terms);
    for (const term of ["CC0 1.0", "Ko-fi", "{jurisdiction}", "<privacy>", "<support>"]) {
      expect(text).toContain(term);
    }
    // The free licence for exports is the point of the page.
    expect(sections.exports.paragraphs.join(" ")).toMatch(
      locale === "de" ? /kommerziell/ : /commercially/,
    );
  });

  it("uses only the link tags the legal page renders", () => {
    const text = JSON.stringify(messages.Legal);
    const tags = [...text.matchAll(/<\/?([a-z]+)>/g)].map((m) => m[1]);
    for (const tag of tags) expect(["imprint", "privacy", "support"]).toContain(tag);
  });

  it("describes donations generically and no retired service", () => {
    expect(Object.keys(messages.Legal.privacy.sections)).toContain("donations");
    const text = JSON.stringify(messages.Legal.privacy);
    for (const term of ["Supabase", "Resend", "Turnstile", "Founders", "Lifetime", "Stripe"]) {
      expect(text).not.toContain(term);
    }
  });

  it("follows the house style", () => {
    const text = [messages.Legal, messages.Home, messages.Support, messages.Footer]
      .map((part) => JSON.stringify(part))
      .join("");
    // No dashes as punctuation.
    expect(text).not.toMatch(/\s[–—]\s/);
    if (locale === "de") expect(text).not.toContain("ß");
  });
});
