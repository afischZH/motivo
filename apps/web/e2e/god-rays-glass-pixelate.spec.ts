/**
 * M6-AP01: god rays, fractal glass and pixelate on the shared raster-effect
 * stage (docs/ARCHITECTURE.md 4.14 and 4.16). Landing pages and catalogue,
 * preview == PNG export (the same pixels), the pixelate grid at 2× (every
 * block doubled) and its SVG export with the shape budget, no long tasks
 * with a 12 MP photo, axe in light and dark mode and no horizontal
 * overflow at 375 px.
 */
import { readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { comparePngs } from "./support/compare";
import { decodePng, encodeRgbPng } from "./support/png";
import { LONG_TASKS } from "./support/long-tasks";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const SIZE = { width: 480, height: 320 };
const TOOLS = ["god-rays", "fractal-glass", "pixelate"] as const;
type Locale = "de" | "en";

/** Diagonal gradient with a bright disc right of the centre. */
function photoPng(width: number, height: number): Buffer {
  const data = new Uint8Array(width * height * 3);
  const r = Math.min(width, height) * 0.2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const disc = Math.hypot(x - width * 0.65, y - height * 0.4) < r;
      data.set(
        disc ? [250, 245, 230] : [Math.round((120 * x) / width), Math.round((90 * y) / height), 70],
        (y * width + x) * 3,
      );
    }
  }
  return encodeRgbPng(data, width, height);
}

