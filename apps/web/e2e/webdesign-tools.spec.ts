/**
 * W3 web design tools in the editor: fluid type scale (code exports, zoom
 * hint), section divider (shape picker, responsive HTML) and Open Graph
 * image (text in the motif, meta tags, PNG download). Landing pages, axe in
 * light and dark mode and no horizontal overflow at 375 px.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const TOOLS = ["fluid-type-scale", "section-divider", "og-image"] as const;

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function motifSvg(page: Page): Promise<string> {
  await expect(motif(page)).toBeVisible();
  return decodeURIComponent((await motif(page).getAttribute("src")) ?? "");
}

async function openEditor(page: Page, tool: string, locale: "de" | "en") {
  await page.goto(`/${locale}/tools/${toolSlug(tool, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(motif(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

async function openExport(page: Page, locale: "de" | "en" = "en"): Promise<Locator> {
  const name = locale === "de" ? "Exportieren" : "Export";
  const dialog = page.getByRole("dialog", { name: "Export" });
  // Retried: a click before hydration finishes does nothing.
  await expect(async () => {
    await page.getByRole("button", { name, exact: true }).click();
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

test.describe("fluid type scale", () => {
  test("exports clamp() variables and the Tailwind theme, and warns about zoom", async ({
    page,
  }) => {
    await openEditor(page, "fluid-type-scale", "en");
    expect(await motifSvg(page)).toContain("--step-0");

    const dialog = await openExport(page);
    await choose(dialog, "CSS variables");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText("--step-0: clamp(1rem, 0.9511rem + 0.2174vw, 1.125rem);");
    await choose(dialog, "Tailwind v4 @theme");
    await expect(code).toContainText("@theme {");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const large = page.getByRole("textbox", { name: "Base size large" });
    await large.fill("40");
    await large.press("Enter");
    await expect(page.getByText(/WCAG 1\.4\.4/)).toBeVisible();
  });
});

test.describe("section divider", () => {
  test("switches the shape and exports a responsive inline SVG", async ({ page }) => {
    await openEditor(page, "section-divider", "de");
    const before = await motifSvg(page);
    expect(before).toContain('preserveAspectRatio="none"');
    await page.getByRole("radio", { name: "Zacken" }).click();
    await expect.poll(() => motifSvg(page)).not.toBe(before);

    const dialog = await openExport(page, "de");
    await choose(dialog, "HTML-Beispiel");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText('aria-hidden="true"');
    await expect(code).toContainText("height: clamp(48px, 8.333vw, 120px);");
  });
});

test.describe("Open Graph image", () => {
  test("shows the typed title, writes meta tags and downloads a 1200 × 630 PNG", async ({
    page,
  }) => {
    await openEditor(page, "og-image", "en");
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    await title.fill("Hello from Musterli");
    await expect.poll(() => motifSvg(page)).toContain("Hello from Musterli");

    const dialog = await openExport(page);
    await choose(dialog, "Meta tags (HTML)");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText('content="Hello from Musterli"');
    await expect(code).toContainText('<meta property="og:image:width" content="1200">');

    await choose(dialog, "PNG");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
  });
});

test.describe("web design tool pages", () => {
  for (const tool of TOOLS) {
    test(`${tool}: landing pages in DE and EN explain the tool with an FAQ`, async ({ page }) => {
      for (const locale of ["de", "en"] as const) {
        const response = await page.goto(`/${locale}/${toolSlug(tool, locale)}`);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("#faq-heading")).toBeVisible();
        await expect(page.locator("dt")).toHaveCount(4);
      }
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`editors and a landing page have no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const tool of TOOLS) {
        await openEditor(page, tool, "de");
        await page.locator("body").press("Space");
        const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(editor.violations, tool).toEqual([]);
      }
      await page.goto(`/en/${toolSlug("og-image", "en")}`);
      const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(landing.violations).toEqual([]);
    });
  }

  test("has no horizontal overflow at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    for (const tool of TOOLS) {
      const path = `/de/tools/${toolSlug(tool, "de")}`;
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBe(0);
    }
  });
});
