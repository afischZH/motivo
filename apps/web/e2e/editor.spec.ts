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
    const cards = page.getByRole("main").getByRole("article");
    await expect(cards).toHaveCount(builtInTools.length);
    await page.getByRole("link", { name: "Blob Generator: open in editor" }).click();
    await expect(page).toHaveURL(/\/en\/tools\/blob-generator$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blob Generator");
  });

  test("unknown tool ids return 404", async ({ page }) => {
    const response = await page.goto("/en/tools/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});

test.describe("editor", () => {
  test("Space makes a new variant and undo restores it", async ({ page }) => {
    await openEditor(page, "/en/tools/blob-generator");
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
    await openEditor(page, "/en/tools/blob-generator");
    const before = await motifSrc(page);
    const width = page.getByLabel("Width");
    await width.click();
    await width.press("Space");
    await expect(page.getByTestId("filmstrip").getByRole("listitem")).toHaveCount(1);
    expect(await motifSrc(page)).toBe(before);
  });

  test("clicking a preset applies it as a new variant", async ({ page }) => {
    await openEditor(page, "/en/tools/blob-generator");
    const before = await motifSrc(page);
    const preset = page.getByRole("button", { name: "Lava" });
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => motifSrc(page)).not.toBe(before);
    await expect(page.getByTestId("filmstrip").getByRole("listitem")).toHaveCount(2);
  });

  test("size picker and zoom shortcuts change the preview", async ({ page }) => {
    await openEditor(page, "/en/tools/blob-generator");
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
    await openEditor(page, "/en/tools/blob-generator");
    await page.locator("body").press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("CSS tools render through a style, German page uses German copy", async ({ page }) => {
    await page.goto("/de/tools/css-verlauf-generator");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSS-Verlauf");
    const box = page.getByTestId("preview").locator("div[style*='gradient']");
    await expect(box).toBeAttached();
  });
});

test.describe("colour tools", () => {
  const value = (page: Page, key: string): Promise<string> =>
    page.locator(`[data-control="${key}"] .font-mono`).innerText();

  test("palette generator keeps a locked colour when shuffling", async ({ page }) => {
    await openEditor(page, "/en/tools/palette-generator");
    const lock = page.getByRole("button", { name: "Lock Color 2" });
    await lock.click();
    await expect(lock).toHaveAttribute("aria-pressed", "true");
    const locked = await value(page, "color2");
    const other = await value(page, "color1");

    // Space on the focused lock button would toggle it; shortcuts need the focus elsewhere.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator("body").press("Space");
    await expect.poll(() => value(page, "color1")).not.toBe(other);
    expect(await value(page, "color2")).toBe(locked);
    // Only colours get a lock; count and harmony are generation settings.
    await expect(page.getByRole("button", { name: /^Lock Number of colors/ })).toHaveCount(0);
  });

  test("tailwind palette exports a tailwind.config.js", async ({ page }) => {
    await openEditor(page, "/en/tools/tailwind-palette");
    const dialog = page.getByRole("dialog", { name: "Export" });
    // Retried: a click before hydration finishes does nothing.
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    const radio = dialog.getByRole("radio", { name: "tailwind.config.js", exact: true });
    await dialog.locator(`label[for="${(await radio.getAttribute("id")) ?? ""}"]`).click();
    await expect(radio).toBeChecked();
    await expect(dialog.getByTestId("export-code")).toContainText("500: '#3b82f6'");
  });

  for (const toolId of ["palette-generator", "tints-shades", "tailwind-palette"]) {
    test(`/de/tools/${toolId} has no axe violations`, async ({ page }) => {
      await openEditor(page, `/de/tools/${toolId}`);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("editor accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`/en/tools/blob-generator has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "/en/tools/blob-generator");
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
