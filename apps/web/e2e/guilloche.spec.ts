/**
 * M4b-AP03: Guilloche. Layouts and presets change the preview, the SVG
 * export is the compact preview SVG, a "Motion" GIF loops the line phase,
 * axe in light and dark mode, and no horizontal overflow at 375, 768 and
 * 1280 px. Preview == PNG lives in preview-export.spec.ts.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { readGifInfo } from "@musterli/exporters/gif-info";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const TOOL = "guilloche";

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function motifSrc(page: Page): Promise<string> {
  await expect(motif(page)).toBeVisible();
  return (await motif(page).getAttribute("src")) ?? "";
}

async function openEditor(page: Page, locale: "de" | "en" = "en") {
  await page.goto(`/${locale}/tools/${toolSlug(TOOL, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

async function openExport(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(async () => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  return dialog;
}

async function choose(scope: Locator, name: string) {
  const radio = scope.getByRole("radio", { name, exact: true });
  await scope.locator(`label[for="${(await radio.getAttribute("id")) ?? ""}"]`).click();
  await expect(radio).toBeChecked();
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("guilloche", () => {
  test("switches layouts and presets in German", async ({ page }) => {
    await openEditor(page, "de");
    const rosette = await motifSrc(page);
    expect(decodeURIComponent(rosette)).toContain('stroke-linecap="round"');

    // The band shows its repeats and hides the rosette turn.
    await page.getByRole("radio", { name: "Band (kachelbar)", exact: true }).first().click();
    await expect.poll(() => motifSrc(page)).not.toBe(rosette);
    await expect(page.getByRole("slider", { name: "Wiederholungen" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Drehung" })).toHaveCount(0);

    const band = await motifSrc(page);
    await page.getByRole("button", { name: "Urkunde", exact: true }).click();
    await expect.poll(() => motifSrc(page)).not.toBe(band);
    await expect(page.getByRole("radio", { name: "Rahmen", exact: true }).first()).toBeChecked();

    // The second layer adds its controls.
    await expect(page.getByRole("slider", { name: "Schwingungen" })).toHaveCount(1);
    await page.getByRole("switch", { name: "Zweite Ebene zeigen" }).click();
    await expect(page.getByRole("slider", { name: "Schwingungen" })).toHaveCount(2);
  });

  test("exports the preview as a compact SVG", async ({ page }) => {
    await openEditor(page);
    const preview = decodeURIComponent(await motifSrc(page));
    const dialog = await openExport(page);
    await choose(dialog, "SVG");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^musterli-guilloche-\d+\.svg$/);
    const svg = await readFile(await download.path(), "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.length).toBeLessThan(400_000);
    expect(svg).toMatch(/<path stroke="#[0-9a-f]{6}" d="M[\d.]+ [\d.]+l/);
    // Same render path: the preview shows the same paths.
    expect(preview).toContain(svg.slice(svg.indexOf("<g "), svg.indexOf("<g ") + 200));
  });

  test("exports a motion GIF", async ({ page }) => {
    await openEditor(page);
    const dialog = await openExport(page);
    await choose(dialog, "GIF");
    const panel = dialog.getByTestId("export-gif");
    // Motion is the first source and preselected.
    await expect(panel.getByRole("radio", { name: "Motion", exact: true })).toBeChecked();
    await panel.getByRole("slider", { name: "Frames" }).fill("4");
    await choose(panel, "320 × 320");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^musterli-guilloche-\d+\.gif$/);
    const bytes = new Uint8Array(await readFile(await download.path()));
    expect(readGifInfo(bytes)).toMatchObject({
      width: 320,
      height: 320,
      frames: 4,
      complete: true,
    });
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`editor has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "de");
      await page.getByRole("switch", { name: "Zweite Ebene zeigen" }).click();
      await page.getByRole("radio", { name: "Irisdruck", exact: true }).first().click();
      await expect(page.getByRole("slider", { name: "Winkel des Irisdrucks" })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  for (const width of [375, 768, 1280]) {
    for (const path of [`/de/tools/${toolSlug(TOOL, "de")}`, `/en/${toolSlug(TOOL, "en")}`]) {
      test(`${path} has no horizontal overflow at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await horizontalOverflow(page)).toBe(0);
      });
    }
  }
});
