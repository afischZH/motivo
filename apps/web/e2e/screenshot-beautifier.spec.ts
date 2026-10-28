/**
 * M4b-AP04: Screenshot beautifier (K6). A screenshot added with the file
 * chooser or pasted from the clipboard goes through the crop dialog, shows
 * in the preview and in the PNG export, stays out of share links, and a 4K
 * screenshot does not block the main thread. Axe in light and dark mode,
 * no horizontal overflow at 375 px. "Preview == PNG" for the placeholder
 * runs in preview-export.spec.ts.
 */
import { readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";
import { decodePng, encodeRgbPng } from "./support/png";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const TOOL = "screenshot-beautifier";

/** A solid colour PNG of the given size. */
function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < data.length; i += 3) data.set(rgb, i);
  return encodeRgbPng(data, width, height);
}

/**
 * A 3840 × 2160 PNG that compresses like a busy screenshot (flat panels plus
 * noisy "text" bands, about 3 MB): large enough to show main-thread work.
 */
function screenshot4k(): Buffer {
  const W = 3840;
  const H = 2160;
  const stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H);
  let s = 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = y * stride + 1 + x * 3;
      const block = ((x >> 5) + (y >> 4)) % 7;
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      const v = y % 40 < 10 && x % 300 < 160 ? s >>> 24 : 30 + block * 25;
      raw[o] = v;
      raw[o + 1] = (v * 3) & 255;
      raw[o + 2] = 200 - block * 10;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crcInput = Buffer.concat([head.subarray(4), data]);
    let c = 0xffffffff;
    for (const byte of crcInput) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const RED: [number, number, number] = [225, 29, 72];

/** The stage box of the preview (CSS output: stage as background, picture as element on top). */
const stage = (page: Page): Locator =>
  page.getByTestId("preview").locator(":scope > div[aria-hidden='true'] > div");
const cropDialog = (page: Page, locale: "de" | "en") =>
  page.getByRole("dialog", { name: locale === "de" ? "Zuschneiden" : "Crop" });

