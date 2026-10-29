/**
 * M2-AP08: SEO landing pages, catalogue, category pages, sitemap, robots,
 * structured data, OG images and the noindex rule for non-production hosts.
 */
import AxeBuilder from "@axe-core/playwright";
import { builtInTools } from "@musterli/tool-registry";
import { expect, test, type Page } from "@playwright/test";

import { ENABLED_LOCALES } from "../i18n/locales";
import { toolSlug } from "../i18n/slugs";
import { FALLBACK_SITE_URL, resolveSiteUrl } from "../lib/seo/site-url";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const SITE = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL);

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => {
    const data = JSON.parse(text) as Record<string, unknown> | Record<string, unknown>[];
    return Array.isArray(data) ? data : [data];
  });
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe("tool landing page", () => {
  test("has the content frame, CTA, presets and structured data", async ({ page }) => {
    const response = await page.goto("/de/punktmuster-generator");
    expect(response?.status()).toBe(200);
    // German name on German pages, the English search term as an alias.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Punktmuster (Polka Dots)");
    await expect(page).toHaveTitle("Punktmuster (Polka Dots) online | Musterli");
    await expect(page.getByRole("link", { name: "Generator öffnen" })).toHaveAttribute(
      "href",
      "/de/tools/punktmuster-generator",
    );
    for (const heading of [
      "Worum geht’s?",
      "Wofür du es brauchst",
      "So geht’s",
      "Tipps",
      "Häufige Fragen",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    }
    const useCases = page.getByRole("region", { name: "Wofür du es brauchst" });
    await expect(useCases.getByRole("heading", { level: 3 })).toHaveCount(3);
    await expect(page.getByRole("region", { name: "Tipps" }).getByRole("listitem")).toHaveCount(3);
    // Preview image is served as a static SVG and has an alt text.
    const preview = page.getByRole("img", { name: /Beispielmotiv/ });
    await expect(preview).toHaveAttribute("src", "/motifs/polka-dots/default.svg");
    expect((await page.request.get("/motifs/polka-dots/default.svg")).status()).toBe(200);

    const types = (await jsonLd(page)).map((d) => d["@type"]);
    expect(types).toEqual(expect.arrayContaining(["WebApplication", "FAQPage", "BreadcrumbList"]));
    const app = (await jsonLd(page)).find((d) => d["@type"] === "WebApplication");
    expect(app).toMatchObject({ offers: { price: "0" }, isAccessibleForFree: true });
    expect(app).not.toHaveProperty("aggregateRating");
  });

  test("opens a preset in the editor", async ({ page }) => {
    await page.goto("/en/blob-generator");
    const preset = page.getByRole("link", { name: "Lava, open in the editor" });
    await expect(preset).toHaveAttribute("href", /^\/en\/tools\/blob-generator#d=[\w-]+$/);
    await preset.click();
    await expect(page).toHaveURL(/\/en\/tools\/blob-generator#d=/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blob Generator");
    // The editor recognises the preset from the shared design.
    await expect(page.getByRole("button", { name: "Lava" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("links an OG image that exists", async ({ page, request }) => {
    await page.goto("/en/svg-wave-generator");
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toBe(new URL("/og/en/svg-waves.png", SITE).toString());
    const image = await request.get(new URL(og ?? "").pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
  });

  test("exists for every registered tool in every locale", async ({ request }) => {
    for (const tool of builtInTools) {
      for (const path of ENABLED_LOCALES.map((l) => `/${l}/${toolSlug(tool.id, l)}`)) {
        expect((await request.get(path)).status(), path).toBe(200);
      }
    }
  });

  test("unknown slugs are 404", async ({ page }) => {
    expect((await page.goto("/en/no-such-generator"))?.status()).toBe(404);
  });

  test("has no axe violations", async ({ page }) => {
    await page.goto("/en/css-gradient-generator");
    await expectNoAxeViolations(page);
  });

  test("has no axe violations in German with the new sections", async ({ page }) => {
    await page.goto("/de/punktmuster-generator");
    await expect(page.getByRole("heading", { level: 2, name: "Tipps" })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("catalogue and categories", () => {
  test("the catalogue groups tools by category", async ({ page }) => {
    await page.goto("/de/tools");
    const nav = page.getByRole("navigation", { name: "Kategorien" });
    await expect(nav.getByRole("link", { name: "Farben" })).toHaveAttribute("href", "#colors");
    await expect(page.getByRole("heading", { level: 2, name: /^Farben/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Konverter" })).toBeVisible();
    await page.getByRole("link", { name: "Blob-Generator", exact: true }).click();
    await expect(page).toHaveURL(/\/de\/blob-generator$/);
  });

  test("a category page lists its tools", async ({ page }) => {
    const response = await page.goto("/en/tools/category/colors");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Colors");
    const colorTools = builtInTools.filter((t) => t.category.includes("colors"));
    await expect(page.getByRole("main").getByRole("article")).toHaveCount(colorTools.length);
    const crumbs = (await jsonLd(page)).find((d) => d["@type"] === "BreadcrumbList");
    expect(crumbs).toBeDefined();
  });

  test("the catalogue has no axe violations", async ({ page }) => {
    await page.goto("/en/tools");
    await expectNoAxeViolations(page);
  });

  test("a category page has no axe violations", async ({ page }) => {
    await page.goto("/de/tools/kategorie/hintergruende");
    await expectNoAxeViolations(page);
  });
});

test.describe("converter pages", () => {
  test("carry structured data", async ({ page }) => {
    await page.goto("/de/konverter/svg-zu-css");
    const types = (await jsonLd(page)).map((d) => d["@type"]);
    expect(types).toEqual(["WebApplication", "FAQPage", "BreadcrumbList"]);
  });
});

test.describe("sitemap and robots", () => {
  test("sitemap.xml lists landing pages with hreflang alternates", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const xml = await response.text();
    const de = new URL("/de/punktmuster-generator", SITE).toString();
    const en = new URL("/en/polka-dot-pattern-generator", SITE).toString();
    expect(xml).toContain(`<loc>${de}</loc>`);
    expect(xml).toContain(`hreflang="x-default" href="${en}"`);
    expect(xml).toContain(new URL("/en/tools/category/colors", SITE).toString());
    // Image sitemap: OG image and preview motif of the landing page.
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toContain(
      `<image:loc>${new URL("/og/de/polka-dots.png", SITE).toString()}</image:loc>`,
    );
    expect(xml).toContain(
      `<image:loc>${new URL("/motifs/polka-dots/default.svg", SITE).toString()}</image:loc>`,
    );
    expect((await request.get("/og/de/polka-dots.png")).status()).toBe(200);
  });

  test("robots.txt allows crawling and links the sitemap", async ({ request }) => {
    const text = await (await request.get("/robots.txt")).text();
    expect(text).toContain("Allow: /");
    expect(text).not.toMatch(/Disallow: \/\s*$/m);
    expect(text).toContain(`Sitemap: ${new URL("/sitemap.xml", SITE).toString()}`);
  });
});

test.describe("indexing", () => {
  test("other hosts (previews, localhost) get noindex", async ({ request }) => {
    const response = await request.get("/en/blob-generator");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("the production host is indexable", async ({ request }) => {
    const response = await request.get("/en/blob-generator", {
      headers: { host: SITE.host },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"]).toBeUndefined();
  });
});
