/**
 * M4c-AP04: photo effects on the shared raster-effect stage
 * (docs/ARCHITECTURE.md 4.14). Duotone renders in a worker into a canvas,
 * ASCII art derives its cell grid from the photo in the image-input worker
 * and renders SVG. Landing pages, preview == PNG export, every export
 * format, photo upload (size follows the photo, SVG refused, nothing in the
 * share link), no long tasks with a 12 MP photo, axe in light and dark mode
 * and no horizontal overflow at 375 px.
 */
import { readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";
import { comparePngs } from "./support/compare";
import { decodePng, encodeRgbPng } from "./support/png";
import { LONG_TASKS } from "./support/long-tasks";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const SIZE = { width: 480, height: 320 };
type Locale = "de" | "en";

/** Diagonal gradient with a dark disc left of the centre (easy to find after an effect). */
function photoRgb(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 3);
  const r = Math.min(width, height) * 0.25;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const disc = Math.hypot(x - width * 0.35, y - height * 0.5) < r;
      data.set(
        disc ? [30, 30, 30] : [Math.round((255 * x) / width), Math.round((255 * y) / height), 160],
        (y * width + x) * 3,
      );
    }
  }
  return data;
}

const photoPng = (width: number, height: number) =>
  encodeRgbPng(photoRgb(width, height), width, height);

/**
 * A 4000 × 3000 (12 MP) PNG: a phone photo's pixel count. Smooth bands with
 * the Sub filter keep the file small; decoding still costs 12 MP.
 */
function photo12mp(): Buffer {
  const W = 4000;
  const H = 3000;
  const stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 1; // Sub: each byte is stored as the difference to its left neighbour.
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

/** The preview canvas of an image effect. */
const canvas = (page: Page): Locator =>
  page.getByTestId("preview").locator("canvas[data-raster-motif]");

/** Waits until the preview canvas shows a picture of `design` at `pixels`. */
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

/** RGBA of the preview canvas at a fraction of its size. */
function canvasPixel(page: Page, fx: number, fy: number): Promise<number[]> {
  return canvas(page).evaluate(
    (el, [x, y]) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext("2d");
      if (!ctx) return [];
      return [
        ...ctx.getImageData(Math.floor(c.width * (x ?? 0)), Math.floor(c.height * (y ?? 0)), 1, 1)
          .data,
      ];
    },
    [fx, fy],
  );
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

/** Downloads one format from the export dialog (opened if needed). */
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

// Compare device pixels 1:1.
test.use({ deviceScaleFactor: 1 });

test.describe("photo effect landing pages", () => {
  const PAGES: { tool: string; locale: Locale; title: string }[] = [
    { tool: "duotone", locale: "de", title: "Duotone und Verlaufsumsetzung (Gradient Map)" },
    { tool: "duotone", locale: "en", title: "Duotone and Gradient Map" },
    { tool: "ascii-art", locale: "de", title: "ASCII-Art" },
    { tool: "ascii-art", locale: "en", title: "ASCII Art" },
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

  test("both tools are in the catalogue, the category page and the sitemap", async ({ page }) => {
    await page.goto("/en/tools/category/image-effects");
    const main = page.getByRole("main");
    await expect(
      main.getByRole("link", { name: "Duotone and Gradient Map" }).first(),
    ).toBeVisible();
    await expect(main.getByRole("link", { name: "ASCII Art" }).first()).toBeVisible();
    await page.goto("/de/tools");
    await expect(page.getByRole("link", { name: "ASCII-Art", exact: true })).toBeVisible();
    const xml = await (await page.request.get("/sitemap.xml")).text();
    for (const slug of ["/de/duotone-generator", "/en/ascii-art-generator"]) {
      expect(xml).toContain(slug);
    }
  });
});

test.describe("duotone", () => {
  test("renders the sample in a worker; the PNG export equals the preview", async ({
    page,
  }, testInfo) => {
    await openEditor(page, "duotone");
    await expectRendered(page, { width: 1500, height: 1000 });
    await setSize(page, SIZE.width, SIZE.height);
    await zoom100(page);
    await expectRendered(page, SIZE, SIZE);
    const preview = Buffer.from(
      (await canvas(page).evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"))).split(
        ",",
      )[1] ?? "",
      "base64",
    );
    const exported = await download(page, "PNG", `1× (${SIZE.width} × ${SIZE.height})`);
    expect(exported.name).toMatch(/^musterli-duotone-\d+\.png$/);
    const result = await comparePngs(page, preview, exported.body, 0);
    await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
    await testInfo.attach("export.png", { body: exported.body, contentType: "image/png" });
    // One render path: the same pixels, not just similar ones.
    expect(result.diffRatio).toBe(0);
  });

  test("exports JPG and WebP at 2× the design size", async ({ page }) => {
    await openEditor(page, "duotone");
    await setSize(page, SIZE.width, SIZE.height);
    for (const [format, ext] of [
      ["JPG", "jpg"],
      ["WebP", "webp"],
    ] as const) {
      const file = await download(page, format, `2× (${SIZE.width * 2} × ${SIZE.height * 2})`);
      expect(file.name.endsWith(`.${ext}`)).toBe(true);
      const size = await page.evaluate(async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes]));
        return [bitmap.width, bitmap.height];
      }, file.body.toString("base64"));
      expect(size).toEqual([SIZE.width * 2, SIZE.height * 2]);
    }
  });

  test("takes a photo: size follows it, SVG is refused, the link stays without it", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "duotone");
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>';
    await page
      .locator('[data-control="photo"]')
      .getByLabel("Choose file")
      .setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
    await expect(page.getByTestId("asset-error")).toContainText("SVG");

    await choosePhoto(page, {
      name: "lake.png",
      mimeType: "image/png",
      buffer: photoPng(640, 480),
    });
    await expect(page.getByTestId("asset-name")).toHaveText("lake.png");
    await expect(page.getByRole("img", { name: /640 × 480 px/ })).toBeVisible();
    await expectRendered(page, { width: 640, height: 480 });
    // The disc is dark: the shadow colour; the bright corner: the highlight colour.
    const disc = await canvasPixel(page, 0.35, 0.5);
    const corner = await canvasPixel(page, 0.97, 0.97);
    expect((disc[0] ?? 0) + (disc[1] ?? 0) + (disc[2] ?? 0)).toBeLessThan(
      (corner[0] ?? 0) + (corner[1] ?? 0) + (corner[2] ?? 0) - 200,
    );

    await page.getByRole("button", { name: "Share" }).click();
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/#d=/);
    expect(url.length).toBeLessThan(2000);
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(other.getByTestId("asset-name")).not.toHaveText("lake.png");
    await expect(other.getByRole("img", { name: /640 × 480 px/ })).toBeVisible();
    await expect(other.getByTestId("preview").locator("canvas[data-raster-motif]")).toHaveAttribute(
      "data-design",
      "640x480",
      { timeout: 20_000 },
    );
  });

  test(
    "handles a 12 MP photo without long tasks over 50 ms",
    LONG_TASKS,
    async ({ page }, testInfo) => {
      test.slow();
      const buffer = photo12mp();
      expect(buffer.length).toBeLessThan(5 * 1024 * 1024);
      const file = testInfo.outputPath("photo-12mp.png");
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
      await openEditor(page, "duotone");
      await expectRendered(page, { width: 1500, height: 1000 });
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
      await choosePhoto(page, file);
      // The photo keeps its full resolution (up to 4096 px).
      await expectRendered(page, { width: 4000, height: 3000 });
      // A few edits with the photo in place: each renders the preview again.
      await page.getByRole("radio", { name: "Tritone", exact: true }).click();
      await page.getByRole("radio", { name: "Gradient", exact: true }).click();
      await page.waitForTimeout(1500);
      const longTasks = (await longTasksSince(start)).map(([at, ms]) => [
        Math.round(at - start),
        ms,
      ]);
      console.log(
        `12 MP photo long tasks ([ms after start, duration]): ${JSON.stringify(longTasks)}`,
      );
      expect(Math.max(0, ...longTasks.map(([, ms]) => ms ?? 0))).toBeLessThanOrEqual(50);
    },
  );
});

