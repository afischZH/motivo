/**
 * M5-AP03: 3D Perspective Grid in the editor. Ceiling and sun switches
 * change the motif, the SVG export carries the glow filter, the "Motion"
 * GIF comes out of the worker, landing pages in DE and EN, axe in light and
 * dark mode and no horizontal overflow at 375 px. Preview == PNG export
 * lives in preview-export.spec.ts.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { readGifInfo } from "@musterli/exporters/gif-info";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const TOOL = "perspective-grid";

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function motifSvg(page: Page): Promise<string> {
  await expect(motif(page)).toBeVisible();
  return decodeURIComponent((await motif(page).getAttribute("src")) ?? "");
}

async function openEditor(page: Page, locale: "de" | "en") {
  await page.goto(`/${locale}/tools/${toolSlug(TOOL, locale)}`);
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

/** Picks a radio card by clicking its visible label, as a user would. */
async function choose(scope: Locator, name: string) {
  const radio = scope.getByRole("radio", { name, exact: true });
  const id = await radio.getAttribute("id");
  await scope.locator(`label[for="${id}"]`).click();
  await expect(radio).toBeChecked();
}

test.describe("perspective grid editor", () => {
  test("adds the mirrored ceiling and hides the sun", async ({ page }) => {
    await openEditor(page, "de");
    const before = await motifSvg(page);
    expect(before).toContain("<clipPath");
    const ceiling = page.getByRole("switch", { name: "Gespiegelte Decke" });
    await expect(ceiling).not.toBeChecked();
    await ceiling.click();
    await expect.poll(() => motifSvg(page)).not.toBe(before);

    await page.getByRole("switch", { name: "Sonne", exact: true }).click();
    await expect.poll(() => motifSvg(page)).not.toContain("<clipPath");
    await expect(page.getByRole("textbox", { name: "Sonnengrösse" })).toHaveCount(0);
  });

  test("exports an SVG with glow and a moving GIF from the worker", async ({ page }) => {
    await openEditor(page, "en");
    let dialog = await openExport(page);
    await choose(dialog, "SVG");
    const [svgDownload] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    const svg = await readFile(await svgDownload.path(), "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<feGaussianBlur");
    expect(svg.length).toBeLessThan(200 * 1024);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    dialog = await openExport(page);
    await choose(dialog, "GIF");
    const panel = dialog.getByTestId("export-gif");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("radio", { name: "Motion" })).toBeChecked();
    await panel.getByRole("slider", { name: "Frames" }).fill("3");
    await choose(panel, "320 × 180");
    const [gifDownload] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    const bytes = new Uint8Array(await readFile(await gifDownload.path()));
    expect(readGifInfo(bytes)).toMatchObject({
      width: 320,
      height: 180,
      frames: 3,
      complete: true,
    });
  });

  test("exports PNG, JPG and WebP", async ({ page }) => {
    await openEditor(page, "en");
    const dialog = await openExport(page);
    for (const [format, ext] of [
      ["PNG", "png"],
      ["JPG", "jpg"],
      ["WebP", "webp"],
    ] as const) {
      await choose(dialog, format);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        dialog.getByRole("button", { name: "Download" }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
    }
  });
});

test.describe("perspective grid pages", () => {
  for (const [locale, name] of [
    ["de", "3D-Perspektivgitter"],
    ["en", "3D Perspective Grid"],
  ] as const) {
    test(`landing page ${locale} explains the tool with an FAQ`, async ({ page }) => {
      const response = await page.goto(`/${locale}/${toolSlug(TOOL, locale)}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
      await expect(page.locator("#faq-heading")).toBeVisible();
      await expect(page.locator("dt")).toHaveCount(4);
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`editor and landing page have no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "de");
      await page.locator("body").press("Space");
      const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(editor.violations).toEqual([]);
      await page.goto(`/en/${toolSlug(TOOL, "en")}`);
      const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(landing.violations).toEqual([]);
    });
  }

  test("has no horizontal overflow at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    for (const path of [`/de/tools/${toolSlug(TOOL, "de")}`, `/en/${toolSlug(TOOL, "en")}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBe(0);
    }
  });
});