/** A 4000 × 3000 (12 MP) PNG with smooth bands (Sub filter keeps the file small). */
function photo12mp(): Buffer {
  const W = 4000;
  const H = 3000;
  const stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 1;
    const band = ((y >> 6) * 37) & 255;
    let prev = [0, 0, 0];
    for (let x = 0; x < W; x++) {
      const px = [((x * 255) / W) | 0, band, (x >> 7) & 1 ? 200 : 60];
      const o = y * stride + 1 + x * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = ((px[c] ?? 0) - (prev[c] ?? 0)) & 255;
      prev = px;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, k) => {
    let c = k;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    let c = 0xffffffff;
    for (const byte of Buffer.concat([head.subarray(4), data])) {
      c = (crcTable[(c ^ byte) & 255] ?? 0) ^ (c >>> 8);
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
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function openEditor(page: Page, tool: string, locale: Locale = "en") {
  await page.goto(`/${locale}/tools/${toolSlug(tool, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

const canvas = (page: Page): Locator =>
  page.getByTestId("preview").locator("canvas[data-raster-motif]");

async function expectRendered(
  page: Page,
  design: { width: number; height: number },
  pixels?: { width: number; height: number },
) {
  await expect(canvas(page)).toHaveAttribute("data-design", `${design.width}x${design.height}`, {
    timeout: 20_000,
  });
  if (pixels) {
    await expect(canvas(page)).toHaveAttribute("data-rendered", `${pixels.width}x${pixels.height}`);
  }
}

async function previewPng(page: Page): Promise<Buffer> {
  const url = await canvas(page).evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"));
  return Buffer.from(url.split(",")[1] ?? "", "base64");
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

async function download(
  page: Page,
  format: string,
  scale?: string,
): Promise<{ name: string; body: Buffer }> {
  const dialog = await openExport(page);
  await choose(dialog, format);
  if (scale) await choose(dialog, scale);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByTestId("export-download").click(),
  ]);
  const body = await readFile(await file.path());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  return { name: file.suggestedFilename(), body };
}

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

async function zoom100(page: Page) {
  await page.locator("body").press("1");
  await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "true");
}

async function choosePhoto(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
  locale: Locale = "en",
) {
  await page
    .locator('[data-control="photo"]')
    .getByLabel(locale === "de" ? "Datei wählen" : "Choose file")
    .setInputFiles(file);
  const crop = page.getByRole("dialog", { name: locale === "de" ? "Zuschneiden" : "Crop" });
  await expect(crop).toBeVisible({ timeout: 15_000 });
  await crop.getByRole("button", { name: locale === "de" ? "Übernehmen" : "Apply" }).click();
  await expect(crop).toBeHidden({ timeout: 20_000 });
}

/** Two edits per tool with the photo in place (segmented controls, by English label). */
const EDITS: Readonly<Record<(typeof TOOLS)[number], readonly [string, string]>> = {
  "god-rays": ["Screen", "Add"],
  "fractal-glass": ["Flat", "Ridged"],
  pixelate: ["Original", "Palette"],
};

// Compare device pixels 1:1.
test.use({ deviceScaleFactor: 1 });

test.describe("god rays, fractal glass and pixelate landing pages", () => {
  const PAGES: { tool: string; locale: Locale; title: string }[] = [
    { tool: "god-rays", locale: "de", title: "Lichtstrahlen-Effekt (God Rays)" },
    { tool: "god-rays", locale: "en", title: "God Rays Effect" },
    { tool: "fractal-glass", locale: "de", title: "Fractal-Glass-Effekt (Riffelglas)" },
    { tool: "fractal-glass", locale: "en", title: "Fractal Glass Effect" },
    { tool: "pixelate", locale: "de", title: "Bild verpixeln (Pixelate und Posterize)" },
    { tool: "pixelate", locale: "en", title: "Pixelate Image (Posterize)" },
  ];
  for (const p of PAGES) {
    test(`${p.tool} (${p.locale}) has content, a motif and an OG image`, async ({ page }) => {
      const response = await page.goto(`/${p.locale}/${toolSlug(p.tool, p.locale)}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.title);
      await expect(
        page.getByRole("link", {
          name: p.locale === "de" ? "Generator öffnen" : "Open the generator",
        }),
      ).toHaveAttribute("href", `/${p.locale}/tools/${toolSlug(p.tool, p.locale)}`);
      const motif = await page.request.get(`/motifs/${p.tool}/default.svg`);
      expect(motif.status()).toBe(200);
      expect(await motif.text()).toMatch(/^<svg /);
      const og = await page.locator('meta[property="og:image"]').getAttribute("content");
      expect((await page.request.get(new URL(og ?? "").pathname)).status()).toBe(200);
    });
  }

  test("all three are in the catalogue, the category page and the sitemap", async ({ page }) => {
    await page.goto("/en/tools/category/image-effects");
    const main = page.getByRole("main");
    for (const name of ["God Rays Effect", "Fractal Glass Effect", "Pixelate Image"]) {
      await expect(main.getByRole("link", { name }).first()).toBeVisible();
    }
    await page.goto("/de/tools");
    await expect(page.getByRole("link", { name: "Bild verpixeln", exact: true })).toBeVisible();
    const xml = await (await page.request.get("/sitemap.xml")).text();
    for (const slug of [
      "/de/lichtstrahlen-generator",
      "/en/god-rays-generator",
      "/de/fractal-glass-generator",
      "/en/fractal-glass-generator",
      "/de/bild-verpixeln",
      "/en/pixelate-image",
    ]) {
      expect(xml).toContain(slug);
    }
  });
});

test.describe("preview equals export", () => {
  for (const tool of TOOLS) {
    test(`${tool}: the PNG export has the preview's pixels`, async ({ page }, testInfo) => {
      await openEditor(page, tool);
      await expectRendered(page, { width: 1500, height: 1000 });
      await setSize(page, SIZE.width, SIZE.height);
      await zoom100(page);
      await expectRendered(page, SIZE, SIZE);
      const preview = await previewPng(page);
      const exported = await download(page, "PNG", `1× (${SIZE.width} × ${SIZE.height})`);
      expect(exported.name).toMatch(new RegExp(`^musterli-${tool}-\\d+\\.png$`));
      const result = await comparePngs(page, preview, exported.body, 0);
      await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
      await testInfo.attach("export.png", { body: exported.body, contentType: "image/png" });
      expect(result.diffRatio).toBe(0);
    });
  }

  test("pixelate: the 2× export is the same grid with every block doubled", async ({ page }) => {
    await openEditor(page, "pixelate");
    await setSize(page, SIZE.width, SIZE.height);
    const one = decodePng(
      (await download(page, "PNG", `1× (${SIZE.width} × ${SIZE.height})`)).body,
    );
    const two = decodePng(
      (await download(page, "PNG", `2× (${SIZE.width * 2} × ${SIZE.height * 2})`)).body,
    );
    expect([two.width, two.height]).toEqual([SIZE.width * 2, SIZE.height * 2]);
    let differing = 0;
    for (let y = 0; y < SIZE.height; y++) {
      for (let x = 0; x < SIZE.width; x++) {
        const a = (y * SIZE.width + x) * 4;
        const b = (y * 2 * two.width + x * 2) * 4;
        if (one.data[a] !== two.data[b] || one.data[a + 1] !== two.data[b + 1]) differing++;
      }
    }
    expect(differing).toBe(0);
  });
});

