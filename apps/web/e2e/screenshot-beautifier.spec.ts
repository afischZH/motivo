/**
 * M4b-AP04: Screenshot beautifier (K6). A screenshot added with the file
 * chooser or pasted from the clipboard goes through the crop dialog, shows
 * in the preview and in the PNG export, stays out of share links, and a 4K
 * screenshot does not block the main thread. Axe in light and dark mode,
 * no horizontal overflow at 375 px. "Preview == PNG" for the placeholder
 * runs in preview-export.spec.ts.
 *
 * M4b-AP07: website mockups. One screenshot fills a responsive set and the
 * PNG export equals the preview; the live view loads a page in sandboxed
 * frames (a local test page, routed) and "Take this view" captures it with
 * a stubbed `getDisplayMedia` stream into the mockup.
 */
import { readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";
import { comparePngs } from "./support/compare";
import { decodePng, encodeRgbPng } from "./support/png";
import { LONG_TASKS } from "./support/long-tasks";

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
const GREEN: [number, number, number] = [22, 163, 74];

/** A tall "website" screenshot: horizontal colour bands, so a wrong crop shows. */
function bandsPng(width: number, height: number): Buffer {
  const bands: [number, number, number][] = [
    [30, 64, 175],
    [250, 204, 21],
    [225, 29, 72],
    [22, 163, 74],
  ];
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const rgb = bands[Math.floor(y / 480) % bands.length] ?? RED;
    for (let x = 0; x < width; x++) data.set(rgb, (y * width + x) * 3);
  }
  return encodeRgbPng(data, width, height);
}

/** Backgrounds of the mockup's picture boxes (raster pictures, not the SVG device boxes). */
async function mockupPictures(page: Page): Promise<string[]> {
  const boxes = page.getByTestId("preview").locator("[data-motif-element] ~ div");
  const all = await boxes.evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).style.backgroundImage.slice(0, 40)),
  );
  return all.filter((b) => /data:image\/png|blob:/.test(b));
}

