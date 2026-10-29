/**
 * M6-AP03: text effects (highlight bar, gradient fill), self-hosted OFL
 * fonts and brand fonts in the social media editor.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { decodePng, type Rgba } from "./support/png";

const EDITOR = "/en/social-media-editor/edit";
const BRAND_KIT = "/en/brand-kit";
const FIXTURE_FONT = fileURLToPath(new URL("./fixtures/brand-test.ttf", import.meta.url));

const stage = (page: Page) => page.getByTestId("stage");

async function openEditor(page: Page, hash = "") {
  await page.goto(`${EDITOR}${hash}`);
  await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
  await expect(stage(page)).toHaveAttribute("data-background", "ready");
}

/** Adds a text layer (selected afterwards) with the given text. */
async function addText(page: Page, text: string) {
  await page.getByTestId("add-text").click();
  await page.getByTestId("text-content").fill(text);
}

async function exportPng(page: Page): Promise<Buffer> {
  const download = page.waitForEvent("download");
  await page.getByTestId("export").click();
  const file = await download;
  return readFile((await file.path()) ?? "");
}

/** Pixels matching a predicate. */
function count(image: Rgba, match: (r: number, g: number, b: number) => boolean): number {
  let n = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    if (match(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0)) n++;
  }
  return n;
}

/** Share of pixels that differ by more than `tolerance` in any channel. */
function diffShare(a: Rgba, b: Rgba, tolerance = 8): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      if (Math.abs((a.data[i + c] ?? 0) - (b.data[i + c] ?? 0)) > tolerance) {
        n++;
        break;
      }
    }
  }
  return n / (a.width * a.height);
}

async function fontLoaded(page: Page, family: string): Promise<boolean> {
  return page.evaluate(
    (f) => [...document.fonts].some((face) => face.family === f && face.status === "loaded"),
    family,
  );
}

