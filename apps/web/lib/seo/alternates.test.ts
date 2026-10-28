import { describe, expect, it } from "vitest";

import { routeFromPathname, toolEditorPaths, toolSlugs } from "@/i18n/paths";

import { pageAlternates } from "./alternates";
import { FALLBACK_SITE_URL, resolveSiteUrl } from "./site-url";

const base = new URL("https://example.test");

describe("resolveSiteUrl", () => {
  it("uses the env value's origin", () => {
    expect(resolveSiteUrl("https://musterli.example/de/").toString()).toBe(
      "https://musterli.example/",
    );
  });

  it("falls back to the workers.dev URL when unset or invalid", () => {
    expect(resolveSiteUrl(undefined).origin).toBe(FALLBACK_SITE_URL);
    expect(resolveSiteUrl("  ").origin).toBe(FALLBACK_SITE_URL);
    expect(resolveSiteUrl("not a url").origin).toBe(FALLBACK_SITE_URL);
    expect(resolveSiteUrl("javascript:alert(1)").origin).toBe(FALLBACK_SITE_URL);
  });
});

describe("pageAlternates", () => {
  it("links a tool in every locale with x-default and canonical", () => {
    expect(pageAlternates({ page: "tool", toolId: "css-gradient" }, "en", base)).toEqual({
      canonical: "https://example.test/en/tools/css-gradient-generator",
      languages: {
        de: "https://example.test/de/tools/css-verlauf-generator",
        en: "https://example.test/en/tools/css-gradient-generator",
        "x-default": "https://example.test/en/tools/css-gradient-generator",
      },
    });
  });

  it("localizes the converter section and slug", () => {
    const alt = pageAlternates({ page: "converter", converterId: "image-to-base64" }, "de", base);
    expect(alt.canonical).toBe("https://example.test/de/konverter/bild-zu-base64");
    expect(alt.languages).toMatchObject({ en: "https://example.test/en/convert/image-to-base64" });
  });

  it("points x-default at the English page everywhere", () => {
    const home = pageAlternates({ page: "home" }, "de", base);
    expect(home.canonical).toBe("https://example.test/de");
    expect(home.languages).toMatchObject({ "x-default": "https://example.test/en" });
    const landing = pageAlternates({ page: "landing", toolId: "polka-dots" }, "de", base);
    expect(landing.canonical).toBe("https://example.test/de/punktmuster-generator");
    expect(landing.languages).toMatchObject({
      en: "https://example.test/en/polka-dot-pattern-generator",
      "x-default": "https://example.test/en/polka-dot-pattern-generator",
    });
    const category = pageAlternates({ page: "category", category: "backgrounds" }, "de", base);
    expect(category.canonical).toBe("https://example.test/de/tools/kategorie/hintergruende");
    expect(category.languages).toMatchObject({
      "x-default": "https://example.test/en/tools/category/backgrounds",
    });
  });
});

describe("path helpers", () => {
  it("lists a tool's editor paths and slugs per locale", () => {
    expect(toolEditorPaths("svg-waves")).toEqual({
      de: "/de/tools/svg-wellen-generator",
      en: "/en/tools/svg-wave-generator",
    });
    expect(toolSlugs("svg-waves")).toEqual({
      de: "svg-wellen-generator",
      en: "svg-wave-generator",
    });
  });

  it("rebuilds the route from next-intl's template and params", () => {
    expect(
      routeFromPathname("/tools/[toolSlug]", { toolSlug: "punktmuster-generator" }, "de"),
    ).toEqual({ page: "tool", toolId: "polka-dots" });
    expect(
      routeFromPathname("/convert/[converterSlug]", { converterSlug: "svg-zu-css" }, "de"),
    ).toEqual({ page: "converter", converterId: "svg-to-css" });
    expect(routeFromPathname("/convert", {}, "en")).toEqual({ page: "convert" });
    expect(routeFromPathname("/", {}, "en")).toEqual({ page: "home" });
    expect(routeFromPathname("/whatever", {}, "en")).toBeUndefined();
    expect(routeFromPathname("/css-patterns", {}, "de")).toEqual({ page: "patterns" });
    expect(
      routeFromPathname("/css-patterns/[patternSlug]", { patternSlug: "zickzack" }, "de"),
    ).toEqual({ page: "pattern", patternId: "zigzag" });
    expect(routeFromPathname("/de/css-muster/zickzack", {}, "de")).toEqual({
      page: "pattern",
      patternId: "zigzag",
    });
    expect(routeFromPathname("/css-patterns/nope", { patternSlug: "nope" }, "en")).toBeUndefined();
    expect(routeFromPathname("/tools/nope", { toolSlug: "nope" }, "en")).toBeUndefined();
    expect(routeFromPathname("/gradients", {}, "de")).toEqual({ page: "gradients" });
    expect(
      routeFromPathname("/gradients/[gradientSlug]", { gradientSlug: "gletscher" }, "de"),
    ).toEqual({ page: "gradient", gradientId: "glacier" });
    expect(routeFromPathname("/en/color-palettes/lido", {}, "en")).toEqual({
      page: "palette",
      paletteId: "lido",
    });
    expect(routeFromPathname("/de/farbpaletten", {}, "de")).toEqual({ page: "palettes" });
    expect(routeFromPathname("/palettes/nope", { paletteSlug: "nope" }, "en")).toBeUndefined();
  });

  it("accepts the rewritten internal path and the external path", () => {
    const svgToCss = { page: "converter", converterId: "svg-to-css" };
    expect(routeFromPathname("/convert/svg-zu-css", {}, "de")).toEqual(svgToCss);
    expect(routeFromPathname("/de/konverter/svg-zu-css", {}, "de")).toEqual(svgToCss);
    expect(routeFromPathname("/de/konverter", {}, "de")).toEqual({ page: "convert" });
  });

  it("knows the legal pages in every spelling", () => {
    expect(routeFromPathname("/imprint", {}, "de")).toEqual({ page: "imprint" });
    expect(routeFromPathname("/de/impressum", {}, "de")).toEqual({ page: "imprint" });
    expect(routeFromPathname("/en/privacy", {}, "en")).toEqual({ page: "privacy" });
    expect(routeFromPathname("/de/nutzungsbedingungen", {}, "de")).toEqual({ page: "terms" });
    expect(routeFromPathname("/en/terms", {}, "en")).toEqual({ page: "terms" });
    expect(routeFromPathname("/de/datenschutz/x", {}, "de")).toBeUndefined();
  });
});
