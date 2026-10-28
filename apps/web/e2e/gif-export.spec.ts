/**
 * M4-AP04: GIF export. Frames are rendered through the tool's own render
 * path, encoded in the GIF worker (gifenc, loaded on demand), and the
 * downloaded file is checked structurally: header, size, frame count, loop.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { readGifInfo } from "@musterli/exporters/gif-info";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { LONG_TASKS } from "./support/long-tasks";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const editorPath = (toolId: string) => `/en/tools/${toolSlug(toolId, "en")}`;

async function openEditor(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
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

async function chooseGif(page: Page, toolId: string): Promise<{ dialog: Locator; panel: Locator }> {
  await openEditor(page, editorPath(toolId));
  const dialog = await openExport(page);
  await choose(dialog, "GIF");
  const panel = dialog.getByTestId("export-gif");
  await expect(panel).toBeVisible();
  return { dialog, panel };
}

async function downloadGif(page: Page, dialog: Locator) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download" }).click(),
  ]);
  const bytes = new Uint8Array(await readFile(await download.path()));
  return { name: download.suggestedFilename(), bytes };
}

test.describe("GIF export", () => {
  test("Blob: new variants as a looping GIF from the worker", async ({ page }) => {
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    const { dialog, panel } = await chooseGif(page, "blob");
    await expect(panel.getByRole("radio", { name: "New variants" })).toBeChecked();
    await panel.getByRole("slider", { name: "Frames" }).fill("4");
    await choose(panel, "320 × 320");
    await expect(dialog.getByTestId("export-gif-summary")).toHaveText(
      "Result: 320 × 320 px, 4 frames, 0.4 s per loop.",
    );
    const { name, bytes } = await downloadGif(page, dialog);
    expect(name).toMatch(/^musterli-blob-\d+\.gif$/);
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("GIF89a");
    expect(readGifInfo(bytes)).toMatchObject({
      width: 320,
      height: 320,
      frames: 4,
      loop: 0,
      complete: true,
    });
    await expect(dialog.getByTestId("export-status").getByRole("status")).toHaveText("Downloaded.");
    // Quantisation and encoding ran off the main thread.
    expect(workers.length).toBeGreaterThan(0);
  });

  test("CSS Patterns: color cycle, played once", async ({ page }) => {
    const { dialog, panel } = await chooseGif(page, "css-patterns");
    // Colour cycling is the only source, so no source choice is shown.
    await expect(panel.getByRole("radio", { name: "Color cycle" })).toHaveCount(0);
    await panel.getByRole("slider", { name: "Frames" }).fill("3");
    await panel.getByRole("slider", { name: "Time per frame" }).fill("200");
    await panel.getByRole("checkbox", { name: "Loop forever" }).uncheck();
    await choose(panel, "320 × 320");
    const { bytes } = await downloadGif(page, dialog);
    const info = readGifInfo(bytes);
    expect(info).toMatchObject({ version: "GIF89a", frames: 3, complete: true });
    expect(info.delays).toEqual([200, 200, 200]);
    expect(info.loop).toBeUndefined();
  });

  test("cancel stops a running export", async ({ page }) => {
    const { dialog, panel } = await chooseGif(page, "mesh-gradient");
    await choose(panel, "Color cycle");
    await panel.getByRole("slider", { name: "Frames" }).fill("28");
    await choose(panel, "1024 × 1024");
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    await dialog.getByRole("button", { name: "Download" }).click();
    await expect(dialog.getByRole("progressbar", { name: "Export progress" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog.getByTestId("export-status").getByRole("status")).toHaveText(
      "Export cancelled.",
    );
    await expect(dialog.getByRole("progressbar")).toHaveCount(0);
    expect(downloaded).toBe(false);
  });

  test(
    "keeps the main thread free while encoding a blurred gradient",
    LONG_TASKS,
    async ({ page, browserName }) => {
      // The Long Tasks API exists in Chromium only.
      test.skip(browserName !== "chromium", "Long Tasks API is Chromium-only");
      const { dialog, panel } = await chooseGif(page, "mesh-gradient");
      await choose(panel, "Color cycle");
      await panel.getByRole("slider", { name: "Frames" }).fill("20");
      await choose(panel, "1024 × 1024");
      await page.evaluate(() => {
        const w = window as unknown as { __longTasks: number[] };
        w.__longTasks = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) w.__longTasks.push(Math.round(entry.duration));
        }).observe({ type: "longtask" });
      });
      const { bytes } = await downloadGif(page, dialog);
      expect(readGifInfo(bytes).frames).toBe(20);
      const longTasks = await page.evaluate(
        () => (window as unknown as { __longTasks: number[] }).__longTasks,
      );
      // Locally none at all. Drawing and reading 20 frames on the main thread
      // gave a long task of 50 to 130 ms per frame; a busy CI machine may add
      // one or two short ones (garbage collection, React updating progress).
      expect(longTasks.length, JSON.stringify(longTasks)).toBeLessThanOrEqual(2);
      expect(
        longTasks.every((ms) => ms < 100),
        JSON.stringify(longTasks),
      ).toBe(true);
    },
  );

  test("over the pixel budget, download is blocked with an explanation", async ({ page }) => {
    const { dialog, panel } = await chooseGif(page, "blob");
    await panel.getByRole("slider", { name: "Frames" }).fill("60");
    await choose(panel, "1024 × 1024");
    await expect(dialog.getByTestId("export-gif-budget")).toContainText("Choose at most 28 frames");
    await expect(dialog.getByRole("button", { name: "Download" })).toBeDisabled();
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`GIF options have no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await chooseGif(page, "blob");
      const results = await new AxeBuilder({ page })
        .include('[data-testid="export-dialog"]')
        .withTags(AXE_TAGS)
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
