/**
 * M2-AP03: CSS pattern library. Overview with category filter, one page per
 * pattern (preview, code, editor link, structured data, OG image), slug
 * redirects, and the check that the CSS and its SVG twin look the same.
 */
import AxeBuilder from "@axe-core/playwright";
import { CSS_PATTERNS, PATTERN_LOOKS, cssPattern } from "@musterli/engine";
import { expect, test, type Page } from "@playwright/test";
import { deflateRawSync } from "node:zlib";

import { FALLBACK_SITE_URL, resolveSiteUrl } from "../lib/seo/site-url";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const SITE = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL);

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

test.describe("CSS pattern library", () => {
  test("lists every pattern and filters by category with the keyboard", async ({ page }) => {
    expect((await page.goto("/de/css-muster"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSS-Muster");
    const cards = page
      .getByRole("main")
      .getByRole("listitem")
      .filter({ has: page.getByRole("article") });
    await expect(cards).toHaveCount(CSS_PATTERNS.length);
    await expect(page.getByRole("status")).toHaveText(`${CSS_PATTERNS.length} Muster`);

    const waves = page.getByRole("button", { name: /^Wellen/ });
    await expect(waves).toHaveAttribute("aria-pressed", "false");
    await waves.focus();
    await page.keyboard.press("Enter");
    await expect(waves).toHaveAttribute("aria-pressed", "true");
    const waveCount = CSS_PATTERNS.filter((p) => p.category === "waves").length;
    await expect(cards.filter({ visible: true })).toHaveCount(waveCount);
    await expect(page.getByRole("status")).toHaveText(`${waveCount} Muster`);
    await expect(page.getByRole("link", { name: "Wellenlinien" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Schachbrett" })).toBeHidden();

    await page.getByRole("button", { name: /^Alle/ }).press("Space");
    await expect(cards.filter({ visible: true })).toHaveCount(CSS_PATTERNS.length);

    await page.getByRole("link", { name: "Zickzack" }).click();
    await expect(page).toHaveURL(/\/de\/css-muster\/zickzack$/);
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/en/css-patterns");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSS Patterns");
    await expectNoAxeViolations(page);
  });
});

test.describe("CSS pattern page", () => {
  test("shows a live preview, the code, structured data and an OG image", async ({
    page,
    request,
  }) => {
    expect((await page.goto("/en/css-patterns/zigzag"))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Zigzag CSS pattern");

    // The preview is the real CSS (an inline style), not an image file.
    const preview = page.getByRole("img", { name: "Preview of the Zigzag pattern" });
    const image = await preview.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(image).toContain("linear-gradient(");
    const code = page.locator("pre").first();
    await expect(code).toContainText("background-image: linear-gradient(");
    await expect(page.locator("pre").nth(1)).toContainText("[background-image:");

    const editor = page.getByRole("link", { name: "Customize in the editor" });
    await expect(editor).toHaveAttribute("href", /^\/en\/tools\/css-pattern-generator#d=[\w-]+$/);

    const crumbs = (await jsonLd(page)).find((d) => d["@type"] === "BreadcrumbList");
    expect(crumbs?.itemListElement).toHaveLength(3);
    expect(await page.locator('link[rel="alternate"][hreflang="de"]').getAttribute("href")).toBe(
      new URL("/de/css-muster/zickzack", SITE).toString(),
    );

    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toBe(new URL("/og/en/css-patterns/zigzag.png", SITE).toString());
    const png = await request.get(new URL(og ?? "").pathname);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");

    await expect(page.getByRole("heading", { level: 2, name: "Related patterns" })).toBeVisible();
  });

  test("copies the CSS", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/de/css-muster/schachbrett");
    await page.getByRole("button", { name: "CSS kopieren" }).click();
    await expect(page.getByRole("status").first()).toHaveText("Kopiert! Ab ins Projekt damit.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^background-color: #f1f5f9;\nbackground-image: conic-gradient\(/);
  });

  test("opens the pattern in the editor", async ({ page }) => {
    await page.goto("/en/css-patterns/gingham");
    await page.getByRole("link", { name: "Customize in the editor" }).click();
    await expect(page).toHaveURL(/\/en\/tools\/css-pattern-generator#d=/);
    const picker = page.getByRole("radiogroup", { name: "Pattern" });
    await expect(picker.getByRole("radio", { name: "Gingham", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("list", { name: "Layers" }).getByRole("listitem")).toHaveCount(1);
  });

  test("redirects other locales' slugs and ids", async ({ page }) => {
    await page.goto("/en/css-muster/zickzack");
    await expect(page).toHaveURL(/\/en\/css-patterns\/zigzag$/);
    await page.goto("/de/css-patterns/candy");
    await expect(page).toHaveURL(/\/de\/css-muster\/zuckerstange$/);
    expect((await page.request.get("/de/css-muster/gibts-nicht")).status()).toBe(404);
  });

  test("is listed in the sitemap", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain(new URL("/de/css-muster/zickzack", SITE).toString());
    expect(xml).toContain(new URL("/en/css-patterns", SITE).toString());
  });

  test("has no accessibility violations", async ({ page }) => {
    await page.goto("/de/css-muster/argyle");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Argyle als CSS-Muster");
    await expectNoAxeViolations(page);
  });
});

/** A share code as an M2-AP03 link carried it: one pattern, no layer list. */
function legacyHash(params: Record<string, unknown>): string {
  const json = JSON.stringify(["css-patterns", 1, 1, 1080, 1080, params]);
  const bytes = Buffer.concat([Buffer.from([1]), deflateRawSync(Buffer.from(json))]);
  return `#d=${bytes.toString("base64url")}`;
}

test.describe("CSS pattern layers", () => {
  const layerList = (page: Page) => page.getByRole("list", { name: "Ebenen" });
  /** The select button of each layer row (the eye button follows it). */
  const rows = (page: Page) => layerList(page).locator("li > button:first-child");
  const css = (page: Page) =>
    page
      .getByTestId("preview")
      .locator(":scope > div[aria-hidden='true'] > div")
      .evaluate((el) => getComputedStyle(el).backgroundImage);

  async function openPreset(page: Page, preset: string) {
    await page.goto("/de/tools/css-muster-generator");
    await expect(page.getByRole("button", { name: "Teilen" })).toBeEnabled();
    const button = page.getByRole("button", { name: preset, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }

  test("edits three layers with the keyboard and passes axe", async ({ page }) => {
    await openPreset(page, "Highland");
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).first()).toHaveAccessibleName("Ebene 1 Nadelstreifen");

    // Alt+Down moves the top layer: focus follows it, the change is announced once.
    await rows(page).first().focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(rows(page).nth(1)).toBeFocused();
    await expect(rows(page).nth(1)).toHaveAccessibleName("Ebene 2 Nadelstreifen");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Nadelstreifen verschoben, jetzt Position 2 von 3." }),
    ).toHaveCount(1);

    // Hiding a layer changes the preview.
    const before = await css(page);
    expect(before).toContain("gradient(");
    const eye = page.getByRole("button", { name: "Ebene 2 sichtbar" });
    await eye.click();
    await expect(eye).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => css(page)).not.toBe(before);

    // The selected layer's pattern is edited with the thumbnail picker.
    const form = page.getByRole("group", { name: "Ebene 2 bearbeiten" });
    const picker = form.getByRole("radiogroup", { name: "Muster" });
    await picker.getByRole("radio", { checked: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(rows(page).nth(1)).not.toHaveAccessibleName(/Nadelstreifen/);

    await expectNoAxeViolations(page);

    // Delete removes the row, focus lands on its neighbour; undo restores it.
    await rows(page).nth(1).focus();
    await page.keyboard.press("Delete");
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(1)).toBeFocused();
    await page.keyboard.press("ControlOrMeta+Z");
    await expect(rows(page)).toHaveCount(3);
  });

  test("adds up to five layers and shares them in a link", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openPreset(page, "Highland");
    const add = page.getByRole("button", { name: "Neu hinzufügen" });
    await add.click();
    await expect(rows(page).first()).toBeFocused();
    await add.click();
    await expect(rows(page)).toHaveCount(5);
    await expect(add).toBeDisabled();
    await expect(page.getByText("5 von 5")).toBeVisible();
    const shown = await css(page);
    expect(shown).toContain("gradient(");

    const flash = page.getByTestId("shell-flash");
    await expect(async () => {
      await page.getByRole("button", { name: "Teilen" }).click();
      await expect(flash).toHaveText(/^Link kopiert!/, { timeout: 1000 });
    }).toPass();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/de\/tools\/css-muster-generator#d=[\w-]+$/);

    const other = await context.newPage();
    await other.goto(link);
    await expect(rows(other)).toHaveCount(5);
    await expect.poll(() => css(other)).toBe(shown);
    await expect(other.getByTestId("shell-notice")).toHaveCount(0);
  });

  test("opens an old single-pattern link as one layer", async ({ page }) => {
    const hash = legacyHash({
      background: "#fffaf5",
      pattern: "gingham",
      color: "#d62839",
      accent: "#e07a5f",
      size: 28,
      angle: 0,
      opacity: 90,
    });
    await page.goto(`/en/tools/css-pattern-generator${hash}`);
    const list = page.getByRole("list", { name: "Layers" });
    await expect(list.getByRole("button", { name: "Layer 1 Gingham", exact: true })).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(1);
  });
});

test.describe("CSS and SVG twin", () => {
  test("look the same for every pattern (preview equals SVG and PNG export)", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "pixel comparison is calibrated for Chromium");
    const W = 160;
    const H = 120;
    const cells = CSS_PATTERNS.map((spec) => {
      const look = PATTERN_LOOKS[spec.look] ?? PATTERN_LOOKS[0];
      const out = cssPattern({
        pattern: spec.id,
        ...look,
        size: spec.size,
        angle: spec.angle + 7,
        opacity: 70,
        width: W,
        height: H,
      });
      const style = out.css.replace(/\n/g, " ").replace(/"/g, "&quot;");
      const svg = Buffer.from(out.svg).toString("base64");
      return `<div data-id="${spec.id}" style="display:flex;gap:8px;margin:4px">
        <div class="css" style="width:${W}px;height:${H}px;${style}"></div>
        <img class="svg" alt="" width="${W}" height="${H}" src="data:image/svg+xml;base64,${svg}">
      </div>`;
    });
    await page.setContent(`<!doctype html><body style="margin:0">${cells.join("")}</body>`);
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));

    for (const spec of CSS_PATTERNS) {
      const cell = page.locator(`[data-id="${spec.id}"]`);
      const a = (await cell.locator(".css").screenshot()).toString("base64");
      const b = (await cell.locator(".svg").screenshot()).toString("base64");
      const diff = await page.evaluate(
        async ([pa, pb]) => {
          const pixels = async (b64: string) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;
            await img.decode();
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("no 2d context");
            ctx.drawImage(img, 0, 0);
            return ctx.getImageData(0, 0, img.width, img.height).data;
          };
          const [x, y] = await Promise.all([pixels(pa as string), pixels(pb as string)]);
          let off = 0;
          for (let i = 0; i < x.length; i += 4) {
            const d = Math.max(
              Math.abs((x[i] ?? 0) - (y[i] ?? 0)),
              Math.abs((x[i + 1] ?? 0) - (y[i + 1] ?? 0)),
              Math.abs((x[i + 2] ?? 0) - (y[i + 2] ?? 0)),
            );
            if (d > 64) off++;
          }
          return off / (x.length / 4);
        },
        [a, b],
      );
      // Only antialiasing of single edge pixels may differ.
      expect(diff, spec.id).toBeLessThan(0.01);
    }
  });
});
