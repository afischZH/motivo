/**
 * M4b-AP01: Topographic lines and flow fields in the editor. Style and
 * field switches change the motif, the "Motion" GIF of both tools comes out
 * of the worker with moving frames, the SVG export stays within its size
 * budget, landing pages in DE and EN, and axe in light and dark mode.
 * Preview == PNG export lives in preview-export.spec.ts.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { readGifInfo } from "@musterli/exporters/gif-info";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const TOOLS = ["topo-lines", "flow-field"] as const;

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function motifSvg(page: Page): Promise<string> {
  await expect(motif(page)).toBeVisible();
  return decodeURIComponent((await motif(page).getAttribute("src")) ?? "");
}

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

/** Picks a radio card by clicking its visible label, as a user would. */
async function choose(scope: Locator, name: string) {
  const radio = scope.getByRole("radio", { name, exact: true });
  const id = await radio.getAttribute("id");
  await scope.locator(`label[for="${id}"]`).click();
  await expect(radio).toBeChecked();
}

test.describe("topographic lines", () => {
  test("switches from lines to filled bands", async ({ page }) => {
    await openEditor(page, "topo-lines", "de");
    const lines = await motifSvg(page);
    expect(lines).toContain('fill="none"');
    expect(lines).not.toContain("evenodd");
    await page.getByRole("radio", { name: "Flächen", exact: true }).click();
    await expect.poll(() => motifSvg(page)).toContain('fill-rule="evenodd"');
  });
});

test.describe("flow fields", () => {
  test("switches the field to swirls and tapers the strokes", async ({ page }) => {
    await openEditor(page, "flow-field", "de");
    const noise = await motifSvg(page);
    expect(noise).toContain('stroke-linecap="round"');
    await page.getByRole("radio", { name: "Wirbel", exact: true }).click();
    await expect.poll(() => motifSvg(page)).not.toBe(noise);
    // Turbulence and direction only apply to the noise field.
    await expect(page.getByRole("slider", { name: "Unruhe" })).toHaveCount(0);
    await page.getByRole("radio", { name: "Beidseitig spitz", exact: true }).click();
    await expect.poll(() => motifSvg(page)).toContain('<g stroke="none">');
  });
});

for (const toolId of TOOLS) {
  test(`${toolId}: SVG export within budget and a moving GIF from the worker`, async ({ page }) => {
    await openEditor(page, toolId, "en");
    let dialog = await openExport(page);
    await choose(dialog, "SVG");
    const [svgDownload] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    const svg = await readFile(await svgDownload.path(), "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.length).toBeLessThan(1.5 * 1024 * 1024);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    dialog = await openExport(page);
    await choose(dialog, "GIF");
    const panel = dialog.getByTestId("export-gif");
    await expect(panel).toBeVisible();
    // Motion is the first source of both tools.
    await expect(panel.getByRole("radio", { name: "Motion" })).toBeChecked();
    await panel.getByRole("slider", { name: "Frames" }).fill("3");
    await choose(panel, "320 × 180");
    const [gifDownload] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    const bytes = new Uint8Array(await readFile(await gifDownload.path()));
    expect(readGifInfo(bytes)).toMatchObject({
      width: 320,
      height: 180,
      frames: 3,
      complete: true,
    });
  });
}

const NAMES: Record<(typeof TOOLS)[number], Record<"de" | "en", string>> = {
  "topo-lines": { de: "Höhenlinien", en: "Topographic Lines" },
  "flow-field": { de: "Flow Fields", en: "Flow Fields" },
};

test.describe("landing pages", () => {
  for (const toolId of TOOLS) {
    for (const locale of ["de", "en"] as const) {
      test(`${toolId} (${locale}) explains the tool with an FAQ`, async ({ page }) => {
        const response = await page.goto(`/${locale}/${toolSlug(toolId, locale)}`);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(NAMES[toolId][locale]);
        await expect(page.locator("#faq-heading")).toBeVisible();
        await expect(page.locator("dt")).toHaveCount(4);
      });
    }
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`editors and landing pages have no axe violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const toolId of TOOLS) {
      await openEditor(page, toolId, "de");
      const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(editor.violations).toEqual([]);
      await page.goto(`/en/${toolSlug(toolId, "en")}`);
      const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(landing.violations).toEqual([]);
    }
  });
}
