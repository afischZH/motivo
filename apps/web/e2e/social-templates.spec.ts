/**
 * M6-AP05: templates and Brand-Apply in the social media editor, in
 * Chromium with the real fonts and the Konva text engine.
 *
 * The unit test `lib/social-editor/templates.test.ts` puts all 40 templates
 * through all 13 formats with stub metrics; here every template goes
 * through the six formats of the definition of done with the real fonts
 * (German texts, the longer ones), and the stage must report no text cut
 * off and nothing outside the canvas (`data-fit-problems`, computed by
 * `checkSceneFit` with the very measuring the stage draws with).
 */
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { LONG_TASKS } from "./support/long-tasks";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const EDITOR = "/en/social-media-editor/edit";
const EDITOR_DE = "/de/social-media-editor/bearbeiten";
const BRAND_KIT = "/en/brand-kit";
const FIXTURE_FONT = fileURLToPath(new URL("./fixtures/brand-test.ttf", import.meta.url));

/** The six formats of the M6 definition of done (id, size on the stage). */
const DOD_FORMATS = [
  ["square", "1080x1080"],
  ["portrait", "1080x1350"],
  ["story", "1080x1920"],
  ["landscape", "1200x630"],
  ["banner", "1500x500"],
  ["youtube-thumbnail", "1280x720"],
] as const;

const THEMES = ["announcement", "quote", "event", "sale", "tip", "team"] as const;

const stage = (page: Page) => page.getByTestId("stage");
const dialog = (page: Page) => page.getByTestId("template-dialog");
const cards = (page: Page) => dialog(page).locator("button[data-template]");

async function openEditor(page: Page, url = EDITOR) {
  await page.goto(url);
  await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
  await expect(stage(page)).toHaveAttribute("data-background", "ready");
}

async function openPicker(page: Page) {
  await page.getByTestId("open-templates").click();
  await expect(dialog(page)).toBeVisible();
  await expect(cards(page)).toHaveCount(40);
}

async function pick(page: Page, id: string) {
  await dialog(page).locator(`button[data-template="${id}"]`).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByTestId("open-templates")).toBeEnabled();
}

