import { TOOL_CATEGORIES, registry } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";

import { CONVERTER_IDS } from "@/lib/convert/ids";
import { curatedGradients } from "@/lib/collections/gradients";
import { curatedPalettes } from "@/lib/collections/palettes";
import { libraryPatterns } from "@/lib/css-patterns";

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

  it("redirects CSS pattern pages to this locale's section and slug", () => {
    expect(canonicalRedirect("/en/css-muster/zickzack")).toBe("/en/css-patterns/zigzag");
    expect(canonicalRedirect("/de/css-patterns/candy-stripes")).toBe("/de/css-muster/zuckerstange");
    expect(canonicalRedirect("/de/css-muster/zigzag")).toBe("/de/css-muster/zickzack");
    expect(canonicalRedirect("/de/css-patterns")).toBe("/de/css-muster");
    expect(canonicalRedirect("/de/css-muster/zickzack")).toBeNull();
    expect(canonicalRedirect("/de/css-muster/nope")).toBeNull();
  });

  it("redirects gradient and palette pages to this locale's section and slug", () => {
    expect(canonicalRedirect("/en/farbverlaeufe/alpengluehen")).toBe("/en/gradients/alpenglow");
    expect(canonicalRedirect("/de/gradients/alpenglow")).toBe("/de/farbverlaeufe/alpengluehen");
    expect(canonicalRedirect("/de/farbverlaeufe/alpenglow")).toBe("/de/farbverlaeufe/alpengluehen");
    expect(canonicalRedirect("/en/farbpaletten")).toBe("/en/color-palettes");
    expect(canonicalRedirect("/de/color-palettes/clay-oven")).toBe("/de/farbpaletten/lehmofen");
    expect(canonicalRedirect("/de/farbpaletten/lehmofen")).toBeNull();
    expect(canonicalRedirect("/de/farbpaletten/nope")).toBeNull();
    expect(canonicalRedirect("/de/farbpaletten/lehmofen/mehr")).toBeNull();
  });

  it("redirects legal pages to this locale's slug", () => {
    expect(canonicalRedirect("/de/imprint")).toBe("/de/impressum");
    expect(canonicalRedirect("/en/datenschutz")).toBe("/en/privacy");
    expect(canonicalRedirect("/de/impressum")).toBeNull();
    expect(canonicalRedirect("/de/impressum/svg-to-css")).toBeNull();
  });

  it("redirects the support page to this locale's slug", () => {
    expect(canonicalRedirect("/de/support")).toBe("/de/unterstuetzen");
    expect(canonicalRedirect("/en/unterstuetzen")).toBe("/en/support");
    expect(canonicalRedirect("/de/unterstuetzen")).toBeNull();
    expect(canonicalRedirect("/en/support/more")).toBeNull();
  });

  it("sends every path of the retired Founders waitlist to the support page", () => {
    expect(canonicalRedirect("/de/founders-warteliste")).toBe("/de/unterstuetzen");
    expect(canonicalRedirect("/en/founders-waitlist")).toBe("/en/support");
    expect(canonicalRedirect("/en/founders-warteliste/bestaetigt")).toBe("/en/support");
    expect(canonicalRedirect("/de/founders-waitlist/unsubscribe")).toBe("/de/unterstuetzen");
    expect(canonicalRedirect("/de/founders")).toBe("/de/unterstuetzen");
    expect(canonicalRedirect("/fr/founders-waitlist")).toBeNull();
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
      { page: "support" },
      ...registry.list().map((t): AppRoute => ({ page: "tool", toolId: t.id })),
      ...registry.list().map((t): AppRoute => ({ page: "landing", toolId: t.id })),
      ...TOOL_CATEGORIES.map((category): AppRoute => ({ page: "category", category })),
      ...CONVERTER_IDS.map((id): AppRoute => ({ page: "converter", converterId: id })),
      { page: "patterns" },
      ...libraryPatterns().map((p): AppRoute => ({ page: "pattern", patternId: p.id })),
      { page: "gradients" },
      ...curatedGradients().map((g): AppRoute => ({ page: "gradient", gradientId: g.id })),
      { page: "palettes" },
      ...curatedPalettes().map((p): AppRoute => ({ page: "palette", paletteId: p.id })),
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
