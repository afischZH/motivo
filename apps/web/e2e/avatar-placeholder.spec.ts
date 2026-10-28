/**
 * M4c-AP01: Avatar generator and placeholder images. Name to initials,
 * escaped custom initials, identicon style, the size label following the
 * canvas, SVG/PNG/JPG/WebP downloads, landing pages in DE and EN, axe in
 * light and dark mode and no horizontal overflow at 375 px. Preview == PNG
 * export lives in preview-export.spec.ts.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");
const svgOf = async (page: Page) =>
  decodeURIComponent((await motif(page).getAttribute("src")) ?? "");

async function openEditor(page: Page, toolId: string, locale: "de" | "en") {
  await page.goto(`/${locale}/tools/${toolSlug(toolId, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(motif(page)).toBeVisible();
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

async function choose(dialog: Locator, name: string) {
  const radio = dialog.getByRole("radio", { name, exact: true });
  await dialog.locator(`label[for="${(await radio.getAttribute("id")) ?? ""}"]`).click();
  await expect(radio).toBeChecked();
}

async function fillText(page: Page, name: string, value: string) {
  const box = page.getByRole("textbox", { name, exact: true });
  await box.fill(value);
  await box.press("Enter");
}

test.describe("avatar", () => {
  test("derives initials from the name and escapes custom initials", async ({ page }) => {
    await openEditor(page, "avatar", "en");
    await expect.poll(() => svgOf(page)).toContain(">AL</text>");

    await fillText(page, "Name", "Grace Brewster Hopper");
    await expect.poll(() => svgOf(page)).toContain(">GH</text>");
    await fillText(page, "Letters", "3");
    await expect.poll(() => svgOf(page)).toContain(">GBH</text>");

    await fillText(page, "Custom initials", "<b>");
    await expect.poll(() => svgOf(page)).toContain(">&lt;b&gt;</text>");
    expect(await svgOf(page)).not.toContain("<b>");
  });

  test("switches to an identicon without text", async ({ page }) => {
    await openEditor(page, "avatar", "en");
    const before = await svgOf(page);
    await page.getByRole("radio", { name: "Identicon", exact: true }).click();
    await expect.poll(() => svgOf(page)).not.toBe(before);
    expect(await svgOf(page)).not.toContain("<text");
    await expect(page.getByRole("textbox", { name: "Grid" })).toBeVisible();
  });

  test("downloads SVG, PNG, JPG and WebP", async ({ page }) => {
    await openEditor(page, "avatar", "en");
    const dialog = await openExport(page);
    for (const [format, ext] of [
      ["SVG", "svg"],
      ["PNG", "png"],
      ["JPG", "jpg"],
      ["WebP", "webp"],
    ] as const) {
      await choose(dialog, format);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        dialog.getByTestId("export-download").click(),
      ]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`^musterli-avatar-\\d+\\.${ext}$`));
    }
  });
});

test.describe("placeholder image", () => {
  test("labels the canvas size and takes custom text", async ({ page }) => {
    await openEditor(page, "placeholder-image", "en");
    await expect.poll(() => svgOf(page)).toContain(">1200 × 630</text>");

    await expect(async () => {
      const width = page.getByLabel("Width", { exact: true });
      await width.fill("728");
      await width.press("Enter");
      await expect(page.getByRole("img", { name: /728 × \d+ px/ })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
    await expect.poll(() => svgOf(page)).toContain(">728 × 630</text>");

    await page.getByRole("radio", { name: "Custom text", exact: true }).click();
    await fillText(page, "Text", "Hero & image");
    await expect.poll(() => svgOf(page)).toContain(">Hero &amp; image</text>");
  });
});

for (const [toolId, de, en] of [
  ["avatar", "Avatar-Generator", "Avatar Generator"],
  ["placeholder-image", "Platzhalterbild-Generator", "Placeholder Image Generator"],
] as const) {
  test.describe(`${toolId} pages`, () => {
    for (const [locale, name] of [
      ["de", de],
      ["en", en],
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

    test("has no horizontal overflow at 375 px", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      for (const path of [`/de/tools/${toolSlug(toolId, "de")}`, `/en/${toolSlug(toolId, "en")}`]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBe(0);
      }
    });
  });
}
