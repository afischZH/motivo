/**
 * M4-AP02/AP03: Geometric Patterns. Pack and hand-picked shapes, the CSS
 * repeat tile, tile editing with the mouse and the keyboard (popover with
 * focus trap and return), undo, edits in share links and saved designs,
 * axe in light and dark mode with the popover open, and no horizontal
 * overflow at 375, 768 and 1280 px. Preview == PNG lives in
 * preview-export.spec.ts.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { readGifInfo } from "@musterli/exporters/gif-info";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const TOOL = "geometric-patterns";
/** Defaults: 8 tiles per row on the 1080 × 1080 canvas. */
const COLUMNS = 8;
const ROWS = 8;

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");
const picker = (page: Page): Locator => page.getByTestId("region-picker");

async function motifSrc(page: Page): Promise<string> {
  await expect(motif(page)).toBeVisible();
  return (await motif(page).getAttribute("src")) ?? "";
}

async function openEditor(page: Page, locale: "de" | "en" = "de", hash = "") {
  await page.goto(`/${locale}/tools/${toolSlug(TOOL, locale)}${hash}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(motif(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

/** Clicks the centre of tile (row, col) of the default grid. */
async function clickTile(page: Page, row: number, col: number) {
  const box = await motif(page).boundingBox();
  if (!box) throw new Error("preview has no box");
  await page.mouse.click(
    box.x + ((col + 0.5) * box.width) / COLUMNS,
    box.y + ((row + 0.5) * box.height) / ROWS,
  );
}

const tileDialog = (page: Page, locale: "de" | "en" = "de") =>
  page.getByRole("dialog", { name: locale === "de" ? "Kachel bearbeiten" : "Edit tile" });

/** Picks a shape in the open tile popover. */
async function pickShape(dialog: Locator, pack: string, shape: string, locale: "de" | "en" = "de") {
  const group = locale === "de" ? "Form: Sammlung" : "Shape: collection";
  await dialog.getByLabel(group).selectOption({ label: pack });
  await dialog
    .getByRole("radiogroup", { name: locale === "de" ? "Form" : "Shape" })
    .getByRole("radio", { name: shape, exact: true })
    .click();
}

test.describe("geometric patterns", () => {
  test("switches packs and hand-picks shapes", async ({ page }) => {
    await openEditor(page);
    const first = await motifSrc(page);
    await page
      .getByLabel("Formen-Pack", { exact: true })
      .selectOption({ label: "Sterne und Funkeln" });
    await expect.poll(() => motifSrc(page)).not.toBe(first);

    const stars = await motifSrc(page);
    await page.getByLabel("Formen-Pack", { exact: true }).selectOption({ label: "Eigene Auswahl" });
    const shapes = page.getByRole("group", { name: "Formen" });
    await expect(shapes).toBeVisible();
    await expect.poll(() => motifSrc(page)).not.toBe(stars);
    // Multi-select: checkboxes; picking one more shape changes the design.
    const custom = await motifSrc(page);
    await page.getByLabel("Formen: Sammlung").selectOption({ label: "Symbole" });
    const heart = shapes.getByRole("checkbox", { name: "Herz", exact: true });
    await expect(heart).not.toBeChecked();
    await heart.click();
    await expect(heart).toBeChecked();
    await expect.poll(() => motifSrc(page)).not.toBe(custom);
  });

  test("exports the design as a repeating CSS background", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "en");
    const dialog = page.getByRole("dialog", { name: "Export" });
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    const radio = dialog.getByRole("radio", { name: "CSS", exact: true });
    await dialog.locator(`label[for="${(await radio.getAttribute("id")) ?? ""}"]`).click();
    await expect(radio).toBeChecked();
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    const css = await page.evaluate(() => navigator.clipboard.readText());
    expect(css).toMatch(/^background-image: url\("data:image\/svg\+xml,/);
    expect(css).toContain("background-size: 1080px 1080px;");
    expect(css).toContain("background-repeat: repeat;");
  });

  test("exports a color cycle as a GIF", async ({ page }) => {
    await openEditor(page, "en");
    const dialog = page.getByRole("dialog", { name: "Export" });
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    const choose = async (scope: Locator, name: string) => {
      const radio = scope.getByRole("radio", { name, exact: true });
      await scope.locator(`label[for="${(await radio.getAttribute("id")) ?? ""}"]`).click();
      await expect(radio).toBeChecked();
    };
    await choose(dialog, "GIF");
    const panel = dialog.getByTestId("export-gif");
    await choose(panel, "Color cycle");
    await panel.getByRole("slider", { name: "Frames" }).fill("3");
    await choose(panel, "320 × 320");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^musterli-geometric-patterns-\d+\.gif$/);
    const bytes = new Uint8Array(await readFile(await download.path()));
    expect(readGifInfo(bytes)).toMatchObject({
      width: 320,
      height: 320,
      frames: 3,
      complete: true,
    });
  });

  test("edits a tile with the mouse, undoes and resets it", async ({ page }) => {
    await openEditor(page);
    const original = await motifSrc(page);
    await clickTile(page, 2, 3);
    const dialog = tileDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Kachel Zeile 3, Spalte 4");
    await pickShape(dialog, "Symbole", "Herz");
    await expect.poll(() => motifSrc(page)).not.toBe(original);
    const edited = await motifSrc(page);
    expect(decodeURIComponent(edited)).toContain("gp-heart-p");

    await dialog.getByRole("button", { name: "Fertig" }).click();
    await expect(dialog).toBeHidden();
    await expect(picker(page)).toBeFocused();
    await expect(picker(page)).toHaveAccessibleName("Kachel Zeile 3, Spalte 4, geändert");

    // One edit, one undo step.
    await page.getByRole("button", { name: "Rückgängig" }).click();
    await expect.poll(() => motifSrc(page)).toBe(original);
    await page.getByRole("button", { name: "Wiederholen" }).click();
    await expect.poll(() => motifSrc(page)).toBe(edited);

    // Reset this tile, then "reset all".
    await clickTile(page, 2, 3);
    await dialog.getByRole("button", { name: "Kachel zurücksetzen" }).click();
    await expect.poll(() => motifSrc(page)).toBe(original);
    await pickShape(dialog, "Symbole", "Herz");
    await expect(dialog.getByRole("button", { name: "Alle zurücksetzen (1)" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Alle zurücksetzen (1)" }).click();
    await expect.poll(() => motifSrc(page)).toBe(original);
    await expect(dialog.getByRole("button", { name: "Alle zurücksetzen (0)" })).toBeDisabled();
  });

  test("edits a tile with the keyboard, focus is trapped and returns", async ({ page }) => {
    await openEditor(page);
    const original = await motifSrc(page);
    await picker(page).focus();
    await expect(picker(page)).toHaveAttribute("data-region", "0-0");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(picker(page)).toHaveAttribute("data-region", "1-1");
    await expect(page.getByTestId("region-announcer")).toHaveText("Kachel Zeile 2, Spalte 2");
    // Arrow keys moved the picker, not the variant filmstrip.
    await expect(page.getByTestId("filmstrip").locator("li")).toHaveCount(1);

    await page.keyboard.press("Enter");
    const dialog = tileDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Kachel Zeile 2, Spalte 2");
    const slider = dialog.getByRole("slider", { name: "Drehung" });
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => motifSrc(page)).not.toBe(original);

    // Tab cycles inside the popover (focus trap).
    for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(picker(page)).toBeFocused();
    await expect(picker(page)).toHaveAccessibleName("Kachel Zeile 2, Spalte 2, geändert");
    // Space on the picker opens the popover again instead of rolling a variant.
    await page.keyboard.press("Space");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filmstrip").locator("li")).toHaveCount(1);
  });

  test("keeps edited tiles in share links and on new variants", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page);
    await clickTile(page, 0, 0);
    await pickShape(tileDialog(page), "Symbole", "Herz");
    await page.keyboard.press("Escape");
    await expect.poll(async () => decodeURIComponent(await motifSrc(page))).toContain("gp-heart-p");
    const edited = await motifSrc(page);

    await page.getByRole("button", { name: "Teilen" }).click();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/#d=/);
    const other = await context.newPage();
    await other.goto(url);
    await expect(motif(other)).toBeVisible();
    await expect.poll(() => motifSrc(other)).toBe(edited);
    await expect(other.getByTestId("region-picker")).toHaveAccessibleName(
      "Kachel Zeile 1, Spalte 1, geändert",
    );

    // Space rolls a new variant; the edited tile stays (the locked uniform grid keeps the cell).
    await page.getByRole("button", { name: "Raster sperren" }).click();
    await page.getByTestId("new-variant").click();
    await expect.poll(() => motifSrc(page)).not.toBe(edited);
    expect(decodeURIComponent(await motifSrc(page))).toContain("gp-heart-p");
  });

  test("keeps edited tiles in a saved design after a reload", async ({ page }) => {
    await openEditor(page, "en");
    await expect(page.getByTestId("save-design")).toBeEnabled();
    await clickTile(page, 4, 5);
    await pickShape(tileDialog(page, "en"), "Symbols", "Heart", "en");
    await page.keyboard.press("Escape");
    await expect.poll(async () => decodeURIComponent(await motifSrc(page))).toContain("gp-heart-p");
    const edited = await motifSrc(page);

    await page.getByTestId("design-name").fill("Geometric E2E");
    await page.getByTestId("save-design").click();
    await expect(page.getByTestId("shell-flash")).toHaveText("Saved, in this browser only.");
    await expect(page).toHaveURL(/#design=[0-9a-f]{32}$/);

    await page.reload();
    await expect(page.getByTestId("design-name")).toHaveValue("Geometric E2E");
    await expect.poll(() => motifSrc(page)).toBe(edited);
    await expect(page.getByTestId("region-picker")).toBeAttached();
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`has no axe violations with the tile popover open (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page);
      const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(editor.violations).toEqual([]);
      await clickTile(page, 1, 1);
      await expect(tileDialog(page)).toBeVisible();
      const popover = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(popover.violations).toEqual([]);
      await page.goto(`/en/${toolSlug(TOOL, "en")}`);
      await expect(page.locator("#faq-heading")).toBeVisible();
      const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(landing.violations).toEqual([]);
    });
  }

  test("has no horizontal overflow at 375, 768 and 1280 px", async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [`/de/tools/${toolSlug(TOOL, "de")}`, `/en/${toolSlug(TOOL, "en")}`]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = () =>
          page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
        expect(await overflow(), `${path} at ${width} px`).toBe(0);
        if (path.includes("/tools/")) {
          await expect(page.getByRole("button", { name: "Teilen" })).toBeEnabled();
          await clickTile(page, 0, COLUMNS - 1);
          const dialog = tileDialog(page);
          await expect(dialog).toBeVisible();
          expect(await overflow(), `${path} at ${width} px with the popover`).toBe(0);
          const box = await dialog.boundingBox();
          expect(box, "popover box").not.toBeNull();
          expect(
            box && box.x >= 0 && box.x + box.width <= width,
            `popover ${JSON.stringify(box)} at ${width} px`,
          ).toBe(true);
          await page.keyboard.press("Escape");
        }
      }
    }
  });
});
