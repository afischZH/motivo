/**
 * M4c-AP03: Animated CSS gradient. The preview is real CSS: calm with
 * reduced motion, animated (pan, colour shift through @property, floating
 * blob boxes) otherwise, with param values reaching the constant keyframes
 * through custom properties. Code export with the reduced motion rule, a
 * time-based GIF, landing pages in DE and EN, axe in light and dark, and no
 * horizontal overflow on small screens.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { readGifInfo } from "@musterli/exporters/gif-info";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";

const TOOL = "animated-gradient";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const element = (page: Page): Locator =>
  page.getByTestId("preview").locator("[data-motif-element]");

async function openEditor(page: Page, locale: "de" | "en" = "en") {
  await page.goto(`/${locale}/tools/${toolSlug(TOOL, locale)}`);
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

async function choose(scope: Locator, name: string) {
  const radio = scope.getByRole("radio", { name, exact: true });
  const id = await radio.getAttribute("id");
  await scope.locator(`label[for="${id}"]`).click();
  await expect(radio).toBeChecked();
}

/** Picks an option of a segmented control in the controls panel. */
async function segment(page: Page, name: string) {
  const radio = page.getByRole("radio", { name, exact: true }).first();
  await radio.click();
  await expect(radio).toBeChecked();
}

const animationName = (el: Locator) => el.evaluate((node) => getComputedStyle(node).animationName);

/**
 * Pauses the element's animation at `ms` and returns a computed property:
 * proves that the constant keyframes pick up the values of the element.
 */
function sampleAt(el: Locator, ms: number, property: string): Promise<string> {
  return el.evaluate(
    (node, { ms, property }) => {
      const [animation] = node.getAnimations();
      if (!animation) return "no animation";
      animation.pause();
      animation.currentTime = ms;
      return getComputedStyle(node).getPropertyValue(property).trim();
    },
    { ms, property },
  );
}

test.describe("animated gradient preview", () => {
  test("stays calm when the viewer prefers reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openEditor(page);
    await expect(element(page)).toBeVisible();
    await expect.poll(() => animationName(element(page))).toBe("none");
    expect(await element(page).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain(
      "linear-gradient(",
    );
    // The calm state is the start of the pan.
    expect(await element(page).evaluate((el) => getComputedStyle(el).backgroundPosition)).toBe(
      "0% 21.1%",
    );

    await segment(page, "Blobs");
    const boxes = page.getByTestId("preview").locator("[data-motif-element] ~ div");
    await expect(boxes).toHaveCount(4);
    for (const box of await boxes.all()) {
      expect(await animationName(box)).toBe("none");
    }
  });

  test("animates the real CSS when motion is allowed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openEditor(page);
    const el = element(page);
    await expect.poll(() => animationName(el)).toBe("musterli-ag-pan");
    // Halfway through the first iteration (ease-in-out is symmetric) the pan
    // is between its ends: 0% 21.1% and 100% 78.9%.
    const mid = await sampleAt(el, 6000, "background-position");
    const [x, y] = mid.split(" ").map((v) => Number.parseFloat(v));
    expect(x).toBeCloseTo(50, 0);
    expect(y).toBeCloseTo(50, 0);

    // Colour shift: at a quarter of the loop (4 colours) slot 1 holds colour 2.
    await segment(page, "Shift");
    await expect.poll(() => animationName(el)).toBe("musterli-ag-shift-4");
    expect(await sampleAt(el, 3000, "--musterli-ag-c1")).toBe("rgb(99, 102, 241)");
    const registered = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) =>
        [...sheet.cssRules].some((rule) => rule.cssText.includes("@property --musterli-ag-c1")),
      ),
    );
    expect(registered).toBe(true);

    // Blobs float as their own boxes; the element itself stays still.
    await segment(page, "Blobs");
    await expect.poll(() => animationName(el)).toBe("none");
    const box = page.getByTestId("preview").locator("[data-motif-element] ~ div").first();
    await expect.poll(() => animationName(box)).toBe("musterli-ag-float");
    expect(await sampleAt(box, 0, "transform")).toBe("matrix(1, 0, 0, 1, 0, 0)");
    const moved = await sampleAt(box, 4000, "transform");
    expect(moved).toMatch(/^matrix\(1, 0, 0, 1, /);
    expect(moved).not.toBe("matrix(1, 0, 0, 1, 0, 0)");

    // Switching to reduced motion stops everything.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => animationName(box)).toBe("none");
  });
});

test.describe("animated gradient exports", () => {
  test("copies CSS with a reduced motion rule and offers Tailwind and HTML", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "de");
    const dialog = await openExport(page, "de");
    await choose(dialog, "CSS");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText("@keyframes gradient-pan");
    await expect(code).toContainText("@media (prefers-reduced-motion: reduce)");
    await dialog.getByRole("button", { name: "Kopieren", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Kopiert! Ab ins Projekt damit.");
    const css = await page.evaluate(() => navigator.clipboard.readText());
    expect(css).toMatch(/^\.animated-gradient \{\n {2}background-image: linear-gradient\(120deg, /);
    expect(css).not.toContain("musterli");

    await choose(dialog, "Tailwind v4 @theme");
    await expect(code).toContainText("--animate-gradient-pan:");
    await choose(dialog, "Tailwind-Klassen");
    await expect(code).toContainText("motion-reduce:animate-none");
    await choose(dialog, "HTML-Beispiel");
    await expect(code).toContainText('<div class="animated-gradient"></div>');
  });

  test("exports the loop as a GIF from time", async ({ page }) => {
    await openEditor(page);
    const dialog = await openExport(page);
    await choose(dialog, "GIF");
    const panel = dialog.getByTestId("export-gif");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("radio", { name: "Motion" })).toBeChecked();
    await panel.getByRole("slider", { name: "Frames" }).fill("4");
    await choose(panel, "320 × 213");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    const bytes = new Uint8Array(await readFile(await download.path()));
    expect(readGifInfo(bytes)).toMatchObject({ width: 320, frames: 4, complete: true });
  });
});

test.describe("animated gradient pages", () => {
  for (const [locale, name] of [
    ["de", "Animierter Farbverlauf"],
    ["en", "Animated Gradient Generator"],
  ] as const) {
    test(`landing page ${locale}`, async ({ page }) => {
      const response = await page.goto(`/${locale}/${toolSlug(TOOL, locale)}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
      await expect(page.locator("#faq-heading")).toBeVisible();
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

  test("has no horizontal overflow at 375, 768 and 1280 px", async ({ page }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [`/de/tools/${toolSlug(TOOL, "de")}`, `/en/${toolSlug(TOOL, "en")}`]) {
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