async function openEditor(page: Page, locale: "de" | "en" = "en") {
  await page.goto(`/${locale}/tools/${toolSlug(TOOL, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

/** The stage SVG (everything but the uploaded picture), decoded. */
async function stageSvg(page: Page): Promise<string> {
  await expect(stage(page)).toBeVisible();
  return stage(page).evaluate((el) => {
    const m = /charset=utf-8,([^"]*)"/.exec((el as HTMLElement).style.backgroundImage);
    return decodeURIComponent(m?.[1] ?? "");
  });
}

/** Start of the picture layer's background (the uploaded picture), or "" without one. */
async function pictureHref(page: Page): Promise<string> {
  const layer = page.getByTestId("preview").locator("[data-motif-element]");
  if ((await layer.count()) === 0) return "";
  return layer.evaluate((el) => (el as HTMLElement).style.backgroundImage.slice(0, 64));
}

async function applyCrop(page: Page, locale: "de" | "en") {
  const crop = cropDialog(page, locale);
  await expect(crop).toBeVisible({ timeout: 15_000 });
  await crop.getByRole("button", { name: locale === "de" ? "Übernehmen" : "Apply" }).click();
  await expect(crop).toBeHidden({ timeout: 15_000 });
}

async function chooseFile(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await page.locator('[data-control="screenshot"]').getByLabel("Choose file").setInputFiles(file);
  await applyCrop(page, "en");
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
  const id = await radio.getAttribute("id");
  await dialog.locator(`label[for="${id}"]`).click();
  await expect(radio).toBeChecked();
}

test.describe("screenshot beautifier", () => {
  test("takes a screenshot from the file chooser and exports it as PNG", async ({ page }) => {
    await openEditor(page);
    // Without upload: the placeholder is drawn on the stage, no picture layer.
    expect(await stageSvg(page)).toContain('viewBox="0 0 1440 900"');
    expect(await pictureHref(page)).toBe("");
    await chooseFile(page, {
      name: "app.png",
      mimeType: "image/png",
      buffer: solidPng(640, 400, RED),
    });
    await expect(page.getByTestId("asset-thumbnail")).toBeVisible();
    await expect.poll(() => pictureHref(page)).toContain("data:image/png;base64,");
    expect(await stageSvg(page)).not.toContain('viewBox="0 0 1440 900"');

    const dialog = await openExport(page);
    await choose(dialog, "PNG");
    const download = page.waitForEvent("download");
    await dialog.getByTestId("export-download").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.png$/);
    const path = await file.path();
    const png = decodePng(await readFile(path));
    expect(png.width / png.height).toBeCloseTo(16 / 9, 2);
    // The centre of the canvas shows the screenshot.
    const c = ((png.height >> 1) * png.width + (png.width >> 1)) * 4;
    const [r, g, b] = [png.data[c] ?? 0, png.data[c + 1] ?? 0, png.data[c + 2] ?? 0];
    expect(Math.abs(r - RED[0]) + Math.abs(g - RED[1]) + Math.abs(b - RED[2])).toBeLessThan(12);
  });

  test("takes a pasted screenshot and keeps it out of share links", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page);
    const png = solidPng(320, 200, RED).toString("base64");
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
      document.body.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, png);
    await applyCrop(page, "en");
    await expect.poll(() => pictureHref(page)).toContain("data:image/png;base64,");

    await page.getByLabel("Address or title").fill("intranet.example/secret");
    await expect.poll(() => stageSvg(page)).toContain("intranet.example/secret");
    await page.getByRole("button", { name: "Share" }).click();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/#d=/);
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(other.getByTestId("asset-thumbnail")).toHaveCount(0);
    expect(await stageSvg(other)).not.toContain("intranet.example");
    expect(await pictureHref(other)).toBe("");
    expect(url).not.toContain("intranet");
  });

  test("offers the tool's own output sizes", async ({ page }) => {
    await openEditor(page);
    const select = page.getByLabel("Size", { exact: true });
    await expect(select.locator("optgroup", { hasText: "Product Hunt" })).toHaveAttribute(
      "label",
      "For this tool",
    );
    await select.selectOption({ label: "Product Hunt (1270 × 760, landscape)" });
    await expect(stage(page)).toHaveCSS("width", "1270px");
    await expect(stage(page)).toHaveCSS("height", "760px");
  });

  test("handles a 4K screenshot without long tasks over 50 ms", async ({ page }, testInfo) => {
    test.slow();
    const buffer = screenshot4k();
    expect(buffer.length).toBeLessThan(5 * 1024 * 1024);
    // From disk, so Playwright streams the file instead of passing it through the page.
    const file = testInfo.outputPath("4k.png");
    await writeFile(file, buffer);
    await page.addInitScript(() => {
      const w = window as unknown as { __longTasks: [at: number, ms: number][] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
        }
      }).observe({ type: "longtask" });
    });
    const longTasksSince = (from: number) =>
      page.evaluate(
        (t) =>
          (window as unknown as { __longTasks: [number, number][] }).__longTasks.filter(
            ([at]) => at >= t,
          ),
        from,
      );
    const now = () => page.evaluate(() => performance.now());
    await openEditor(page);
    // Page load (hydration, lazy chunks) is not part of this check: wait for a quiet second.
    await expect
      .poll(
        async () => {
          const t = await now();
          return (await longTasksSince(t - 1000)).length;
        },
        { timeout: 15_000, intervals: [250] },
      )
      .toBe(0);
    const start = await now();
    await chooseFile(page, file);
    // A large picture reaches the preview as a blob: URL (decoded in steps), never as a style string.
    await expect.poll(() => pictureHref(page), { timeout: 20_000 }).toContain('url("blob:');
    await expect(page.getByTestId("asset-thumbnail")).toHaveAttribute("src", /^blob:/);
    // A few edits with the picture in place: each renders the preview again.
    await page.getByRole("radio", { name: "Window", exact: true }).click();
    await page.getByRole("radio", { name: "Light", exact: true }).click();
    await page.waitForTimeout(800);
    const longTasks = (await longTasksSince(start)).map(([at, ms]) => [Math.round(at - start), ms]);
    console.log(
      `4K screenshot long tasks ([ms after start, duration]): ${JSON.stringify(longTasks)}`,
    );
    expect(Math.max(0, ...longTasks.map(([, ms]) => ms ?? 0))).toBeLessThanOrEqual(50);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`has no axe violations with a screenshot (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "de");
      await page
        .locator('[data-control="screenshot"]')
        .getByLabel("Datei wählen")
        .setInputFiles({ name: "app.png", mimeType: "image/png", buffer: solidPng(64, 40, RED) });
      await applyCrop(page, "de");
      await expect(page.getByTestId("asset-thumbnail")).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("has no horizontal overflow at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openEditor(page, "de");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
