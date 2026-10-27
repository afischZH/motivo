import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { builtInTools } from "@motivo/tool-registry";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** The rendered motif inside the labelled preview (img for SVG tools, div for CSS tools). */
const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function motifSrc(page: Page): Promise<string> {
  const img = motif(page);
  await expect(img).toBeVisible();
  return (await img.getAttribute("src")) ?? "";
}

/** Waits until the editor is hydrated (keyboard shortcuts are bound). */
async function openEditor(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(motif(page)).toBeVisible();
}

test.describe("tools index", () => {
  test("lists the registered tools and links to the editor", async ({ page }) => {
    await page.goto("/en/tools");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Generators");
    const cards = page.getByRole("main").getByRole("listitem");
    await expect(cards).toHaveCount(builtInTools.length);
    await page.getByRole("link", { name: /Blob Generator/ }).click();
    await expect(page).toHaveURL(/\/en\/tools\/blob$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blob Generator");
  });

  test("unknown tool ids return 404", async ({ page }) => {
    const response = await page.goto("/en/tools/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});

test.describe("editor", () => {
  test("Space makes a new variant and undo restores it", async ({ page }) => {
    await openEditor(page, "/en/tools/blob");
    const before = await motifSrc(page);
    const announcer = page.getByTestId("editor-announcer");

    await page.locator("body").press("Space");
    await expect.poll(() => motifSrc(page)).not.toBe(before);
    await expect(announcer).toHaveText("Variant 2 of 2");
    await expect(page.getByTestId("filmstrip").getByRole("listitem")).toHaveCount(2);

    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(() => motifSrc(page)).toBe(before);
    await expect(announcer).toHaveText("Undone");

    await page.keyboard.press("ControlOrMeta+Shift+Z");
    await expect.poll(() => motifSrc(page)).not.toBe(before);

    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => motifSrc(page)).toBe(before);
    await expect(announcer).toHaveText("Variant 1 of 2");
  });

  test("Space is ignored while typing in a field", async ({ page }) => {
    await openEditor(page, "/en/tools/blob");
    const before = await motifSrc(page);
    const width = page.getByLabel("Width");
    await width.click();
    await width.press("Space");
    await expect(page.getByTestId("filmstrip").getByRole("listitem")).toHaveCount(1);
    expect(await motifSrc(page)).toBe(before);
  });

  test("clicking a preset applies it as a new variant", async ({ page }) => {
    await openEditor(page, "/en/tools/blob");
    const before = await motifSrc(page);
    const preset = page.getByRole("button", { name: "Lava" });
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => motifSrc(page)).not.toBe(before);
    await expect(page.getByTestId("filmstrip").getByRole("listitem")).toHaveCount(2);
  });

  test("size picker and zoom shortcuts change the preview", async ({ page }) => {
    await openEditor(page, "/en/tools/blob");
    await page.getByRole("combobox", { name: "Size", exact: true }).selectOption("full-hd");
    await expect(page.getByLabel("Width")).toHaveValue("1920");
    await expect(page.getByRole("img", { name: /1920 × 1080 px/ })).toBeVisible();

    await page.locator("body").press("1");
    await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator("body").press("0");
    await expect(page.getByRole("button", { name: "Fit" })).toHaveAttribute("aria-pressed", "true");
  });

  test("? opens the shortcut overview", async ({ page }) => {
    await openEditor(page, "/en/tools/blob");
    await page.locator("body").press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("CSS tools render through a style, German page uses German copy", async ({ page }) => {
    await page.goto("/de/tools/css-gradient");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSS-Verlauf");
    const box = page.getByTestId("preview").locator("div[style*='gradient']");
    await expect(box).toBeAttached();
  });
});

test.describe("editor accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`/en/tools/blob has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "/en/tools/blob");
      await page.locator("body").press("Space");
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("/de/tools has no axe violations", async ({ page }) => {
    await page.goto("/de/tools");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
