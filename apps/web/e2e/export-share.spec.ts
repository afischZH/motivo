import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type BrowserContext,
  type Download,
  type Locator,
  type Page,
} from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function motifSrc(page: Page): Promise<string> {
  const img = motif(page);
  await expect(img).toBeVisible();
  return (await img.getAttribute("src")) ?? "";
}

/**
 * Clipboard permissions exist only in Chromium. Firefox and WebKit get an
 * in-memory stand-in for navigator.clipboard text so the flows stay testable.
 */
async function enableClipboard(context: BrowserContext, browserName: string) {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    return;
  }
  await context.addInitScript(() => {
    let text = "";
    const clipboard = navigator.clipboard ?? ({} as Clipboard);
    Object.defineProperty(clipboard, "writeText", {
      configurable: true,
      value: async (value: string) => {
        text = value;
      },
    });
    Object.defineProperty(clipboard, "readText", {
      configurable: true,
      value: async () => text,
    });
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    }
  });
}

/** Opens the editor and waits until it is hydrated (shortcuts and hash loading are bound). */
async function openEditor(page: Page, path: string, { svg = true } = {}) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // SVG tools show an <img>; CSS tools a styled box.
  if (svg) await expect(motif(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
}

async function openExport(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Export" });
  // Retried: a click before hydration finishes does nothing.
  await expect(async () => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  return dialog;
}

/** Clicks Share until the confirmation shows and returns the copied link. */
async function shareLink(page: Page): Promise<string> {
  const flash = page.getByTestId("shell-flash");
  await expect(async () => {
    await page.getByRole("button", { name: "Share" }).click();
    await expect(flash).toHaveText("Link copied! Anyone who opens it sees exactly this design.", {
      timeout: 1000,
    });
  }).toPass();
  return page.evaluate(() => navigator.clipboard.readText());
}

/** Picks a radio card by clicking its visible label, as a user would. */
async function choose(dialog: Locator, name: string) {
  const radio = dialog.getByRole("radio", { name, exact: true });
  const id = await radio.getAttribute("id");
  await dialog.locator(`label[for="${id}"]`).click();
  await expect(radio).toBeChecked();
}

async function downloaded(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFile(path);
}

test.describe("export dialog", () => {
  test("Ctrl/Cmd+E opens it, Escape closes it", async ({ page }) => {
    await openEditor(page, "/en/tools/blob-generator");
    const dialog = page.getByRole("dialog", { name: "Export" });
    await expect(async () => {
      await page.locator("body").press("ControlOrMeta+E");
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    // Focus is inside the modal.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest("dialog") !== null))
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("downloads SVG", async ({ page }) => {
    await openEditor(page, "/en/tools/blob-generator");
    const dialog = await openExport(page);
    await choose(dialog, "SVG");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^motivo-blob-\d+\.svg$/);
    const text = (await downloaded(download)).toString("utf8");
    expect(text.startsWith("<svg")).toBe(true);
    expect(text).toContain('viewBox="0 0 1080 1080"');
    await expect(dialog.getByRole("status")).toHaveText("Downloaded.");
  });

  test("downloads PNG at 2x through the raster worker", async ({ page }) => {
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    await openEditor(page, "/en/tools/blob-generator");
    const dialog = await openExport(page);
    await choose(dialog, "PNG");
    await choose(dialog, "2× (2160 × 2160)");
    await expect(dialog.getByTestId("export-output-size")).toHaveText("Result: 2160 × 2160 px.");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^motivo-blob-\d+\.png$/);
    const png = await downloaded(download);
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    // IHDR: width and height as big-endian uint32 at bytes 16 and 20.
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(2160);
    expect(png.readUInt32BE(20)).toBe(2160);
    // The encoder ran off the main thread (Chromium has OffscreenCanvas).
    expect(workers.length).toBeGreaterThan(0);
  });

  test("re-renders a custom size with another aspect ratio", async ({ page }) => {
    await openEditor(page, "/en/tools/blob-generator");
    const dialog = await openExport(page);
    await choose(dialog, "PNG");
    await choose(dialog, "Custom size");
    await dialog.getByLabel("Width").fill("800");
    await dialog.getByLabel("Height").fill("400");
    await dialog.getByLabel("Height").press("Enter");
    await expect(dialog.getByTestId("export-output-size")).toHaveText(
      "Result: 800 × 400 px. Different aspect ratio: the design is recomposed for this format.",
    );
    // Enter in the field must not close the dialog.
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    const png = await downloaded(download);
    expect(png.readUInt32BE(16)).toBe(800);
    expect(png.readUInt32BE(20)).toBe(400);
  });

  test("shows code with a copy button for CSS exports", async ({ page, context, browserName }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "/en/tools/css-gradient-generator", { svg: false });
    const dialog = await openExport(page);
    await choose(dialog, "Tailwind classes");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText("bg-");
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copied! Off to your project.");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(await code.textContent());
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`open dialog has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "/en/tools/blob-generator");
      const dialog = await openExport(page);
      await choose(dialog, "JPG");
      await expect(dialog.getByLabel("Quality")).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include('[data-testid="export-dialog"]')
        .withTags(AXE_TAGS)
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("share link", () => {
  test("copied link opens the same design in a new page", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "/en/tools/blob-generator");
    const defaults = await motifSrc(page);
    await page.getByRole("button", { name: "Lava" }).click();
    await page.locator("body").press("Space");
    await expect.poll(() => motifSrc(page)).not.toBe(defaults);
    const original = await motifSrc(page);

    const link = await shareLink(page);
    expect(link).toMatch(/\/en\/tools\/blob-generator#d=[\w-]+$/);
    // Sharing does not rewrite the current URL.
    expect(new URL(page.url()).hash).toBe("");

    const other = await context.newPage();
    await openEditor(other, link);
    await expect.poll(() => motifSrc(other)).toBe(original);
    await expect(other.getByTestId("shell-notice")).toHaveCount(0);

    // An M1 link with the tool id is redirected to the slug and keeps the design.
    const legacy = await context.newPage();
    await openEditor(legacy, link.replace("/blob-generator#", "/blob#"));
    await expect(legacy).toHaveURL(/\/en\/tools\/blob-generator#d=/);
    await expect.poll(() => motifSrc(legacy)).toBe(original);
  });

  test("an invalid hash keeps the defaults and shows a dismissible notice", async ({ page }) => {
    await openEditor(page, "/en/tools/blob-generator");
    const defaults = await motifSrc(page);

    await openEditor(page, "/en/tools/blob-generator#d=@@not-a-design@@");
    const notice = page.getByRole("alert").filter({ hasText: "The shared link is damaged." });
    await expect(notice).toBeVisible();
    expect(await motifSrc(page)).toBe(defaults);
    await notice.getByRole("button", { name: "Dismiss notice" }).click();
    await expect(notice).toBeHidden();
  });

  test("a hash change loads the new design", async ({ page, context, browserName }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "/en/tools/blob-generator");
    const defaults = await motifSrc(page);
    await page.locator("body").press("Space");
    await expect.poll(() => motifSrc(page)).not.toBe(defaults);
    const link = await shareLink(page);
    const shared = await motifSrc(page);

    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(() => motifSrc(page)).toBe(defaults);
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, new URL(link).hash);
    await expect.poll(() => motifSrc(page)).toBe(shared);
  });
});