test.describe("ascii art", () => {
  test("the PNG export equals the preview", async ({ page }, testInfo) => {
    await openEditor(page, "ascii-art");
    await setSize(page, SIZE.width, SIZE.height);
    await zoom100(page);
    const shown = page.getByTestId("preview").locator("img");
    await expect(shown).toHaveCSS("width", `${SIZE.width}px`);
    await expect
      .poll(() => shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
    const box = await shown.boundingBox();
    if (!box) throw new Error("preview has no bounding box");
    const preview = await page.screenshot({
      animations: "disabled",
      scale: "css",
      clip: { x: Math.round(box.x), y: Math.round(box.y), ...SIZE },
    });
    const exported = await download(page, "PNG", `1× (${SIZE.width} × ${SIZE.height})`);
    const result = await comparePngs(page, preview, exported.body, 24);
    await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
    await testInfo.attach("export.png", { body: exported.body, contentType: "image/png" });
    expect(result.strayRatio).toBeLessThanOrEqual(0.0002);
    expect(result.meanDiffOffEdges).toBeLessThanOrEqual(2);
  });

  test("exports SVG, text and HTML from a photo", async ({ page }) => {
    await openEditor(page, "ascii-art");
    await choosePhoto(page, {
      name: "lake.png",
      mimeType: "image/png",
      buffer: photoPng(400, 300),
    });
    const columns = page.getByRole("textbox", { name: "Columns" });
    await columns.fill("40");
    await columns.press("Enter");

    const svg = (await download(page, "SVG")).body.toString("utf8");
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain("monospace");
    expect(svg).not.toMatch(/<script|data:image/);

    const text = await download(page, "Plain text (.txt)");
    expect(text.name).toMatch(/\.txt$/);
    const lines = text.body.toString("utf8").trimEnd().split("\n");
    expect(lines[0]).toHaveLength(40);
    // The dark disc left of the centre shows as dense characters in the middle row.
    const middle = lines[Math.floor(lines.length / 2)] ?? "";
    expect(middle.slice(12, 16)).toMatch(/^[@#%]+$/);

    const html = (await download(page, "HTML (pre)")).body.toString("utf8");
    expect(html).toContain("<pre");
    expect(html).not.toMatch(/<script/);

    const png = decodePng((await download(page, "PNG")).body);
    expect(png.width / png.height).toBeCloseTo(400 / 300, 2);
  });

  test("shows dots and braille", async ({ page }) => {
    await openEditor(page, "ascii-art");
    for (const style of ["Dots", "Braille"]) {
      await page.getByRole("radio", { name: style, exact: true }).click();
      await expect
        .poll(async () => {
          const src = (await page.getByTestId("preview").locator("img").getAttribute("src")) ?? "";
          return decodeURIComponent(src).length;
        })
        .toBeGreaterThan(1000);
    }
  });
});

test.describe("photo effects: accessibility and small screens", () => {
  for (const tool of ["duotone", "ascii-art"]) {
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