test.describe("social editor text and fonts", () => {
  test("draws the highlight bar and the gradient fill in preview and export", async ({ page }) => {
    await openEditor(page);
    await addText(page, "MARKER");
    await page.getByTestId("text-size").fill("200");
    const green = (r: number, g: number, b: number) => r < 20 && g > 235 && b < 20;
    const plain = decodePng(await exportPng(page));
    const before = count(plain, green);

    // Highlight bar in pure green behind the text.
    await page.getByTestId("text-highlight").check();
    await page.getByTestId("text-highlight-color").locator('input[type="color"]').fill("#00ff00");
    await page.getByTestId("text-highlight-padding").fill("30");
    await page.getByTestId("text-highlight-padding").blur();
    const marked = decodePng(await exportPng(page));
    expect(count(marked, green) - before).toBeGreaterThan(20_000);
    // The preview draws it too.
    const preview = await stage(page)
      .locator("canvas")
      .first()
      .evaluate((c) => {
        const canvas = c as HTMLCanvasElement;
        const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 0; data && i < data.length; i += 4) {
          if ((data[i] ?? 0) < 20 && (data[i + 1] ?? 0) > 235 && (data[i + 2] ?? 0) < 20) n++;
        }
        return n;
      });
    expect(preview).toBeGreaterThan(1_000);

    // Gradient from magenta to cyan replaces the text colour.
    const magenta = (r: number, g: number, b: number) => r > 200 && g < 70 && b > 200;
    const cyan = (r: number, g: number, b: number) => r < 70 && g > 200 && b > 200;
    await page.getByTestId("text-gradient").check();
    await page.getByTestId("text-gradient-from").locator('input[type="color"]').fill("#ff00ff");
    await page.getByTestId("text-gradient-to").locator('input[type="color"]').fill("#00ffff");
    await page.getByTestId("text-gradient-angle").fill("90");
    await page.getByTestId("text-gradient-angle").blur();
    const gradient = decodePng(await exportPng(page));
    expect(count(gradient, magenta) - count(marked, magenta)).toBeGreaterThan(500);
    expect(count(gradient, cyan) - count(marked, cyan)).toBeGreaterThan(500);
    // Still on the green bar.
    expect(count(gradient, green)).toBeGreaterThan(before + 10_000);

    // Undo takes the gradient away again.
    await stage(page).focus();
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("text-gradient")).not.toBeChecked();
  });

  test("picks a library font, loads it from this site and exports with it after a reload", async ({
    page,
  }) => {
    const fontRequests: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "font" || /\.woff2?$/.test(request.url())) {
        fontRequests.push(request.url());
      }
    });
    await openEditor(page);
    // The default font of new text is ready before the first text is added.
    expect(await fontLoaded(page, "musterli-inter")).toBe(true);
    await addText(page, "Bebas Neue");
    await page.getByTestId("text-size").fill("160");
    const inter = decodePng(await exportPng(page));

    await page.getByTestId("text-font").selectOption("library:bebas-neue");
    await expect(page.getByTestId("text-font")).toHaveValue("library:bebas-neue");
    await expect.poll(() => fontLoaded(page, "musterli-bebas-neue")).toBe(true);
    // Bebas Neue has one weight: the weight picker follows.
    await expect(page.getByTestId("text-weight")).toHaveValue("400");
    const bebasPng = await exportPng(page);
    const bebas = decodePng(bebasPng);
    expect(diffShare(inter, bebas)).toBeGreaterThan(0.002);

    // Only same-origin font files, only the latin subset for latin text.
    expect(fontRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
    expect(
      fontRequests.some((u) => u.endsWith("/fonts/bebas-neue/bebas-neue-400-latin.woff2")),
    ).toBe(true);
    expect(fontRequests.some((u) => u.includes("latin-ext"))).toBe(false);

    // Saved, opened in a fresh page and exported at once: the very first export uses the font.
    await page.getByTestId("design-name").fill("Font post");
    await page.getByTestId("save").click();
    await expect(page.getByTestId("announcer")).toHaveText("“Font post” saved.");
    const hash = new URL(page.url()).hash;
    const second = await page.context().newPage();
    await second.goto(`${EDITOR}${hash}`);
    await expect(second.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
    const again = decodePng(await exportPng(second));
    expect(diffShare(bebas, again)).toBeLessThan(0.001);
    await second.close();
  });

  test("adds a brand font, uses it first in the picker, exports with it, falls back without it", async ({
    page,
    browser,
  }) => {
    // Brand kit: add the test font (TrueType), it shows a sample in the font.
    await page.goto(BRAND_KIT);
    await page.getByTestId("font-file").setInputFiles(FIXTURE_FONT);
    await expect(page.getByTestId("brand-message")).toContainText("Font “brand test” added.");
    const card = page.getByTestId("font-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("font-sample")).toHaveAttribute("data-ready", "true");
    await expect(card).toContainText("TTF");

    // A file that only claims to be a font is refused.
    await page.getByTestId("font-file").setInputFiles({
      name: "fake.woff2",
      mimeType: "font/woff2",
      buffer: Buffer.from("wOF2 this is not really a font file at all"),
    });
    await expect(page.getByTestId("brand-message")).toContainText("cannot load this font");
    await expect(page.getByTestId("font-card")).toHaveCount(1);

    // Editor: brand fonts come first in the picker.
    await openEditor(page);
    await addText(page, "Brand words");
    await page.getByTestId("text-size").fill("150");
    const groups = await page
      .getByTestId("text-font")
      .locator("optgroup")
      .evaluateAll((els) => els.map((e) => e.getAttribute("label")));
    expect(groups[0]).toBe("Brand fonts");
    const inter = decodePng(await exportPng(page));
    const brandValue = await page
      .getByTestId("text-font")
      .locator("optgroup")
      .first()
      .locator("option")
      .first()
      .getAttribute("value");
    expect(brandValue).toMatch(/^brand:/);
    await page.getByTestId("text-font").selectOption(brandValue ?? "");
    await expect(page.getByTestId("text-font")).toHaveValue(brandValue ?? "");
    const brand = decodePng(await exportPng(page));
    expect(diffShare(inter, brand)).toBeGreaterThan(0.002);
    await expect(page.getByTestId("font-missing")).toHaveCount(0);

    await page.getByTestId("design-name").fill("Brand post");
    await page.getByTestId("save").click();
    await expect(page.getByTestId("announcer")).toHaveText("“Brand post” saved.");
    const hash = new URL(page.url()).hash;

    // Brand kit file: the font travels along (base64) and imports in a fresh browser.
    await page.goto(BRAND_KIT);
    const download = page.waitForEvent("download");
    await page.getByTestId("brand-export").click();
    const path = (await (await download).path()) ?? "";
    const file = JSON.parse(await readFile(path, "utf8")) as {
      version: number;
      fonts: { format: string; name: string; data: string }[];
    };
    expect(file.version).toBe(1);
    expect(file.fonts).toHaveLength(1);
    expect(file.fonts[0]).toMatchObject({ format: "ttf", name: "brand test" });
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(BRAND_KIT);
    await other.getByTestId("brand-file").setInputFiles(path);
    await expect(other.getByTestId("brand-message")).toContainText("1 font imported.");
    await expect(other.getByTestId("font-card")).toHaveCount(1);
    await fresh.close();

    // Without the font (deleted from the brand kit) the design opens with a fallback and a hint.
    await page.getByTestId("font-delete").click();
    await expect(page.getByTestId("font-card")).toHaveCount(0);
    await openEditor(page, hash);
    await page
      .getByTestId("layer-row")
      .filter({ hasText: "Brand words" })
      .getByTestId("layer-select")
      .click();
    await expect(page.getByTestId("font-missing")).toContainText("brand test");
    await expect(page.getByTestId("text-font")).toHaveValue(brandValue ?? "");
    const fallback = decodePng(await exportPng(page));
    expect(diffShare(brand, fallback)).toBeGreaterThan(0.002);
  });

  test("Magic Resize fits text with the real font metrics", async ({ page }) => {
    await openEditor(page);
    await addText(page, "Wide words in a wide font");
    await page.getByTestId("text-font").selectOption("library:montserrat");
    await expect.poll(() => fontLoaded(page, "musterli-montserrat")).toBe(true);
    await page.getByTestId("text-weight").selectOption("700");
    await page.getByTestId("text-size").fill("120");
    await page.getByTestId("text-size").blur();
    for (const format of ["story", "linkedin-banner", "youtube-thumbnail", "portrait"]) {
      const option = page.getByTestId("format").locator(`option[value="${format}"]`);
      if ((await option.count()) === 0) continue;
      await page.getByTestId("format").selectOption(format);
      await expect(stage(page)).toHaveAttribute("data-fit-problems", "0");
    }
    // The measure and the drawing use the loaded font: Konva lays out the same lines.
    const lines = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check("700 120px musterli-montserrat", "Wide");
    });
    expect(lines).toBe(true);
  });
});
