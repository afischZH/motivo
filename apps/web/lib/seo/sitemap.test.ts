import { registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import { ENABLED_LOCALES } from "@/i18n/locales";
import { toolLandingPaths } from "@/i18n/paths";
import { populatedCategories } from "@/lib/catalogue";
import { TASK_IDS } from "@/lib/tasks";
import { CONVERTER_IDS } from "@/lib/convert/ids";
import { collectionItemSlug } from "@/i18n/slugs";
import { curatedGradients } from "@/lib/collections/gradients";
import { curatedPalettes } from "@/lib/collections/palettes";
import { libraryPatterns } from "@/lib/css-patterns";
import { LEGAL_CONFIG } from "@/lib/legal/config";

import { hasStaticMotif } from "./motifs";
import { sitemapEntries, sitemapXml } from "./sitemap";

const base = new URL("https://example.test");

describe("sitemap", () => {
  const entries = sitemapEntries(base);
  const urls = entries.map((e) => e.url);

  it("lists every page once per enabled locale", () => {
    const pages =
      2 +
      1 + // Social media editor landing page
      populatedCategories().length +
      TASK_IDS.length +
      registry.list().length +
      1 +
      libraryPatterns().length +
      1 +
      curatedGradients().length +
      1 +
      curatedPalettes().length +
      1 +
      CONVERTER_IDS.length +
      1 + // Support (donations)
      (LEGAL_CONFIG.legalReviewed ? 3 : 0);
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

  it("lists the OG image and the preview motif of every landing page as images", () => {
    for (const tool of registry.list()) {
      const paths = toolLandingPaths(tool.id);
      for (const locale of ENABLED_LOCALES) {
        const entry = entries.find((e) => e.url === `https://example.test${paths[locale]}`);
        expect(entry?.images, `${tool.id} (${locale})`).toEqual(
          hasStaticMotif(tool)
            ? [
                `https://example.test/og/${locale}/${tool.id}.png`,
                `https://example.test/motifs/${tool.id}/default.svg`,
              ]
            : undefined,
        );
      }
    }
    // Every tool has a static motif today; a new one without must be a deliberate choice.
    expect(entries.filter((e) => e.images).length).toBe(
      registry.list().length * ENABLED_LOCALES.length,
    );
  });

  it("adds images to landing pages only", () => {
    const landing = new Set(
      registry
        .list()
        .flatMap((tool) =>
          Object.values(toolLandingPaths(tool.id)).map((path) => `https://example.test${path}`),
        ),
    );
    for (const entry of entries.filter((e) => !landing.has(e.url))) {
      expect(entry.images, entry.url).toBeUndefined();
    }
  });

  it("lists the support page and nothing of the retired waitlist", () => {
    expect(urls).toContain("https://example.test/de/unterstuetzen");
    expect(urls).toContain("https://example.test/en/support");
    expect(urls.filter((url) => /founders/.test(url))).toEqual([]);
  });

  it("never lists the personal designs page", () => {
    expect(urls.filter((url) => /\/(meine-designs|my-designs)/.test(url))).toEqual([]);
  });

  it("lists the social editor landing page, not the editor itself", () => {
    expect(urls).toContain(new URL("/de/social-media-editor", base).toString());
    expect(urls).toContain(new URL("/en/social-media-editor", base).toString());
    expect(urls.filter((url) => /\/(bearbeiten|edit)$/.test(url))).toEqual([]);
  });

  it("never lists the personal brand kit page", () => {
    expect(urls.filter((url) => /\/brand-kit/.test(url))).toEqual([]);
  });

  it("leaves out the legal pages while they are drafts", () => {
    const legal = urls.filter((url) =>
      /\/(impressum|imprint|datenschutz|privacy|nutzungsbedingungen|terms)$/.test(url),
    );
    expect(legal).toHaveLength(LEGAL_CONFIG.legalReviewed ? 6 : 0);
  });

  it("uses absolute URLs on the site's origin only", () => {
    for (const url of urls) expect(new URL(url).origin).toBe("https://example.test");
    expect(urls).toContain("https://example.test/de/tools/kategorie/farben");
    expect(urls).toContain("https://example.test/en/convert/svg-to-css");
  });

  it("contains both collections and every item page with alternates", () => {
    expect(urls).toContain("https://example.test/de/farbverlaeufe");
    expect(urls).toContain("https://example.test/en/color-palettes");
    for (const g of curatedGradients()) {
      expect(urls).toContain(
        `https://example.test/en/gradients/${collectionItemSlug("gradients", g.id, "en")}`,
      );
    }
    for (const p of curatedPalettes()) {
      expect(urls).toContain(
        `https://example.test/de/farbpaletten/${collectionItemSlug("palettes", p.id, "de")}`,
      );
    }
    const glacier = entries.find(
      (e) => e.url === "https://example.test/de/farbverlaeufe/gletscher",
    );
    expect(glacier?.alternates?.languages).toEqual({
      de: "https://example.test/de/farbverlaeufe/gletscher",
      en: "https://example.test/en/gradients/glacier",
      "x-default": "https://example.test/en/gradients/glacier",
    });
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

describe("sitemap XML", () => {
  it("writes every entry with its alternates and images", () => {
    const entries = sitemapEntries(base);
    const out = sitemapXml(entries);
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset ')).toBe(true);
    expect(out).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(out).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(out.match(/<url>/g)).toHaveLength(entries.length);
    expect(out).toContain(
      `<loc>${entries[0]?.url}</loc>\n<xhtml:link rel="alternate" hreflang="de"`,
    );
    expect(out).toContain("<image:image>\n<image:loc>https://example.test/motifs/");
    expect(out.endsWith("</url>\n</urlset>\n")).toBe(true);
  });

  it("escapes XML special characters and leaves out unused namespaces", () => {
    const out = sitemapXml([{ url: "https://example.test/a?b=1&c=<2>" }]);
    expect(out).toContain("<loc>https://example.test/a?b=1&amp;c=&lt;2&gt;</loc>");
    expect(out).not.toContain("xmlns:image");
    expect(out).not.toContain("xmlns:xhtml");
  });
});