/** The live view's test page (routed, never fetched from the network). */
const LIVE_PAGE = "https://live.example.test/";
async function routeLivePage(page: Page) {
  await page.route(`${LIVE_PAGE}**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><title>Live test</title><body style="margin:0;background:#16a34a"><main><h1 style="color:#fff">Live test page</h1></main></body></html>',
    }),
  );
}

/** Share of pixels within `tol` of `rgb`. */
function shareOf(png: { data: Uint8Array }, rgb: [number, number, number], tol = 12): number {
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const d =
      Math.abs((png.data[i] ?? 0) - rgb[0]) +
      Math.abs((png.data[i + 1] ?? 0) - rgb[1]) +
      Math.abs((png.data[i + 2] ?? 0) - rgb[2]);
    if (d < tol) n++;
  }
  return n / (png.data.length / 4);
}

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

async function exportPng(page: Page, scale?: string): Promise<Buffer> {
  const dialog = await openExport(page);
  await choose(dialog, "PNG");
  if (scale) await choose(dialog, scale);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByTestId("export-download").click(),
  ]);
  return readFile(await download.path());
}

/** Sets the design size, one edge at a time (each confirmed by the preview label). */
async function setSize(page: Page, width: number, height: number) {
  const label = (w: number | string, h: number | string) =>
    page.getByRole("img", { name: new RegExp(`${w} × ${h} px`) });
  await expect(async () => {
    const field = page.getByLabel("Width", { exact: true });
    await field.fill(String(width));
    await field.press("Enter");
    await expect(label(width, "\\d+")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await expect(async () => {
    const field = page.getByLabel("Height", { exact: true });
    await field.fill(String(height));
    await field.press("Enter");
    await expect(label(width, height)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
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

  /**
   * Upload, crop, two edits and the autosave draft of a 4K screenshot in a
   * fresh browser profile; returns the long tasks ([ms after the upload
   * starts, duration]).
   */
  async function longTasksOf4kUpload(browser: Browser, file: string): Promise<number[][]> {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
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
      // Long enough for the autosave draft (800 ms after the last edit) to be
      // written inside the window every time, not only on a fast run.
      await page.waitForTimeout(1500);
      return (await longTasksSince(start)).map(([at, ms]) => [Math.round(at - start), ms ?? 0]);
    } finally {
      await context.close();
    }
  }

  /**
   * The budget stays 50 ms; what changes is how often it is sampled. One run
   * measures wall-clock time on a CPU shared with the server, the browser's
   * raster threads and whatever else runs on the machine: with two busy
   * cores, single runs failed 2 of 6 to 2 of 8 times with tasks of 25 to
   * 45 ms (React commit after the upload, garbage collection of the
   * multi-megabyte data URI, the schema check of the upload) stretched to
   * 75 to 95 ms. As in `main-thread-budget.test.ts`, the best of up to three
   * runs counts: noise only ever adds time, and a real regression (a task
   * over 50 ms on a quiet CPU) fails all three (M5b-AP01).
   */
  const LONG_TASK_RUNS = 3;

  test(
    "handles a 4K screenshot without long tasks over 50 ms",
    LONG_TASKS,
    async ({ browser }, testInfo) => {
      test.setTimeout(180_000);
      const buffer = screenshot4k();
      expect(buffer.length).toBeLessThan(5 * 1024 * 1024);
      // From disk, so Playwright streams the file instead of passing it through the page.
      const file = testInfo.outputPath("4k.png");
      await writeFile(file, buffer);
      let best = Number.POSITIVE_INFINITY;
      for (let run = 1; run <= LONG_TASK_RUNS && best > 50; run++) {
        const longTasks = await longTasksOf4kUpload(browser, file);
        const worst = Math.max(0, ...longTasks.map(([, ms]) => ms ?? 0));
        best = Math.min(best, worst);
        // Every run stays visible in the report, so a regression that shows
        // up only in some runs is noticed even when the best one passes.
        testInfo.annotations.push({
          type: "long-tasks",
          description: `run ${run}: worst ${worst} ms`,
        });
        console.log(
          `4K screenshot run ${run}, long tasks ([ms after start, duration]): ${JSON.stringify(longTasks)}`,
        );
      }
      expect(best).toBeLessThanOrEqual(50);
    },
  );

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
      // M4b-AP07: as a responsive website mockup (device, layout, finish, extra uploads, live bar).
      await page.getByLabel("Gerät", { exact: true }).selectOption("responsive");
      await expect.poll(() => mockupPictures(page)).toHaveLength(4);
      await routeLivePage(page);
      await page.getByLabel("Adresse oder Titel").fill(LIVE_PAGE);
      await page.getByLabel("Live-Ansicht", { exact: true }).click();
      await expect(page.getByTestId("live-bar")).toBeVisible();
      const frames = page.locator("[data-live-frame] iframe");
      await expect(frames).toHaveCount(4);
      // Each frame has its own name; what the framed website contains is not ours to check.
      for (const title of await frames.evaluateAll((els) =>
        els.map((el) => (el as HTMLIFrameElement).title),
      )) {
        expect(title).toMatch(/^Live-Ansicht: (Monitor|Laptop|Tablet|Smartphone)$/);
      }
      const results = await new AxeBuilder({ page })
        .withTags(AXE_TAGS)
        .exclude("[data-live-frame] iframe")
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test("has no horizontal overflow at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openEditor(page, "de");
    await page.getByLabel("Gerät", { exact: true }).selectOption("responsive");
    await routeLivePage(page);
    await page.getByLabel("Adresse oder Titel").fill(LIVE_PAGE);
    await page.getByLabel("Live-Ansicht", { exact: true }).click();
    await expect(page.getByTestId("live-bar")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
  test("fills a responsive set with one screenshot; the PNG equals the preview", async ({
    page,
  }, testInfo) => {
    await openEditor(page);
    await chooseFile(page, {
      name: "site.png",
      mimeType: "image/png",
      buffer: bandsPng(1440, 2400),
    });
    await page.getByLabel("Device", { exact: true }).selectOption("responsive");
    // One upload, four devices: every screen shows a crop of it.
    await expect.poll(() => mockupPictures(page)).toHaveLength(4);
    for (const b of await mockupPictures(page)) expect(b).toContain("data:image/png");
    await page.getByLabel("Address or title").fill("https://example.com/");
    await expect.poll(() => stageSvg(page)).toContain("example.com");
    expect(await stageSvg(page)).not.toContain("https://example");

    const SIZE = { width: 480, height: 320 };
    await setSize(page, SIZE.width, SIZE.height);
    await page.locator("body").press("1");
    await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const shown = page.getByTestId("preview").locator(":scope > div[aria-hidden='true']");
    await expect(shown).toHaveCSS("width", `${SIZE.width}px`);
    const box = await shown.boundingBox();
    if (!box) throw new Error("preview has no bounding box");
    const preview = await page.screenshot({
      animations: "disabled",
      scale: "css",
      clip: { x: Math.round(box.x), y: Math.round(box.y), ...SIZE },
    });
    const exported = await exportPng(page, `1× (${SIZE.width} × ${SIZE.height})`);
    const result = await comparePngs(page, preview, exported, 24);
    await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
    await testInfo.attach("export.png", { body: exported, contentType: "image/png" });
    await testInfo.attach("diff.png", {
      body: Buffer.from(result.diffPng.split(",")[1] ?? "", "base64"),
      contentType: "image/png",
    });
    await writeFile(testInfo.outputPath("preview.png"), preview);
    await writeFile(testInfo.outputPath("export.png"), exported);
    await writeFile(
      testInfo.outputPath("diff.png"),
      Buffer.from(result.diffPng.split(",")[1] ?? "", "base64"),
    );
    expect({ width: result.width, height: result.height }).toEqual(SIZE);
    // A hard band edge downscaled about 5× lands on a different row in the CSS
    // preview than on the export canvas; where it meets a device edge one row
    // is "stray" (Chromium: one row of about 140 px, 0.13 %). A missing or
    // moved picture changes thousands of pixels.
    expect(result.strayRatio).toBeLessThanOrEqual(0.002);
    expect(result.diffRatio).toBeLessThanOrEqual(0.02);
    expect(result.meanDiffOffEdges).toBeLessThanOrEqual(2);
    // Top of the page ("above the fold"): the first band shows on the screens.
    expect(shareOf(decodePng(exported), [30, 64, 175])).toBeGreaterThan(0.02);
  });

  test("shows the address live and takes the view into the mockup", async ({ page }) => {
    await routeLivePage(page);
    // A fake tab capture: a canvas stream painted green at the window size.
    await page.addInitScript(
      ({ rgb }) => {
        const w = window as unknown as {
          __capture: { calls: unknown[]; tracks: MediaStreamTrack[] };
        };
        w.__capture = { calls: [], tracks: [] };
        navigator.mediaDevices.getDisplayMedia = async (options?: DisplayMediaStreamOptions) => {
          w.__capture.calls.push(options);
          const canvas = document.createElement("canvas");
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          const ctx = canvas.getContext("2d");
          const paint = () => {
            if (!ctx) return;
            ctx.fillStyle = `rgb(${rgb.join(",")})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          };
          paint();
          const timer = setInterval(paint, 30);
          const stream = canvas.captureStream(30);
          for (const t of stream.getTracks()) {
            w.__capture.tracks.push(t);
            const stop = t.stop.bind(t);
            t.stop = () => {
              clearInterval(timer);
              stop();
            };
          }
          return stream;
        };
      },
      { rgb: GREEN },
    );
    await openEditor(page);
    await page.getByRole("button", { name: "Laptop", exact: true }).click();
    await page.getByLabel("Address or title").fill("live.example.test/");
    await page.getByLabel("Live view", { exact: true }).click();

    const frame = page.locator("[data-live-frame] iframe");
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("src", LIVE_PAGE);
    await expect(frame).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups",
    );
    await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    // The page loads inside the frame (the CSP opens frame-src https: on this route).
    await expect(
      page
        .frameLocator("[data-live-frame] iframe")
        .getByRole("heading", { name: "Live test page" }),
    ).toBeVisible();
    await expect(page.getByTestId("live-bar")).toContainText(
      "If the view stays empty, the website does not allow embedding.",
    );

    await page.getByTestId("live-capture").click();
    // Afterwards the live view is off, so the frames and the bar are gone.
    await expect(page.getByTestId("live-bar")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("[data-live-frame]")).toHaveCount(0);
    const capture = await page.evaluate(() => {
      const c = (
        window as unknown as { __capture: { calls: unknown[]; tracks: MediaStreamTrack[] } }
      ).__capture;
      return { calls: c.calls, states: c.tracks.map((t) => t.readyState) };
    });
    expect(capture.calls).toEqual([
      { video: true, audio: false, preferCurrentTab: true, selfBrowserSurface: "include" },
    ]);
    // Tracks are stopped right after the capture.
    expect(capture.states).toEqual(["ended"]);
    // The captured picture is the laptop's screenshot now.
    await expect.poll(() => mockupPictures(page)).toHaveLength(1);
    await expect(page.getByTestId("asset-thumbnail")).toBeVisible();

    const png = decodePng(await exportPng(page));
    expect(shareOf(png, GREEN)).toBeGreaterThan(0.1);
  });
});
