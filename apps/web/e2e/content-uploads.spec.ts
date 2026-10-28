/**
 * M4-AP06b: own background picture in Glass and Border Effects, content per
 * tile in the Bento Grid. Uploads go through the crop dialog, render in the
 * preview and image exports, appear as placeholders in code, never in share
 * links, and stay in saved designs after a reload. Hostile text is escaped
 * everywhere. Axe in light and dark mode with the tile popover open, and no
 * horizontal overflow at 375, 768 and 1280 px.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** 1 × 1 PNG, opaque grey. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const LOGO_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" onload="window.__pwned=1"><script>window.__pwned=2</script><circle cx="10" cy="10" r="9" fill="#e11d48"/></svg>',
);
const HOSTILE = '</text><script>window.__pwned=3</script>"&';

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");
const picker = (page: Page): Locator => page.getByTestId("region-picker");
const cropDialog = (page: Page, locale: "de" | "en" = "de") =>
  page.getByRole("dialog", { name: locale === "de" ? "Zuschneiden" : "Crop" });
const tileDialog = (page: Page, locale: "de" | "en" = "de") =>
  page.getByRole("dialog", { name: locale === "de" ? "Kachel bearbeiten" : "Edit tile" });

async function openEditor(page: Page, toolId: string, locale: "de" | "en" = "de", hash = "") {
  await page.goto(`/${locale}/tools/${toolSlug(toolId, locale)}${hash}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

async function motifSrc(page: Page): Promise<string> {
  await expect(motif(page)).toBeVisible();
  return decodeURIComponent((await motif(page).getAttribute("src")) ?? "");
}

/** Uploads a file into the upload field of `control` (a `data-control` key) and applies the crop. */
async function upload(
  scope: Locator,
  page: Page,
  control: string,
  file: { name: string; mimeType: string; buffer: Buffer },
  locale: "de" | "en" = "de",
) {
  await scope
    .locator(`[data-control="${control}"]`)
    .getByLabel(locale === "de" ? "Datei wählen" : "Choose file")
    .setInputFiles(file);
  const crop = cropDialog(page, locale);
  await expect(crop).toBeVisible();
  await crop.getByRole("button", { name: locale === "de" ? "Übernehmen" : "Apply" }).click();
  await expect(crop).toBeHidden();
}

async function openExport(page: Page, locale: "de" | "en" = "de"): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: locale === "de" ? "Exportieren" : "Export" });
  await expect(async () => {
    await page
      .getByRole("button", { name: locale === "de" ? "Exportieren" : "Export", exact: true })
      .click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  return dialog;
}

async function choose(dialog: Locator, name: string) {
  const radio = dialog.getByRole("radio", { name, exact: true });
  const id = await radio.getAttribute("id");
  await dialog.locator(`label[for="${id}"]`).click();
  await expect(radio).toBeChecked();
}

test.describe("glass effects: own background picture", () => {
  test("uploads a picture as the stage, code uses a placeholder", async ({ page }) => {
    await openEditor(page, "glass-effects", "en");
    await upload(
      page.locator("body"),
      page,
      "backgroundImage",
      {
        name: "beach.png",
        mimeType: "image/png",
        buffer: PNG,
      },
      "en",
    );
    // Photos are re-encoded as JPEG; the stage shows the picture.
    const stage = page.getByTestId("preview").locator("[data-motif-element]").locator("..");
    await expect
      .poll(() => stage.evaluate((el) => getComputedStyle(el).backgroundImage))
      .toContain("data:image/jpeg;base64,");
    await expect(page.getByRole("radio", { name: "Show all", exact: true })).toBeVisible();
    await expect(page.getByTestId("advisory-image-contrast")).toBeVisible();

    const dialog = await openExport(page, "en");
    await choose(dialog, "HTML example");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText('background-image: url("your-image.jpg")');
    await expect(code).toContainText("Replace your-image.jpg");
    expect(await code.textContent()).not.toContain("data:image/jpeg");
    await page.keyboard.press("Escape");

    // Border: the PNG export renders the picture through the same path.
    await page.getByRole("radio", { name: "Gradient border", exact: true }).click();
    const png = await openExport(page, "en");
    await choose(png, "PNG");
    const download = page.waitForEvent("download");
    await png.getByTestId("export-download").click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
  });

  test("leaves the picture out of share links", async ({ page, context, browserName }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "glass-effects");
    await upload(page.locator("body"), page, "backgroundImage", {
      name: "logo.svg",
      mimeType: "image/svg+xml",
      buffer: LOGO_SVG,
    });
    await page.getByRole("button", { name: "Teilen" }).click();
    await expect(page.getByTestId("shell-notice")).toContainText("nicht im Link");
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/#d=/);
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(other.getByTestId("asset-thumbnail")).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  });
});