test.describe("pixelate SVG", () => {
  test("exports the blocks as rectangles; pixel size 1 on 12 MP explains the budget", async ({
    page,
  }) => {
    await openEditor(page, "pixelate");
    const svg = (await download(page, "SVG")).body.toString("utf8");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1500" height="1000"/);
    expect(svg).toContain('viewBox="0 0 94 63"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toMatch(/<script|<image|data:/);
    expect(svg.length).toBeLessThan(1_000_000);

    await setSize(page, 4000, 3000);
    const field = page.getByRole("textbox", { name: "Pixel size", exact: true });
    await field.fill("1");
    await field.press("Enter");
    const dialog = await openExport(page);
    await choose(dialog, "SVG");
    await expect(dialog.getByTestId("export-vector-budget")).toContainText("Too many shapes");
    await expect(dialog.getByTestId("export-download")).toBeDisabled();
    await choose(dialog, "PNG");
    await expect(dialog.getByTestId("export-download")).toBeEnabled();
  });
});

test.describe("photos", () => {
  test("god rays take a photo: size follows it, the rays brighten it", async ({ page }) => {
    await openEditor(page, "god-rays");
    await choosePhoto(page, {
      name: "lamp.png",
      mimeType: "image/png",
      buffer: photoPng(640, 480),
    });
    await expect(page.getByTestId("asset-name")).toHaveText("lamp.png");
    await expectRendered(page, { width: 640, height: 480 });
    const png = decodePng((await download(page, "PNG")).body);
    expect([png.width, png.height]).toEqual([640, 480]);
    // Below the disc, toward the corner away from the light, the rays add light.
    const at = (x: number, y: number) => png.data[(y * png.width + x) * 4] ?? 0;
    expect(at(Math.round(640 * 0.65), Math.round(480 * 0.4))).toBeGreaterThan(240);
    expect(at(Math.round(640 * 0.65), Math.round(480 * 0.7))).toBeGreaterThan(
      Math.round(120 * 0.65 * 0.85),
    );
  });

  for (const tool of TOOLS) {
    test(
      `${tool} handles a 12 MP photo without long tasks over 50 ms`,
      LONG_TASKS,
      async ({ page }, testInfo) => {
        test.slow();
        const file = testInfo.outputPath("photo-12mp.png");
        await writeFile(file, photo12mp());
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
        await openEditor(page, tool);
        await expectRendered(page, { width: 1500, height: 1000 });
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
        await choosePhoto(page, file);
        await expectRendered(page, { width: 4000, height: 3000 });
        // Edits with the photo in place: each renders the preview again in the worker.
        for (const name of EDITS[tool]) {
          await page.getByRole("radio", { name, exact: true }).click();
        }
        await page.waitForTimeout(2000);
        const longTasks = (await longTasksSince(start)).map(([at, ms]) => [
          Math.round(at - start),
          ms,
        ]);
        console.log(
          `${tool} 12 MP long tasks ([ms after start, duration]): ${JSON.stringify(longTasks)}`,
        );
        expect(Math.max(0, ...longTasks.map(([, ms]) => ms ?? 0))).toBeLessThanOrEqual(50);
      },
    );
  }
});

test.describe("accessibility and small screens", () => {
  for (const tool of TOOLS) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${tool} has no axe violations (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await openEditor(page, tool, "de");
        await choosePhoto(
          page,
          { name: "see.png", mimeType: "image/png", buffer: photoPng(320, 240) },
          "de",
        );
        await expect(page.getByTestId("asset-name")).toHaveText("see.png");
        const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
        expect(results.violations).toEqual([]);
      });
    }

    test(`${tool} has no horizontal overflow at 375 px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await openEditor(page, tool, "de");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }
});
