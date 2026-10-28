/**
 * M4-AP05: Contrast checker and CSS shadow. One-click contrast suggestions,
 * simulation, the real CSS preview of the shadow (element on a backdrop),
 * code export with copy, landing pages in DE and EN, axe in light and dark,
 * and no horizontal overflow at 375, 768 and 1280 px.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const motifImg = (page: Page): Locator => page.getByTestId("preview").locator("img");
const shadowElement = (page: Page): Locator =>
  page.getByTestId("preview").locator("[data-motif-element]");

async function openEditor(page: Page, toolId: string, locale: "de" | "en") {
  await page.goto(`/${locale}/tools/${toolSlug(toolId, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

async function openExport(page: Page, locale: "de" | "en" = "en"): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Export" });
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

test.describe("contrast checker", () => {
  test("applies the nearest AAA text colour in one click", async ({ page }) => {
    await openEditor(page, "contrast-checker", "de");
    const suggestions = page.getByRole("region", { name: "Vorschläge" });
    const button = suggestions.getByRole("button", { name: /^Textfarbe für AAA: #[0-9a-f]{6}/ });
    await expect(button).toBeVisible();
    const label = (await button.textContent()) ?? "";
    const color = /#[0-9a-f]{6}/.exec(label)?.[0] ?? "";
    const before = await motifImg(page).getAttribute("src");

    await button.click();
    await expect(page.getByTestId("shell-flash")).toContainText("Übernommen: Textfarbe für AAA");
    await expect(page.getByRole("region", { name: "Vorschläge" })).toHaveCount(0);
    await expect.poll(() => motifImg(page).getAttribute("src")).not.toBe(before);
    expect(decodeURIComponent((await motifImg(page).getAttribute("src")) ?? "")).toContain(
      `fill="${color}"`,
    );

    // Undo brings the suggestion back.
    await page.locator("body").press("ControlOrMeta+Z");
    await expect(suggestions.getByRole("button", { name: /^Textfarbe für AAA/ })).toBeVisible();
  });

  test("shows a colour vision simulation and the text report", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "contrast-checker", "en");
    const before = await motifImg(page).getAttribute("src");
    await page
      .getByRole("combobox", { name: "Simulate color vision deficiency" })
      .selectOption({ label: "Deuteranopia (green-blind)" });
    await expect.poll(() => motifImg(page).getAttribute("src")).not.toBe(before);

    const dialog = await openExport(page);
    await choose(dialog, "Text report");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText("Contrast:      5.4:1");
    await expect(code).toContainText("Simulation:    deuteranopia");
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copied! Off to your project.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await code.textContent(),
    );
  });
});

test.describe("CSS shadow", () => {
  test("previews real CSS on a Musterli backdrop and reacts to the controls", async ({ page }) => {
    await openEditor(page, "css-shadow", "en");
    const element = shadowElement(page);
    await expect(element).toBeVisible();
    const shadow = () => element.evaluate((el) => getComputedStyle(el).boxShadow);
    const first = await shadow();
    expect(first.match(/rgba?\(/g)).toHaveLength(5);
    const backdrop = await element.evaluate(
      (el) => getComputedStyle(el.parentElement as HTMLElement).backgroundImage,
    );
    expect(backdrop).toContain("linear-gradient(");

    const layers = page.getByRole("textbox", { name: "Layers" });
    await layers.fill("2");
    await layers.press("Enter");
    await expect.poll(async () => (await shadow()).match(/rgba?\(/g)?.length).toBe(2);

    await page.getByRole("switch", { name: "Inner shadow" }).click();
    await expect.poll(shadow).toContain("inset");
  });

  test("copies the box-shadow CSS and the Tailwind class", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "css-shadow", "de");
    const dialog = await openExport(page, "de");
    await choose(dialog, "CSS");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText("box-shadow:");
    await expect(code).not.toContainText("gradient");
    await dialog.getByRole("button", { name: "Kopieren", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Kopiert! Ab ins Projekt damit.");
    const css = await page.evaluate(() => navigator.clipboard.readText());
    expect(css).toMatch(/^background-color: #ffffff;\nborder-radius: 16px;\nbox-shadow: /);

    await choose(dialog, "Tailwind v4 @theme");
    await expect(code).toContainText("--shadow-soft:");
    await choose(dialog, "Tailwind-Klassen");
    await expect(code).toContainText("shadow-[");
  });
});

for (const toolId of ["contrast-checker", "css-shadow"]) {
  test.describe(`${toolId} pages`, () => {
    for (const [locale, name] of [
      ["de", toolId === "css-shadow" ? "CSS-Schatten-Generator" : "Kontrast-Checker"],
      ["en", toolId === "css-shadow" ? "CSS Shadow Generator" : "Contrast Checker"],
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

    test("has no horizontal overflow at 375, 768 and 1280 px", async ({ page }) => {
      for (const width of [375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const path of [
          `/de/tools/${toolSlug(toolId, "de")}`,
          `/en/${toolSlug(toolId, "en")}`,
        ]) {
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `${path} at ${width} px`).toBe(0);
        }
      }
    });
  });
}
