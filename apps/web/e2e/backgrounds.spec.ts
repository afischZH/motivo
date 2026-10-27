/**
 * M3-AP08: Blob Composition, Doodle Backgrounds and SVG Charts in the
 * editor: blob layers with the generic list control, relative positions
 * across canvas sizes, new data on Space, and axe on every editor page.
 * Preview == PNG export for these tools lives in preview-export.spec.ts.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function motifSrc(page: Page): Promise<string> {
  await expect(motif(page)).toBeVisible();
  return (await motif(page).getAttribute("src")) ?? "";
}

/** Opens the editor and waits until it is hydrated (Share is enabled then). */
async function openEditor(page: Page, toolId: string, locale: "de" | "en" = "de") {
  await page.goto(`/${locale}/tools/${toolSlug(toolId, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(motif(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

test.describe("background tools", () => {
  for (const toolId of ["blob-composition", "doodles", "svg-charts"]) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${toolId} editor has no axe violations (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await openEditor(page, toolId);
        await page.locator("body").press("Space");
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  }

  test("blob composition edits blob layers with the list control", async ({ page }) => {
    await openEditor(page, "blob-composition");
    const rows = page.getByRole("list", { name: "Blobs" }).locator("li > button:first-child");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toHaveAccessibleName("Blob 1 Oben rechts");

    // A new blob goes to a free corner.
    const before = await motifSrc(page);
    await page.getByRole("button", { name: "Neu hinzufügen" }).click();
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toHaveAccessibleName("Blob 1 Oben links");
    await expect.poll(() => motifSrc(page)).not.toBe(before);

    // Moving the selected blob to another position changes the preview.
    const form = page.getByRole("group", { name: "Blob 1 bearbeiten" });
    const moved = await motifSrc(page);
    await form
      .getByRole("combobox", { name: "Position", exact: true })
      .selectOption({ label: "Mitte" });
    await expect(rows.first()).toHaveAccessibleName("Blob 1 Mitte");
    await expect.poll(() => motifSrc(page)).not.toBe(moved);

    // Undo restores the previous layer list.
    await page.locator("body").press("ControlOrMeta+Z");
    await page.locator("body").press("ControlOrMeta+Z");
    await expect(rows).toHaveCount(3);
  });

  test("SVG charts draw new data on Space and switch to bars", async ({ page }) => {
    await openEditor(page, "svg-charts", "en");
    const first = await motifSrc(page);
    await page.locator("body").press("Space");
    await expect.poll(() => motifSrc(page)).not.toBe(first);

    const lines = await motifSrc(page);
    await page.getByRole("radio", { name: "Bars", exact: true }).click();
    await expect.poll(() => motifSrc(page)).not.toBe(lines);
    await expect(page.getByText("Smoothing", { exact: true })).toHaveCount(0);
  });
});
