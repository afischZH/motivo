import type { ToolCategory } from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";

import { CONVERTER_IDS } from "@/lib/convert/ids";

import { ENABLED_LOCALES } from "./locales";
import { getPathname } from "./navigation-base";
import { routeFromPathname, routeHref, routePath, type AppRoute } from "./paths";
import {
  CATEGORY_SLUGS,
  GRADIENT_SLUGS,
  PALETTE_SLUGS,
  PATTERN_SLUGS,
  TOOL_SLUGS,
  WAITLIST_PAGE_SLUGS,
} from "./slugs";

const routes: AppRoute[] = [
  { page: "home" },
  { page: "tools" },
  { page: "convert" },
  { page: "patterns" },
  { page: "imprint" },
  { page: "privacy" },
  { page: "founders" },
  ...Object.keys(TOOL_SLUGS).flatMap((toolId): AppRoute[] => [
    { page: "landing", toolId },
    { page: "tool", toolId },
  ]),
  ...(Object.keys(CATEGORY_SLUGS) as ToolCategory[]).map((category): AppRoute => ({
    page: "category",
    category,
  })),
  ...CONVERTER_IDS.map((converterId): AppRoute => ({ page: "converter", converterId })),
  ...Object.keys(PATTERN_SLUGS).map((patternId): AppRoute => ({ page: "pattern", patternId })),
  { page: "gradients" },
  { page: "palettes" },
  { page: "myDesigns" },
  ...Object.keys(GRADIENT_SLUGS).map((gradientId): AppRoute => ({ page: "gradient", gradientId })),
  ...Object.keys(PALETTE_SLUGS).map((paletteId): AppRoute => ({ page: "palette", paletteId })),
  ...(Object.keys(WAITLIST_PAGE_SLUGS) as (keyof typeof WAITLIST_PAGE_SLUGS)[]).map(
    (waitlistPage): AppRoute => ({ page: "waitlist", waitlistPage }),
  ),
];

describe("routePath", () => {
  it("matches next-intl's getPathname for every route and locale", () => {
    for (const route of routes) {
      for (const locale of ENABLED_LOCALES) {
        expect(routePath(route, locale), JSON.stringify(route)).toBe(
          getPathname({ href: routeHref(route, locale), locale }),
        );
      }
    }
  });

  it("round-trips through routeFromPathname with real paths (language switch)", () => {
    expect(routePath({ page: "home" }, "de")).toBe("/de");
    const landing: AppRoute = { page: "landing", toolId: "polka-dots" };
    const path = routePath(landing, "de");
    const slug = path.split("/").pop() ?? "";
    expect(routeFromPathname(path, { locale: "de", toolSlug: slug }, "de")).toEqual(landing);
  });
});