async function paletteColors(page: Page): Promise<string[]> {
  await stage(page).focus();
  await page.keyboard.press("Escape");
  return page
    .getByTestId("scene-palette")
    .locator('input[type="color"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

test.describe("social editor templates", () => {
  test("lists, filters and opens templates with the keyboard", async ({ page }) => {
    await openEditor(page);
    const opener = page.getByTestId("open-templates");
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    await expect(cards(page)).toHaveCount(40);
    await expect(dialog(page).getByRole("heading", { name: "Choose a template" })).toBeVisible();

    // Filters: theme, then format.
    await page.getByTestId("template-theme").selectOption("quote");
    await expect(cards(page)).toHaveCount(7);
    await page.getByTestId("template-format").selectOption("square");
    await expect(cards(page)).toHaveCount(2);
    await page.getByTestId("template-theme").selectOption("");
    await page.getByTestId("template-format").selectOption("story");
    const stories = await cards(page).count();
    expect(stories).toBeGreaterThanOrEqual(5);
    await page.getByTestId("template-format").selectOption("");

    // The grid is one tab stop; arrows move between cards.
    const first = cards(page).first();
    await expect(first).toHaveAttribute("tabindex", "0");
    await expect(cards(page).nth(1)).toHaveAttribute("tabindex", "-1");
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(cards(page).nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(cards(page).last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(first).toBeFocused();
    await expect(first).toHaveAccessibleName(
      "Open template: Product launch Instagram, Facebook, LinkedIn 1:1 , theme Announcement, 1080 × 1080 pixels",
    );
    // Thumbnails are drawn in the browser.
    await expect(first).toHaveAttribute("data-thumbnail", "ready");

    // Escape closes and gives the focus back to the button.
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(opener).toBeFocused();

    // Enter on a card opens the template as a new design.
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeVisible();
    await expect(first).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(dialog(page)).toBeHidden();
    await expect(stage(page)).toHaveAttribute("data-format", "1080x1350");
    await expect(page.getByTestId("design-name")).toHaveValue("Big news");
    await expect(page.getByTestId("layer-list")).toContainText("We are moving to a new studio");
    await expect(page.getByTestId("announcer")).toHaveText(/Opened template Big news/);
    await expect(stage(page)).toHaveAttribute("data-fit-problems", "0");
    // A fresh design: nothing to undo.
    await expect(page.getByTestId("undo")).toBeDisabled();
  });

  test("opens a template in the current format and asks before dropping changes", async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByTestId("format").selectOption("story");
    await expect(stage(page)).toHaveAttribute("data-format", "1080x1920");
    // The starter scene was changed: opening a template asks first.
    await openPicker(page);
    await page.getByTestId("template-use-current").check();
    page.once("dialog", (d) => void d.dismiss());
    await dialog(page).locator('button[data-template="hiring"]').click();
    await expect(page.getByTestId("design-name")).toHaveValue("");
    await expect(stage(page)).toHaveAttribute("data-format", "1080x1920");

    await openPicker(page);
    await expect(page.getByTestId("template-use-current")).toBeChecked();
    page.once("dialog", (d) => void d.accept());
    await pick(page, "hiring");
    await expect(page.getByTestId("design-name")).toHaveValue("We are hiring");
    // Opened through Magic Resize in the story format, nothing cut off.
    await expect(stage(page)).toHaveAttribute("data-format", "1080x1920");
    await expect(stage(page)).toHaveAttribute("data-fit-problems", "0");
    await expect(stage(page)).toHaveAttribute("data-background", "ready");

    // Without changes, the next template opens without asking.
    let asked = false;
    page.once("dialog", (d) => {
      asked = true;
      void d.accept();
    });
    await openPicker(page);
    await page.getByTestId("template-use-current").uncheck();
    await pick(page, "values");
    await expect(stage(page)).toHaveAttribute("data-format", "1200x627");
    expect(asked).toBe(false);
  });

  for (const theme of THEMES) {
    test(`fits every ${theme} template into six formats with the real fonts`, async ({ page }) => {
      test.setTimeout(180_000);
      await openEditor(page, EDITOR_DE);
      await page.getByTestId("open-templates").click();
      await page.getByTestId("template-theme").selectOption(theme);
      const ids = await cards(page).evaluateAll((els) =>
        els.map((e) => e.getAttribute("data-template") ?? ""),
      );
      expect(ids.length).toBeGreaterThanOrEqual(6);
      await page.keyboard.press("Escape");
      for (const id of ids) {
        await page.getByTestId("open-templates").click();
        await pick(page, id);
        await expect(stage(page), `${id} native`).toHaveAttribute("data-fit-problems", "0");
        for (const [format, size] of DOD_FORMATS) {
          await page.getByTestId("format").selectOption(format);
          await expect(stage(page)).toHaveAttribute("data-format", size);
          await expect(stage(page), `${id} -> ${format}`).toHaveAttribute("data-fit-problems", "0");
        }
      }
    });
  }

  test("applies the brand kit in one step and undoes it in one step", async ({ page }) => {
    // Brand kit: a palette, a logo and a font.
    await page.goto(BRAND_KIT);
    await page.getByTestId("palette-new").click();
    const form = page.getByTestId("palette-form");
    await form.getByTestId("palette-form-name").fill("Acme");
    const hex = form.getByTestId("palette-form-hex");
    for (const [i, color] of ["#0B3D91", "#FF6B35", "#F7F7F2"].entries()) {
      await hex.nth(i).fill(color);
    }
    await form.getByTestId("palette-form-save").click();
    await expect(page.getByTestId("brand-message")).toContainText("Palette “Acme” saved.");
    await page.getByTestId("logo-file").setInputFiles({
      name: "acme.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#0b3d91"/></svg>',
      ),
    });
    await expect(page.getByTestId("brand-message")).toContainText("Logo “acme” added.");
    await page.getByTestId("font-file").setInputFiles(FIXTURE_FONT);
    await expect(page.getByTestId("brand-message")).toContainText("Font “brand test” added.");

    await openEditor(page);
    await openPicker(page);
    await pick(page, "launch-bold");
    await expect(stage(page)).toHaveAttribute("data-background", "ready");
    const before = await paletteColors(page);
    const logoRow = page.getByTestId("layer-row").filter({ hasText: "Logo" });
    await expect(logoRow.getByTestId("layer-visible")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("apply-brand").click();
    await expect(page.getByTestId("announcer")).toHaveText(
      "Brand kit applied: colours, fonts in 4 texts, logo.",
    );
    const after = await paletteColors(page);
    expect(after).not.toEqual(before);
    expect(after).toEqual(expect.arrayContaining(["#0b3d91", "#ff6b35", "#f7f7f2"]));
    const brandLogo = page.getByTestId("layer-row").filter({ hasText: "acme" });
    await expect(brandLogo.getByTestId("layer-visible")).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("layer-row").filter({ hasText: "Our new product" }).click();
    await expect(page.getByTestId("text-font")).toHaveValue(/^brand:/);
    await expect(stage(page)).toHaveAttribute("data-fit-problems", "0");

    // One undo step brings everything back.
    await page.getByTestId("undo").click();
    expect(await paletteColors(page)).toEqual(before);
    await expect(logoRow.getByTestId("layer-visible")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("layer-row").filter({ hasText: "Our new product" }).click();
    await expect(page.getByTestId("text-font")).toHaveValue("library:space-grotesk");
    await expect(page.getByTestId("undo")).toBeDisabled();
  });

  test("keeps locked layers when applying the brand kit", async ({ page }) => {
    await page.goto(BRAND_KIT);
    await page.getByTestId("font-file").setInputFiles(FIXTURE_FONT);
    await expect(page.getByTestId("brand-message")).toContainText("Font “brand test” added.");
    await openEditor(page);
    await openPicker(page);
    await pick(page, "quote-classic");
    const quote = page.getByTestId("layer-row").filter({ hasText: "Good design" });
    await quote.getByTestId("layer-lock").click();
    await page.getByTestId("apply-brand").click();
    await expect(page.getByTestId("announcer")).toHaveText(/fonts in 3 texts/);
    await quote.getByTestId("layer-select").click();
    await expect(page.getByTestId("text-font")).toHaveValue("library:eb-garamond");
  });

  test("explains an empty brand kit", async ({ page }) => {
    await openEditor(page);
    await page.getByTestId("apply-brand").click();
    const empty = page.getByTestId("brand-empty-dialog");
    await expect(empty).toBeVisible();
    await expect(empty.getByRole("link", { name: "brand kit" })).toHaveAttribute("href", BRAND_KIT);
    await empty.getByRole("button", { name: "Close" }).click();
    await expect(empty).toBeHidden();
    await expect(page.getByTestId("apply-brand")).toBeFocused();
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`template picker has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 900 });
      await openEditor(page);
      await openPicker(page);
      await expect(cards(page).first()).toHaveAttribute("data-thumbnail", "ready");
      const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(result.violations).toEqual([]);
    });
  }

  test("template picker fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openEditor(page);
    await openPicker(page);
    const box = await dialog(page).boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(375);
    const overflow = await dialog(page).evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  /**
   * Each thumbnail runs in its own tasks (fonts, Magic Resize, drawing, one
   * thumbnail at a time with a pause), so no task holds more than one step.
   * The longest step is the background: the tool renders its SVG in the SVG
   * render worker, and the browser rasterises it on the main thread, which
   * headless Chromium does in software (up to about 70 ms for the busiest
   * motif, Starry Sky). As in the main-thread
   * budget of m1-audit.spec.ts, the test guards against regressions at
   * 100 ms and records every long task as an annotation.
   */
  test(
    "draws the thumbnails without blocking the main thread",
    LONG_TASKS,
    async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== "chromium", "Long Tasks API is Chromium-only");
      test.skip(
        testInfo.config.workers > 1,
        "needs an idle CPU: runs in CI (1 worker), pnpm test:e2e:chromium or --workers=1",
      );
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1280, height: 900 });
      await openEditor(page);
      await page.evaluate(() => {
        const w = window as unknown as { __longTasks: number[] };
        w.__longTasks = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) w.__longTasks.push(Math.round(entry.duration));
        }).observe({ type: "longtask" });
      });
      await openPicker(page);
      for (let i = 0; i < 40; i++) {
        await cards(page).nth(i).scrollIntoViewIfNeeded();
        await expect(cards(page).nth(i)).toHaveAttribute("data-thumbnail", "ready", {
          timeout: 30_000,
        });
      }
      const longTasks = await page.evaluate(
        () => (window as unknown as { __longTasks: number[] }).__longTasks,
      );
      testInfo.annotations.push({
        type: "long-tasks",
        description: longTasks.length > 0 ? `${longTasks.join(", ")} ms` : "none over 50 ms",
      });
      // Most of the 40 thumbnails stay below 50 ms; only the busiest backgrounds may not.
      expect(longTasks.length, JSON.stringify(longTasks)).toBeLessThanOrEqual(8);
      expect(Math.max(0, ...longTasks), JSON.stringify(longTasks)).toBeLessThan(100);
    },
  );
});
