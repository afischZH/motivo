import { registry } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";

import { ENABLED_LOCALES } from "@/i18n/locales";
import { toolLandingPaths } from "@/i18n/paths";
import { populatedCategories } from "@/lib/catalogue";
import { CONVERTER_IDS } from "@/lib/convert/ids";
import { libraryPatterns } from "@/lib/css-patterns";

import { sitemapEntries } from "./sitemap";

const base = new URL("https://example.test");

describe("sitemap", () => {
  const entries = sitemapEntries(base);
  const urls = entries.map((e) => e.url);

  it("lists every page once per enabled locale", () => {
    const pages =
      2 +
      populatedCategories().length +
      registry.list().length +
      1 +
      libraryPatterns().length +
      1 +
      CONVERTER_IDS.length;
    expect(entries).toHaveLength(pages * ENABLED_LOCALES.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("contains every tool's landing page in every locale, with alternates", () => {
    for (const tool of registry.list()) {
      const paths = toolLandingPaths(tool.id);
      for (const locale of ENABLED_LOCALES) {
        const entry = entries.find((e) => e.url === `https://example.test${paths[locale]}`);
        expect(entry, `${tool.id} (${locale})`).toBeDefined();
        expect(entry?.alternates?.languages).toEqual({
          de: `https://example.test${paths.de}`,
          en: `https://example.test${paths.en}`,
          "x-default": `https://example.test${paths.en}`,
        });
      }
    }
  });

  it("uses absolute URLs on the site's origin only", () => {
    for (const url of urls) expect(new URL(url).origin).toBe("https://example.test");
    expect(urls).toContain("https://example.test/de/tools/kategorie/farben");
    expect(urls).toContain("https://example.test/en/convert/svg-to-css");
  });

  it("contains the CSS pattern library and every pattern page with alternates", () => {
    expect(urls).toContain("https://example.test/de/css-muster");
    expect(urls).toContain("https://example.test/en/css-patterns");
    const zigzag = entries.find((e) => e.url === "https://example.test/de/css-muster/zickzack");
    expect(zigzag?.alternates?.languages).toEqual({
      de: "https://example.test/de/css-muster/zickzack",
      en: "https://example.test/en/css-patterns/zigzag",
      "x-default": "https://example.test/en/css-patterns/zigzag",
    });
  });
});
