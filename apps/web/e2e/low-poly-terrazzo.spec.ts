/**
 * M4b-AP02: Low Poly & Voronoi and Terrazzo. Mode switch and outlines,
 * Terrazzo's seamless tile (CSS and PNG tile), landing pages in DE and EN
 * and axe in light and dark mode. Preview == PNG export lives in
 * preview-export.spec.ts.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function openEditor(page: Page, toolId: string, locale: "de" | "en") {
  await page.goto(`/${locale}/tools/${toolSlug(toolId, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(motif(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

async function openExport(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Export" });
  // Retried: a click before hydration finishes does nothing.
  await expect(async () => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  return dialog;
}

async function choose(dialog: Locator, name: string) {
  const radio = dialog.getByRole("radio", { name, exact: true });
  await dialog.locator(`label[for="${(await radio.getAttribute("id")) ?? ""}"]`).click();
  await expect(radio).toBeChecked();
}

const src = (page: Page) => motif(page).getAttribute("src");

test.describe("low poly", () => {
  test("switches to Voronoi cells and adds outlines", async ({ page }) => {
    await openEditor(page, "low-poly", "en");
    const before = await src(page);
    await page.getByRole("radio", { name: "Voronoi cells" }).click();
    await expect.poll(() => src(page)).not.toBe(before);

    const voronoi = await src(page);
    const width = page.getByRole("textbox", { name: "Line width" });
    await width.fill("2");
    await width.press("Enter");
    await expect.poll(() => src(page)).not.toBe(voronoi);
    expect(decodeURIComponent((await src(page)) ?? "")).toContain('stroke-width="2"');
    await expect(page.getByRole("textbox", { name: "Line opacity" })).toBeVisible();
  });
});

test.describe("terrazzo", () => {
  test("exports the seamless tile as CSS and PNG tile", async ({ page }) => {
    await openEditor(page, "terrazzo", "en");
    const dialog = await openExport(page);
    await choose(dialog, "CSS");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText("background-size: 480px 480px;");
    await expect(code).toContainText("background-repeat: repeat;");

    await choose(dialog, "PNG tile");
    await expect(dialog.getByTestId("export-output-size")).toHaveText(/^Result: \d+ × \d+ px\.$/);
    const download = page.waitForEvent("download");
    await dialog.getByTestId("export-download").click();
    expect((await download).suggestedFilename()).toMatch(/-tile\.png$/);
  });

  test("turns the seamless tile off and on", async ({ page }) => {
    await openEditor(page, "terrazzo", "de");
    const before = await src(page);
    const seamless = page.getByRole("switch", { name: "Nahtlose Kachel" });
    await expect(seamless).toBeChecked();
    await expect(page.getByRole("textbox", { name: "Kachelgrösse" })).toBeVisible();
    await seamless.click();
    await expect.poll(() => src(page)).not.toBe(before);
    await expect(page.getByRole("textbox", { name: "Kachelgrösse" })).toHaveCount(0);
  });
});

for (const [toolId, de, en] of [
  ["low-poly", "Low Poly und Voronoi", "Low Poly & Voronoi"],
  ["terrazzo", "Terrazzo-Muster", "Terrazzo Pattern"],
] as const) {
  test.describe(`${toolId} pages`, () => {
    for (const [locale, name] of [
      ["de", de],
      ["en", en],
    ] as const) {
      test(`landing page ${locale}`, async ({ page }) => {
        const response = await page.goto(`/${locale}/${toolSlug(toolId, locale)}`);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
        await expect(page.locator("#faq-heading")).toBeVisible();
      });
    }

    for (const scheme of ["light", "dark"] as const) {
      test(`editor and landing page have no axe violations (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await openEditor(page, toolId, "de");
        await page.locator("body").press("Space");
        const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(editor.violations).toEqual([]);
        await page.goto(`/en/${toolSlug(toolId, "en")}`);
        const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(landing.violations).toEqual([]);
      });
    }
  });
}