test.describe("bento grid: tile content", () => {
  test("adds title, icon, graphic and tile background; exports SVG and HTML", async ({ page }) => {
    await openEditor(page, "bento-grid");
    await expect(motif(page)).toBeVisible();
    // Keyboard: focus the tile picker and open the first tile.
    await picker(page).focus();
    await expect(picker(page)).toHaveAttribute("data-region", "t1");
    await page.keyboard.press("Enter");
    const dialog = tileDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Titel", { exact: true }).fill(`Hallo ${HOSTILE}`);
    await dialog.getByLabel("Untertitel", { exact: true }).fill("Alles in Kacheln");
    await dialog.getByLabel("Symbol zeigen", { exact: true }).click();
    await dialog.getByLabel("Symbol: Sammlung").selectOption({ label: "Symbole" });
    await dialog
      .getByRole("radiogroup", { name: "Symbol" })
      .getByRole("radio", { name: "Herz", exact: true })
      .click();
    // Escape in the crop dialog closes only that one: the tile popover stays open.
    await dialog
      .locator('[data-control="graphic"]')
      .getByLabel("Datei wählen")
      .setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: LOGO_SVG });
    await expect(cropDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(cropDialog(page)).toBeHidden();
    await expect(dialog).toBeVisible();
    await upload(dialog, page, "graphic", {
      name: "logo.svg",
      mimeType: "image/svg+xml",
      buffer: LOGO_SVG,
    });
    await upload(dialog, page, "background", {
      name: "photo.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await dialog.getByRole("button", { name: "Fertig" }).click();
    await expect(dialog).toBeHidden();
    await expect(picker(page)).toBeFocused();
    await expect(picker(page)).toHaveAccessibleName(/^Kachel 1, .*, geändert$/);

    const svg = await motifSrc(page);
    // The title wraps: "Hallo" on one line, the escaped markup on the next.
    expect(svg).toContain(">Hallo</text>");
    expect(svg).toContain(">&lt;/text&gt;&lt;scr");
    expect(svg).not.toContain("<script");
    expect(svg).toContain("Alles in Kacheln");
    expect(svg).toContain("data:image/svg+xml;base64,");
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();

    // SVG export: same markup as the preview.
    let exportDialog = await openExport(page);
    await choose(exportDialog, "SVG");
    const download = page.waitForEvent("download");
    await exportDialog.getByTestId("export-download").click();
    const file = await readFile(await (await download).path(), "utf8");
    expect(file).toContain("Alles in Kacheln</text>");
    expect(file).toContain("<image ");
    expect(file).not.toContain("foreignObject");
    await page.keyboard.press("Escape");

    // HTML export: real, escaped text and placeholders for the pictures.
    exportDialog = await openExport(page);
    await choose(exportDialog, "CSS Grid + HTML");
    const code = exportDialog.getByTestId("export-code");
    await expect(code).toContainText("&lt;/text&gt;&lt;script&gt;window.__pwned=3&lt;/script&gt;");
    await expect(code).toContainText("<p>Alles in Kacheln</p>");
    await expect(code).toContainText('src="tile-1-graphic.svg"');
    await expect(code).toContainText("url('tile-1-background.png')");
    await expect(code).toContainText('viewBox="-50 -50 100 100"');
    expect(await code.textContent()).not.toContain("data:image");
  });

  test("clicks a tile to edit it; share links keep text but no pictures", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "bento-grid", "en");
    const box = await motif(page).boundingBox();
    if (!box) throw new Error("no preview box");
    // The default layout starts with a tile in the top-left corner.
    await page.mouse.click(box.x + box.width * 0.06, box.y + box.height * 0.08);
    const dialog = tileDialog(page, "en");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Tile 1");
    await dialog.getByLabel("Title", { exact: true }).fill("Shared title");
    await upload(
      dialog,
      page,
      "background",
      {
        name: "photo.png",
        mimeType: "image/png",
        buffer: PNG,
      },
      "en",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect.poll(() => motifSrc(page)).toContain("Shared title");

    // One undo step per field: undo removes the picture, the title stays.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => motifSrc(page)).not.toContain("<image");
    expect(await motifSrc(page)).toContain("Shared title");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect.poll(() => motifSrc(page)).toContain("<image");

    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByTestId("shell-notice")).toContainText("not in the link");
    const url = await page.evaluate(() => navigator.clipboard.readText());
    const other = await context.newPage();
    await other.goto(url);
    await expect(motif(other)).toBeVisible();
    await expect.poll(() => motifSrc(other)).toContain("Shared title");
    expect(await motifSrc(other)).not.toContain("<image");
  });

  test("keeps pictures in a saved design after a reload", async ({ page }) => {
    await openEditor(page, "bento-grid", "en");
    await expect(page.getByTestId("save-design")).toBeEnabled();
    await upload(
      page.locator("body"),
      page,
      "backgroundImage",
      {
        name: "grid.png",
        mimeType: "image/png",
        buffer: PNG,
      },
      "en",
    );
    await picker(page).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    const dialog = tileDialog(page, "en");
    await upload(
      dialog,
      page,
      "graphic",
      {
        name: "logo.svg",
        mimeType: "image/svg+xml",
        buffer: LOGO_SVG,
      },
      "en",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const edited = await motifSrc(page);
    expect(edited.match(/<image /g)?.length).toBe(2);

    await page.getByTestId("design-name").fill("Bento E2E");
    await page.getByTestId("save-design").click();
    await expect(page.getByTestId("shell-flash")).toHaveText("Saved, in this browser only.");
    await expect(page).toHaveURL(/#design=[0-9a-f]{32}$/);
    await page.reload();
    await expect(page.getByTestId("design-name")).toHaveValue("Bento E2E");
    await expect.poll(() => motifSrc(page)).toBe(edited);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`has no axe violations with the tile popover open (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "bento-grid");
      await picker(page).focus();
      await page.keyboard.press("Enter");
      const dialog = tileDialog(page);
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Symbol zeigen", { exact: true }).click();
      await expect(dialog.getByRole("radiogroup", { name: "Symbol" })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });

    test(`glass editor with a picture has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "glass-effects");
      await upload(page.locator("body"), page, "backgroundImage", {
        name: "beach.png",
        mimeType: "image/png",
        buffer: PNG,
      });
      await expect(page.getByTestId("advisory-image-contrast")).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("has no horizontal overflow at 375, 768 and 1280 px with the popover", async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await openEditor(page, "bento-grid");
      await picker(page).focus();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      const dialog = tileDialog(page);
      await expect(dialog).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `at ${width} px`).toBe(0);
      const box = await dialog.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width, `popover at ${width} px`).toBe(true);
      await page.keyboard.press("Escape");
    }
  });
});
