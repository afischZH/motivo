/**
 * M5-AP01: shader gradient on the WebGL2 stage (docs/ARCHITECTURE.md 4.15).
 * Landing pages in DE and EN with motif and OG image, catalogue, category
 * page and sitemap, preview == PNG export (same shader and uniforms), a
 * 4K export scaled down equals the preview, JPG, WebP and GIF, the loop
 * preview (still with reduced motion), the notice without WebGL2, axe in
 * light and dark mode and no horizontal overflow at 375 px.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { readGifInfo } from "@musterli/exporters/gif-info";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { comparePngs } from "./support/compare";
import { decodePng } from "./support/png";

const TOOL = "shader-gradient";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
type Locale = "de" | "en";

async function openEditor(page: Page, locale: Locale = "en") {
  await page.goto(`/${locale}/tools/${toolSlug(TOOL, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

/** The preview canvas of a WebGL tool. */
const canvas = (page: Page): Locator =>
  page.getByTestId("preview").locator("canvas[data-shader-motif]");

/** Waits until the preview canvas shows a picture of `design` at `pixels`. */
async function expectRendered(
  page: Page,
  design: { width: number; height: number },
  pixels?: { width: number; height: number },
) {
  await expect(canvas(page)).toHaveAttribute("data-design", `${design.width}x${design.height}`, {
    timeout: 30_000,
  });
  if (pixels) {
    await expect(canvas(page)).toHaveAttribute(
      "data-rendered",
      `${pixels.width}x${pixels.height}`,
      {
        timeout: 30_000,
      },
    );
  }
}

/** The preview canvas as a PNG. */
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

