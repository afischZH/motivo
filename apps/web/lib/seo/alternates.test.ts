import { describe, expect, it } from "vitest";

import { routeFromPathname, toolEditorPaths, toolSlugs } from "@/i18n/paths";

import { pageAlternates } from "./alternates";
import { FALLBACK_SITE_URL, resolveSiteUrl } from "./site-url";

const base = new URL("https://example.test");

describe("resolveSiteUrl", () => {
  it("uses the env value's origin", () => {
    expect(resolveSiteUrl("https://motivo.example/de/").toString()).toBe("https://motivo.example/");
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
        "x-default": "https://example.test/de/tools/css-verlauf-generator",
      },
    });
  });

  it("localizes the converter section and slug", () => {
    const alt = pageAlternates({ page: "converter", converterId: "image-to-base64" }, "de", base);
    expect(alt.canonical).toBe("https://example.test/de/konverter/bild-zu-base64");
    expect(alt.languages).toMatchObject({ en: "https://example.test/en/convert/image-to-base64" });
  });

  it("points the home page's x-default at the language-detecting root", () => {
    const alt = pageAlternates({ page: "home" }, "de", base);
    expect(alt.canonical).toBe("https://example.test/de");
    expect(alt.languages).toMatchObject({ "x-default": "https://example.test/" });
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
    expect(routeFromPathname("/tools/nope", { toolSlug: "nope" }, "en")).toBeUndefined();
  });

  it("accepts the rewritten internal path and the external path", () => {
    const svgToCss = { page: "converter", converterId: "svg-to-css" };
    expect(routeFromPathname("/convert/svg-zu-css", {}, "de")).toEqual(svgToCss);
    expect(routeFromPathname("/de/konverter/svg-zu-css", {}, "de")).toEqual(svgToCss);
    expect(routeFromPathname("/de/konverter", {}, "de")).toEqual({ page: "convert" });
  });
});
