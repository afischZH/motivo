/**
 * Contract for the slug model: every registered tool and every converter has
 * a valid, unique slug in every enabled locale. A new tool only needs an entry
 * in `TOOL_SLUGS`; this test names the ones that are missing.
 */
import { TOOL_CATEGORIES, registry } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";

import { CONVERTER_IDS } from "@/lib/convert/ids";

import { ALL_LOCALES, ENABLED_LOCALES } from "./locales";
import {
  CATEGORY_SEGMENT,
  CATEGORY_SLUGS,
  CONVERTER_SLUGS,
  SECTION_SLUGS,
  SLUG_PATTERN,
  categoryIdFromAnySlug,
  categoryIdFromSlug,
  categorySlug,
  TOOL_SLUGS,
  converterIdFromAnySlug,
  converterIdFromSlug,
  converterSlug,
  sectionFromAnySlug,
  toolIdFromAnySlug,
  toolIdFromSlug,
  toolSlug,
} from "./slugs";

const toolIds = registry.list().map((tool) => tool.id);

/** First path segments that a top-level tool landing slug must never shadow. */
const RESERVED = ["tools", "convert", "api", "app", "pricing", "blog", "changelog", "community"];

describe.each(ENABLED_LOCALES)("slugs in %s", (locale) => {
  it.each(toolIds)("tool %s has a slug", (id) => {
    expect(TOOL_SLUGS[id]?.[locale], `add "${id}" to TOOL_SLUGS in i18n/slugs.ts`).toMatch(
      SLUG_PATTERN,
    );
  });

  it.each(CONVERTER_IDS)("converter %s has a slug", (id) => {
    expect(CONVERTER_SLUGS[id][locale]).toMatch(SLUG_PATTERN);
  });

  it("has unique tool and converter slugs", () => {
    const tools = toolIds.map((id) => toolSlug(id, locale));
    const converters = CONVERTER_IDS.map((id) => converterSlug(id, locale));
    expect(new Set(tools).size).toBe(tools.length);
    expect(new Set(converters).size).toBe(converters.length);
  });

  it("keeps tool slugs clear of reserved and section segments", () => {
    const sections = Object.values(SECTION_SLUGS).flatMap((s) => Object.values(s));
    for (const id of toolIds) {
      expect([...RESERVED, ...sections, ...ENABLED_LOCALES]).not.toContain(toolSlug(id, locale));
    }
  });

  it.each(TOOL_CATEGORIES)("category %s has a unique slug", (category) => {
    expect(CATEGORY_SLUGS[category][locale]).toMatch(SLUG_PATTERN);
    const all = TOOL_CATEGORIES.map((c) => categorySlug(c, locale));
    expect(all.filter((slug) => slug === categorySlug(category, locale))).toHaveLength(1);
    expect(categoryIdFromSlug(categorySlug(category, locale), locale)).toBe(category);
  });

  it("has a category segment that no tool slug uses", () => {
    expect(CATEGORY_SEGMENT[locale]).toMatch(SLUG_PATTERN);
    expect(toolIds.map((id) => toolSlug(id, locale))).not.toContain(CATEGORY_SEGMENT[locale]);
  });

  it("round-trips slugs to ids", () => {
    for (const id of toolIds) expect(toolIdFromSlug(toolSlug(id, locale), locale)).toBe(id);
    for (const id of CONVERTER_IDS) {
      expect(converterIdFromSlug(converterSlug(id, locale), locale)).toBe(id);
    }
  });
});

describe("legal sections", () => {
  it("have the documented localized slugs", () => {
    expect(SECTION_SLUGS.imprint).toEqual({ de: "impressum", en: "imprint" });
    expect(SECTION_SLUGS.privacy).toEqual({ de: "datenschutz", en: "privacy" });
  });

  it.each(ENABLED_LOCALES)("are unique section slugs in %s", (locale) => {
    const all = Object.values(SECTION_SLUGS).map((entry) => entry[locale]);
    for (const slug of all) expect(slug).toMatch(SLUG_PATTERN);
    expect(new Set(all).size).toBe(all.length);
    expect(sectionFromAnySlug(SECTION_SLUGS.imprint[locale])).toBe("imprint");
    expect(sectionFromAnySlug(SECTION_SLUGS.privacy[locale])).toBe("privacy");
  });
});

describe("slug map", () => {
  it("has no entries for unknown tools", () => {
    expect(Object.keys(TOOL_SLUGS).filter((id) => !toolIds.includes(id))).toEqual([]);
  });

  it("has exactly the registry's categories", () => {
    expect(Object.keys(CATEGORY_SLUGS).sort()).toEqual([...TOOL_CATEGORIES].sort());
  });

  it("only uses known locales", () => {
    const entries = [
      ...Object.values(CATEGORY_SLUGS),
      CATEGORY_SEGMENT,
      ...Object.values(TOOL_SLUGS),
      ...Object.values(CONVERTER_SLUGS),
      ...Object.values(SECTION_SLUGS),
    ];
    for (const entry of entries) {
      for (const key of Object.keys(entry)) expect(ALL_LOCALES).toContain(key);
    }
  });

  it("falls back to English for prepared locales and to the id for unknown tools", () => {
    expect(toolSlug("css-gradient", "fr")).toBe(TOOL_SLUGS["css-gradient"]?.en);
    expect(converterSlug("svg-to-css", "it")).toBe("svg-to-css");
    expect(toolSlug("not-a-tool", "de")).toBe("not-a-tool");
  });

  it("resolves any spelling for redirects", () => {
    expect(toolIdFromAnySlug("css-gradient")).toBe("css-gradient");
    expect(toolIdFromAnySlug("css-verlauf-generator")).toBe("css-gradient");
    expect(toolIdFromAnySlug("css-gradient-generator")).toBe("css-gradient");
    expect(toolIdFromAnySlug("nope")).toBeUndefined();
    expect(converterIdFromAnySlug("bild-zu-base64")).toBe("image-to-base64");
    expect(sectionFromAnySlug("konverter")).toBe("convert");
    expect(sectionFromAnySlug("toString")).toBeUndefined();
    expect(categoryIdFromAnySlug("hintergruende")).toBe("backgrounds");
    expect(categoryIdFromAnySlug("colors")).toBe("colors");
    expect(categoryIdFromAnySlug("constructor")).toBeUndefined();
  });
});
