import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const LANDING = "/en/social-media-editor";
const EDITOR = "/en/social-media-editor/edit";

const stage = (page: Page) => page.getByTestId("stage");

/** Opens the editor on a fresh scene and waits for Konva and the background. */
async function openEditor(page: Page) {
  await page.goto(EDITOR);
  await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
  await expect(stage(page)).toHaveAttribute("data-background", "ready");
}

/** The drawn stage (content layer) as a data URL. */
async function stagePixels(page: Page): Promise<string> {
  return stage(page)
    .locator("canvas")
    .first()
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
}

/** Width and height from a PNG header. */
function pngSize(file: Buffer): { width: number; height: number } {
  expect(file.readUInt32BE(0)).toBe(0x89504e47);
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

async function numberField(page: Page, testId: string): Promise<number> {
  return Number(await page.getByTestId(testId).inputValue());
}

test.describe("social media editor", () => {
  test("landing page links to the editor and does not load Konva", async ({ page }) => {
    await page.goto(LANDING);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Social media editor");
    await expect(page.getByTestId("social-formats").locator("li")).toHaveCount(13);
    const resources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((e) => e.name),
    );
    expect(resources.filter((name) => /konva/i.test(name))).toEqual([]);
    await page.getByTestId("social-cta").click();
    await expect(page).toHaveURL(/\/en\/social-media-editor\/edit$/);
    await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
  });

  test("designs, resizes, exports and saves a post", async ({ page }) => {
    await openEditor(page);

    // Background: another tool, then a new variant with Space.
    await page.getByTestId("background-tool").selectOption("blob");
    await expect(stage(page)).toHaveAttribute("data-background", "ready");
    const before = await stagePixels(page);
    await stage(page).focus();
    await page.keyboard.press("Space");
    await expect(stage(page)).toHaveAttribute("data-background", "ready");
    await expect.poll(() => stagePixels(page)).not.toBe(before);

    // Text and a shape.
    await page.getByTestId("add-text").click();
    await page.getByTestId("text-content").fill("Launch day");
    await page.getByTestId("add-rect").click();
    await expect(page.getByTestId("layer-row")).toHaveCount(4);

    // Move by keyboard: 1 px, then 10 px with Shift; undo puts it back.
    const x0 = await numberField(page, "field-x");
    await stage(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => numberField(page, "field-x")).toBe(x0 + 1);
    await page.keyboard.press("Shift+ArrowDown");
    await page.waitForTimeout(600); // a new undo step after the merge window
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(() => numberField(page, "field-x")).toBe(x0 + 11);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => numberField(page, "field-x")).toBe(x0 + 1);
    await page.getByTestId("redo").click();
    await expect.poll(() => numberField(page, "field-x")).toBe(x0 + 11);

    // Magic Resize to a story: every text still fits, nothing leaves the canvas.
    await page.getByTestId("format").selectOption("story");
    await expect(stage(page)).toHaveAttribute("data-format", "1080x1920");
    await expect(stage(page)).toHaveAttribute("data-fit-problems", "0");
    await page
      .getByTestId("layer-row")
      .filter({ hasText: "Launch day" })
      .getByTestId("layer-select")
      .click();
    const tx = await numberField(page, "field-x");
    const tw = await numberField(page, "field-width");
    expect(tx).toBeGreaterThanOrEqual(0);
    expect(tx + tw).toBeLessThanOrEqual(1080);
    await expect(stage(page)).toHaveAttribute("data-background", "ready");

    // PNG export at the format size, then at 2x.
    const download = page.waitForEvent("download");
    await page.getByTestId("export").click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("musterli-social-1080x1920.png");
    expect(pngSize(await readFile((await file.path()) ?? ""))).toEqual({
      width: 1080,
      height: 1920,
    });
    await page.getByTestId("export-scale").selectOption("2");
    const download2 = page.waitForEvent("download");
    await page.getByTestId("export").click();
    const file2 = await download2;
    expect(pngSize(await readFile((await file2.path()) ?? ""))).toEqual({
      width: 2160,
      height: 3840,
    });

    // Save, then find it in "My designs".
    await page.getByTestId("design-name").fill("Launch post");
    await page.getByTestId("save").click();
    await expect(page.getByTestId("announcer")).toHaveText("“Launch post” saved.");
    await expect(page).toHaveURL(/#design=[A-Za-z0-9_-]+$/);

    await page.goto("/en/my-designs");
    const card = page.getByTestId("social-design-card").filter({ hasText: "Launch post" });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("social-design-thumbnail")).toBeVisible();
    await expect(card).toContainText("1080 × 1920");

    // Opening it brings the scene back.
    await card.getByTestId("social-design-open").click();
    await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
    await expect(stage(page)).toHaveAttribute("data-format", "1080x1920");
    await expect(page.getByTestId("design-name")).toHaveValue("Launch post");
  });

  test("works at 768 px with the large screen hint", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 });
    await openEditor(page);
    await expect(page.getByTestId("small-screen-hint")).toBeVisible();
    await expect(stage(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 900 });
      await openEditor(page);
      await page.getByTestId("add-text").click();
      const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(editor.violations).toEqual([]);
      await page.goto(LANDING);
      const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(landing.violations).toEqual([]);
    });
  }
});
