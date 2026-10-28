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
    }
  });

  it("has an ISO date as last update", () => {
    expect(LEGAL_CONFIG.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(LEGAL_CONFIG.lastUpdated))).toBe(false);
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
    if (after !== null) expect(LEGAL_SECTIONS[page]).toContain(after);
  });

  it("covers the required topics in the privacy policy", () => {
    const text = JSON.stringify(messages.Legal.privacy);
    for (const term of ["Cloudflare", "Sentry", "localStorage", "#", "EU"]) {
      expect(text).toContain(term);
    }
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