/** Downloads one format from the export dialog. */
async function download(
  page: Page,
  format: string,
  scale?: string,
  timeout = 30_000,
): Promise<{ name: string; body: Buffer }> {
  const dialog = await openExport(page);
  await choose(dialog, format);
  if (scale) await choose(dialog, scale);
  const [file] = await Promise.all([
    page.waitForEvent("download", { timeout }),
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

// Compare device pixels 1:1; the still frame is what every export shows.
test.use({ deviceScaleFactor: 1, reducedMotion: "reduce" });

test.describe("shader gradient pages", () => {
  for (const [locale, title] of [
    ["de", "Shader-Farbverlauf"],
    ["en", "Shader Gradient"],
  ] as const) {
    test(`landing page ${locale} has content, a motif and an OG image`, async ({ page }) => {
      const response = await page.goto(`/${locale}/${toolSlug(TOOL, locale)}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator("#faq-heading")).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: locale === "de" ? "Generator öffnen" : "Open the generator",
        }),
      ).toHaveAttribute("href", `/${locale}/tools/${toolSlug(TOOL, locale)}`);
      const motif = await page.request.get(`/motifs/${TOOL}/default.svg`);
      expect(motif.status()).toBe(200);
      expect(await motif.text()).toMatch(/^<svg [^>]*><image [^>]*href="data:image\/png;base64,/);
      const og = await page.locator('meta[property="og:image"]').getAttribute("content");
      expect((await page.request.get(new URL(og ?? "").pathname)).status()).toBe(200);
    });
  }

  test("is in the catalogue, the gradients category and the sitemap", async ({ page }) => {
    await page.goto("/en/tools/category/gradients");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Shader Gradient" }).first(),
    ).toBeVisible();
    await page.goto("/de/tools");
    await expect(page.getByRole("link", { name: "Shader-Farbverlauf", exact: true })).toBeVisible();
    const xml = await (await page.request.get("/sitemap.xml")).text();
    for (const slug of ["/de/shader-farbverlauf-generator", "/en/shader-gradient-generator"]) {
      expect(xml).toContain(slug);
    }
  });
});

test.describe("shader gradient editor", () => {
  test("draws in the shader worker; the PNG export equals the preview", async ({
    page,
  }, testInfo) => {
    const SIZE = { width: 480, height: 320 };
    await openEditor(page);
    await expectRendered(page, { width: 1600, height: 1000 });
    await setSize(page, SIZE.width, SIZE.height);
    await zoom100(page);
    await expectRendered(page, SIZE, SIZE);
    await expect(canvas(page)).toHaveAttribute("data-time", "0");
    const preview = await previewPng(page);
    const exported = await download(page, "PNG", `1× (${SIZE.width} × ${SIZE.height})`);
    expect(exported.name).toMatch(/^musterli-shader-gradient-\d+\.png$/);
    await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
    await testInfo.attach("export.png", { body: exported.body, contentType: "image/png" });
    // One shader, the same uniforms: the same pixels, not just similar ones.
    const result = await comparePngs(page, preview, exported.body, 0);
    expect(result.diffRatio).toBe(0);
  });

  test("a 4K export in tiles, scaled down, equals the preview", async ({ page }, testInfo) => {
    test.slow();
    const SIZE = { width: 960, height: 540 };
    await openEditor(page);
    await setSize(page, SIZE.width, SIZE.height);
    await zoom100(page);
    await expectRendered(page, SIZE, SIZE);
    const preview = await previewPng(page);
    const exported = await download(page, "PNG", "4× (3840 × 2160)", 180_000);
    const big = decodePng(exported.body);
    expect([big.width, big.height]).toEqual([3840, 2160]);
    // Scaled down by averaging 4 × 4 blocks (exact box filter, no browser resampling).
    const small = await page.evaluate(
      async ({ b64, w, h }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const src = new OffscreenCanvas(bitmap.width, bitmap.height);
        const sctx = src.getContext("2d");
        if (!sctx) throw new Error("no 2d");
        sctx.drawImage(bitmap, 0, 0);
        const data = sctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const k = bitmap.width / w;
        const out = new ImageData(w, h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            for (let c = 0; c < 4; c++) {
              let sum = 0;
              for (let dy = 0; dy < k; dy++) {
                for (let dx = 0; dx < k; dx++) {
                  sum += data[((y * k + dy) * bitmap.width + x * k + dx) * 4 + c] ?? 0;
                }
              }
              out.data[(y * w + x) * 4 + c] = Math.round(sum / (k * k));
            }
          }
        }
        const dst = new OffscreenCanvas(w, h);
        dst.getContext("2d")?.putImageData(out, 0, 0);
        const blob = await dst.convertToBlob({ type: "image/png" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (const byte of buf) s += String.fromCharCode(byte);
        return btoa(s);
      },
      { b64: exported.body.toString("base64"), ...{ w: SIZE.width, h: SIZE.height } },
    );
    const scaled = Buffer.from(small, "base64");
    await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
    await testInfo.attach("4k-scaled.png", { body: scaled, contentType: "image/png" });
    const result = await comparePngs(page, preview, scaled, 24);
    // Grain and dither cells are in design pixels; the shading is sampled
    // 16 times per preview pixel, so only fine detail differs slightly.
    expect(result.strayRatio).toBeLessThanOrEqual(0.002);
    expect(result.meanDiff).toBeLessThanOrEqual(3);
  });

  test("exports JPG and WebP at 2× and the loop as a GIF", async ({ page }) => {
    const SIZE = { width: 400, height: 250 };
    await openEditor(page);
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

    const dialog = await openExport(page);
    await choose(dialog, "GIF");
    const panel = dialog.getByTestId("export-gif");
    await expect(panel.getByRole("radio", { name: "Motion" })).toBeChecked();
    await panel.getByRole("slider", { name: "Frames" }).fill("4");
    await choose(panel, "320 × 200");
    const [gif] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    const bytes = new Uint8Array(await readFile(await gif.path()));
    expect(readGifInfo(bytes)).toMatchObject({
      width: 320,
      height: 200,
      frames: 4,
      complete: true,
    });
  });

  test("the preview plays the loop only when motion is allowed", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openEditor(page);
    await expectRendered(page, { width: 1600, height: 1000 });
    const times = new Set<string>();
    await expect
      .poll(
        async () => {
          times.add((await canvas(page).getAttribute("data-time")) ?? "");
          return times.size;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(2);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(canvas(page)).toHaveAttribute("data-time", "0", { timeout: 10_000 });
  });

  test("shows a notice instead of an empty area without WebGL2", async ({ page }) => {
    await page.addInitScript(() => {
      // No OffscreenCanvas, so no shader worker (the same path as a browser without WebGL2).
      Reflect.deleteProperty(globalThis, "OffscreenCanvas");
    });
    await openEditor(page, "de");
    await expect(page.getByTestId("preview").locator("[data-shader-unavailable]")).toContainText(
      "WebGL2",
      { timeout: 15_000 },
    );
    // The notice sits inside the role="img" box, whose children assistive tech skips:
    // it must be announced as the image's description.
    await expect(page.getByTestId("preview")).toHaveAccessibleDescription(/WebGL2/);
  });
});

test.describe("shader gradient: accessibility and small screens", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`editor and landing page have no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "de");
      await expectRendered(page, { width: 1600, height: 1000 });
      await page.locator("body").press("Space");
      const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(editor.violations).toEqual([]);
      await page.goto(`/en/${toolSlug(TOOL, "en")}`);
      const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(landing.violations).toEqual([]);
    });
  }

  test("has no horizontal overflow at 375 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const path of [`/de/tools/${toolSlug(TOOL, "de")}`, `/en/${toolSlug(TOOL, "en")}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBe(0);
    }
  });
});
