/**
 * M3-AP09: gradient and palette collections. Overview pages with jump links,
 * one page per item (preview, colour values to copy, code, editor links,
 * structured data, OG image), slug redirects, sitemap and hreflang, axe in
 * light and dark, and no horizontal overflow at 375/768/1280 px.
 */
import AxeBuilder from "@axe-core/playwright";
import { hexToRgb255 } from "@musterli/engine";
import { expect, test, type Page } from "@playwright/test";

import { curatedGradients, findGradient } from "../lib/collections/gradients";
import { curatedPalettes, findPalette } from "../lib/collections/palettes";
import { FALLBACK_SITE_URL, resolveSiteUrl } from "../lib/seo/site-url";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const SITE = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL);

const glacier = findGradient("glacier");
const clayOven = findPalette("clay-oven");
if (!glacier || !clayOven) throw new Error("curated items missing");

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => {
    const data = JSON.parse(text) as Record<string, unknown> | Record<string, unknown>[];
    return Array.isArray(data) ? data : [data];
  });
}

const rgb = (hex: string) => `rgb(${hexToRgb255(hex).join(", ")})`;

/** Overview cards: list items that hold an article. */
const cards = (page: Page) =>
  page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByRole("article") });

test.describe("gradient collection", () => {
  test("lists every gradient by mood and jumps to a group", async ({ page }) => {
    expect((await page.goto("/de/farbverlaeufe"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Farbverläufe");
    await expect(cards(page)).toHaveCount(curatedGradients().length);

    const nav = page.getByRole("navigation", { name: "Nach Stimmung springen" });
    const cool = nav.getByRole("link", { name: /^Kühl/ });
    await cool.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#group-cool$/);
    await expect(page.getByRole("heading", { level: 2, name: "Kühl" })).toBeInViewport();

    const types = (await jsonLd(page)).map((d) => d["@type"]);
    expect(types).toEqual(expect.arrayContaining(["CollectionPage", "BreadcrumbList"]));
    const collection = (await jsonLd(page)).find((d) => d["@type"] === "CollectionPage");
    expect(collection?.mainEntity).toMatchObject({ numberOfItems: curatedGradients().length });

    await page.getByRole("link", { name: "Gletscher", exact: true }).click();
    await expect(page).toHaveURL(/\/de\/farbverlaeufe\/gletscher$/);
  });

  test("has hreflang alternates and an OG image", async ({ page }) => {
    await page.goto("/en/gradients");
    expect(await page.locator('link[rel="alternate"][hreflang="de"]').getAttribute("href")).toBe(
      new URL("/de/farbverlaeufe", SITE).toString(),
    );
    expect(
      await page.locator('link[rel="alternate"][hreflang="x-default"]').getAttribute("href"),
    ).toBe(new URL("/en/gradients", SITE).toString());
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect((await page.request.get(new URL(og ?? "").pathname)).status()).toBe(200);
  });
});

test.describe("gradient page", () => {
  test("shows the preview, colours, code, variants and structured data", async ({
    page,
    request,
  }) => {
    expect((await page.goto("/en/gradients/glacier"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Glacier gradient");

    // The preview is the real CSS (an inline style), not an image file.
    const preview = page.getByRole("img", { name: "Preview of the Glacier gradient" });
    const image = await preview.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(image).toMatch(/^linear-gradient\(/);
    expect(image).toContain(rgb(glacier.colors[0] ?? ""));

    await expect(page.locator("pre").first()).toContainText(
      "background-image: linear-gradient(180deg",
    );
    await expect(page.locator("pre").first()).toContainText("in oklch");
    for (const hex of glacier.colors) {
      await expect(page.getByRole("button", { name: `Copy HEX ${hex}` })).toBeVisible();
    }

    const crumbs = (await jsonLd(page)).find((d) => d["@type"] === "BreadcrumbList");
    expect(crumbs?.itemListElement).toHaveLength(3);
    expect(await page.locator('link[rel="alternate"][hreflang="de"]').getAttribute("href")).toBe(
      new URL("/de/farbverlaeufe/gletscher", SITE).toString(),
    );
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(
      new URL("/en/gradients/glacier", SITE).toString(),
    );

    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toBe(new URL("/og/en/gradients/glacier.png", SITE).toString());
    const png = await request.get(new URL(og ?? "").pathname);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");

    // Variant thumbnails are static SVG files.
    const variants = page.getByRole("region", { name: "Take the gradient further" });
    const mesh = variants.getByRole("link", { name: "Open in Mesh Gradient" });
    await expect(mesh).toHaveAttribute("href", /^\/en\/tools\/mesh-gradient-generator#d=[\w-]+$/);
    const thumbs = variants.locator("img");
    await expect(thumbs).toHaveCount(3);
    const src = await thumbs.first().getAttribute("src");
    expect(src).toBe("/motifs/mesh-gradient/gradient-glacier.svg");
    const svg = await request.get(src ?? "");
    expect(svg.status()).toBe(200);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  });

  test("copies a colour value and the CSS", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/de/farbverlaeufe/gletscher");
    const hex = glacier.colors[1] ?? "";
    const button = page.getByRole("button", { name: `HEX ${hex} kopieren` });
    await button.click();
    await expect(page.getByRole("status").filter({ hasText: "Kopiert" }).first()).toHaveText(
      "Kopiert",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(hex);

    await page.getByRole("button", { name: "CSS kopieren" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /^background-color: #[0-9a-f]{6};\nbackground-image: linear-gradient\(180deg, /,
    );
  });

  test("opens the gradient in the editor with its colours", async ({ page }) => {
    await page.goto("/en/gradients/glacier");
    await page.getByRole("link", { name: "Customize in the editor" }).click();
    await expect(page).toHaveURL(/\/en\/tools\/css-gradient-generator#d=/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSS Gradient");
    await expect(page.getByTestId("shell-notice")).toHaveCount(0);
    const preview = page.getByTestId("preview").locator(":scope > div[aria-hidden='true'] > div");
    await expect
      .poll(() => preview.evaluate((el) => getComputedStyle(el).backgroundImage))
      .toContain(rgb(glacier.colors[0] ?? ""));
  });

  test("redirects other locales' slugs and ids", async ({ page }) => {
    await page.goto("/en/farbverlaeufe/gletscher");
    await expect(page).toHaveURL(/\/en\/gradients\/glacier$/);
    await page.goto("/de/gradients/dawn-gray");
    await expect(page).toHaveURL(/\/de\/farbverlaeufe\/morgengrau$/);
    expect((await page.request.get("/de/farbverlaeufe/gibts-nicht")).status()).toBe(404);
  });
});

test.describe("palette collection", () => {
  test("lists every palette and links to its page", async ({ page }) => {
    expect((await page.goto("/en/color-palettes"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Color palettes");
    await expect(cards(page)).toHaveCount(curatedPalettes().length);
    await page.getByRole("link", { name: "Clay Oven", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/color-palettes\/clay-oven$/);
  });
});

test.describe("palette page", () => {
  test("shows swatches with values, code and links into the tools", async ({ page }) => {
    expect((await page.goto("/de/farbpaletten/lehmofen"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Farbpalette Lehmofen");
    await expect(
      page.getByRole("img", { name: "Die 5 Farben der Palette Lehmofen" }),
    ).toBeVisible();

    const colors = page.getByRole("region", { name: "Farben" }).getByRole("listitem");
    await expect(colors).toHaveCount(clayOven.colors.length);
    await expect(colors.first().getByRole("button", { name: /^OKLCH oklch\(/ })).toBeVisible();
    await expect(colors.first()).toContainText(/Kontrast \d+\.\d:1/);

    await expect(page.locator("pre").first()).toContainText(
      `--palette-1: ${clayOven.colors[0] ?? ""};`,
    );
    await expect(page.locator("pre").nth(1)).toContainText("--color-clay-oven-1: oklch(");

    for (const [name, slug] of [
      ["Mesh-Verlauf öffnen", "mesh-verlauf-generator"],
      ["Tints & Shades öffnen", "farbabstufungen-generator"],
      ["Tailwind-Farbpalette öffnen", "tailwind-farbpalette-generator"],
    ] as const) {
      await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute(
        "href",
        new RegExp(`^/de/tools/${slug}#d=[\\w-]+$`),
      );
    }
  });

  test("opens the palette in the palette generator", async ({ page }) => {
    await page.goto("/de/farbpaletten/lehmofen");
    await page.getByRole("link", { name: "Im Palettengenerator öffnen" }).click();
    await expect(page).toHaveURL(/\/de\/tools\/farbpaletten-generator#d=/);
    // The server HTML previews the tool defaults; the editor loads the #d=
    // design on hydration (Share is enabled from then on), and the preview
    // follows as a deferred render. Wait for both before reading it.
    await expect(page.getByRole("button", { name: "Teilen" })).toBeEnabled();
    await expect(page.getByTestId("shell-notice")).toHaveCount(0);
    // The preview is the tool's SVG as a data URL; it carries the palette's colours.
    const motif = page.getByTestId("preview").locator("img");
    const previewSvg = async () => {
      const src = (await motif.getAttribute("src")) ?? "";
      if (!src.startsWith("data:image/svg+xml")) return "";
      const body = src.slice(src.indexOf(",") + 1);
      const svg = src.includes(";base64,")
        ? Buffer.from(body, "base64").toString("utf8")
        : decodeURIComponent(body);
      return svg.toLowerCase();
    };
    await expect
      .poll(
        async () => {
          const svg = await previewSvg();
          return clayOven.colors.filter((hex) => !svg.includes(hex));
        },
        { message: "palette colours missing from the preview" },
      )
      .toEqual([]);
  });

  test("copies an RGB value", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/en/color-palettes/clay-oven");
    const value = `rgb(${hexToRgb255(clayOven.colors[2] ?? "").join(", ")})`;
    await page.getByRole("button", { name: `Copy RGB ${value}` }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  });
});

test.describe("collections in the site", () => {
  test("are listed in the sitemap", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain(new URL("/de/farbverlaeufe", SITE).toString());
    expect(xml).toContain(new URL("/en/gradients/glacier", SITE).toString());
    expect(xml).toContain(new URL("/de/farbpaletten/lehmofen", SITE).toString());
    expect(xml).toContain(new URL("/en/color-palettes", SITE).toString());
  });

  test("are linked from the footer, category pages and tool landing pages", async ({ page }) => {
    await page.goto("/de/tools/kategorie/verlaeufe");
    await expect(page.getByRole("link", { name: "Zur Verlaufssammlung" })).toHaveAttribute(
      "href",
      "/de/farbverlaeufe",
    );
    await page.goto("/en/color-palette-generator");
    await expect(page.getByRole("link", { name: "Browse the palette collection" })).toHaveAttribute(
      "href",
      "/en/color-palettes",
    );
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Gradients" })).toHaveAttribute(
      "href",
      "/en/gradients",
    );
  });

  for (const scheme of ["light", "dark"] as const) {
    for (const path of ["/de/farbverlaeufe", "/en/gradients/northern-lights"]) {
      test(`${path} has no accessibility violations (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoAxeViolations(page);
      });
    }
    for (const path of ["/en/color-palettes", "/de/farbpaletten/nachtzug"]) {
      test(`${path} has no accessibility violations (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const width of [375, 768, 1280]) {
    test(`fit ${width} px without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const path of [
        "/de/farbverlaeufe",
        "/de/farbverlaeufe/alpengluehen",
        "/de/farbpaletten",
        "/de/farbpaletten/strassenfest",
      ]) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBe(0);
      }
    });
  }
});
