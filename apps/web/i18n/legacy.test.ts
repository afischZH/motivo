import { TOOL_CATEGORIES, registry } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";

import { CONVERTER_IDS } from "@/lib/convert/ids";

import { canonicalRedirect } from "./legacy";
import { ENABLED_LOCALES } from "./locales";
import { localizedPaths, type AppRoute } from "./paths";

describe("canonicalRedirect", () => {
  it("redirects M1 tool ids to the localized slug", () => {
    expect(canonicalRedirect("/en/tools/blob")).toBe("/en/tools/blob-generator");
    expect(canonicalRedirect("/de/tools/css-gradient")).toBe("/de/tools/css-verlauf-generator");
  });

  it("redirects another locale's slug and section", () => {
    expect(canonicalRedirect("/en/tools/css-verlauf-generator")).toBe(
      "/en/tools/css-gradient-generator",
    );
    expect(canonicalRedirect("/de/convert/svg-to-css")).toBe("/de/konverter/svg-zu-css");
    expect(canonicalRedirect("/en/konverter/svg-zu-css")).toBe("/en/convert/svg-to-css");
    expect(canonicalRedirect("/de/convert")).toBe("/de/konverter");
    expect(canonicalRedirect("/de/konverter/")).toBeNull();
  });

  it("redirects landing pages to this locale's slug", () => {
    expect(canonicalRedirect("/de/polka-dot-pattern-generator")).toBe("/de/punktmuster-generator");
    expect(canonicalRedirect("/en/blob")).toBe("/en/blob-generator");
    expect(canonicalRedirect("/en/blob-generator")).toBeNull();
    expect(canonicalRedirect("/en/pricing")).toBeNull();
  });

  it("redirects category pages to this locale's segment and slug", () => {
    expect(canonicalRedirect("/en/tools/kategorie/muster")).toBe("/en/tools/category/patterns");
    expect(canonicalRedirect("/de/tools/category/colors")).toBe("/de/tools/kategorie/farben");
    expect(canonicalRedirect("/de/tools/kategorie/farben")).toBeNull();
    expect(canonicalRedirect("/de/tools/kategorie/nope")).toBeNull();
    expect(canonicalRedirect("/de/konverter/kategorie/farben")).toBeNull();
  });

  it("redirects legal pages to this locale's slug", () => {
    expect(canonicalRedirect("/de/imprint")).toBe("/de/impressum");
    expect(canonicalRedirect("/en/datenschutz")).toBe("/en/privacy");
    expect(canonicalRedirect("/de/impressum")).toBeNull();
    expect(canonicalRedirect("/de/impressum/svg-to-css")).toBeNull();
  });

  it("leaves canonical, unknown and unrelated paths alone", () => {
    expect(canonicalRedirect("/en/tools/blob-generator")).toBeNull();
    expect(canonicalRedirect("/de/konverter/svg-zu-css")).toBeNull();
    expect(canonicalRedirect("/en/tools/does-not-exist")).toBeNull();
    expect(canonicalRedirect("/en/tools")).toBeNull();
    expect(canonicalRedirect("/fr/tools/blob")).toBeNull();
    expect(canonicalRedirect("/")).toBeNull();
    expect(canonicalRedirect("/en/tools/blob/extra")).toBeNull();
  });

  it("agrees with next-intl's localized paths for every page", () => {
    const routes: AppRoute[] = [
      { page: "tools" },
      { page: "convert" },
      { page: "imprint" },
      { page: "privacy" },
      ...registry.list().map((t): AppRoute => ({ page: "tool", toolId: t.id })),
      ...registry.list().map((t): AppRoute => ({ page: "landing", toolId: t.id })),
      ...TOOL_CATEGORIES.map((category): AppRoute => ({ page: "category", category })),
      ...CONVERTER_IDS.map((id): AppRoute => ({ page: "converter", converterId: id })),
    ];
    for (const route of routes) {
      const paths = localizedPaths(route);
      for (const locale of ENABLED_LOCALES) {
        expect(canonicalRedirect(paths[locale])).toBeNull();
        for (const other of ENABLED_LOCALES) {
          // The other locale's path, re-prefixed with this locale.
          const foreign = paths[other].replace(`/${other}/`, `/${locale}/`);
          expect([null, paths[locale]]).toContain(canonicalRedirect(foreign));
        }
      }
    }
  });
});
