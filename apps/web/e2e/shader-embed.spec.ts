/**
 * S1: live web embeds of WebGL tools (docs/ARCHITECTURE.md 4.22). The HTML
 * embed from the export dialog, pasted into a plain page, shows the same
 * still frame as the PNG export; the Web Component loops while motion is
 * allowed and stands still otherwise; without WebGL2 the box keeps its
 * fallback colour.
 */
import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { comparePngs } from "./support/compare";

const TOOL = "shader-gradient";
const SIZE = { width: 480, height: 320 };

async function openEditor(page: Page) {
  await page.goto(`/en/tools/${toolSlug(TOOL, "en")}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
  await expect(page.getByTestId("preview").locator("canvas[data-shader-motif]")).toHaveAttribute(
    "data-design",
    "1600x1000",
    { timeout: 30_000 },
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

async function download(page: Page, format: string, scale?: string): Promise<Buffer> {
  const dialog = await openExport(page);
  await choose(dialog, format);
  if (scale) await choose(dialog, scale);
  const [file] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    dialog.getByTestId("export-download").click(),
  ]);
  const body = await readFile(await file.path());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  return body;
}

async function setSize(page: Page, width: number, height: number) {
  const label = (w: number | string, h: number | string) =>
    page.getByRole("img", { name: new RegExp(`${w} × ${h} px`) });
  for (const [name, value, check] of [
    ["Width", width, () => label(width, "\\d+")],
    ["Height", height, () => label(width, height)],
  ] as const) {
    await expect(async () => {
      const field = page.getByLabel(name, { exact: true });
      await field.fill(String(value));
      await field.press("Enter");
      await expect(check()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  }
}

/** A blank page at the app's origin (no app CSP in the way of inline scripts). */
async function blankPage(page: Page, body: string) {
  await page.goto("about:blank");
  await page.setContent(`<!doctype html><html><body style="margin:0">${body}</body></html>`);
}

test.use({ deviceScaleFactor: 1 });

test.describe("live shader embeds", () => {
  test.use({ reducedMotion: "reduce" });

  test("the HTML embed shows the same still frame as the PNG export", async ({
    page,
  }, testInfo) => {
    await openEditor(page);
    await setSize(page, SIZE.width, SIZE.height);
    const png = await download(page, "PNG", `1× (${SIZE.width} × ${SIZE.height})`);
    const dialog = await openExport(page);
    await choose(dialog, "HTML embed (live)");
    await expect(dialog.getByTestId("export-code-hint")).toContainText("website builder");
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByTestId("export-download").click(),
    ]);
    const html = (await readFile(await file.path(), "utf8")).replace(
      /min-height: \d+px;/,
      `width: ${SIZE.width}px; height: ${SIZE.height}px;`,
    );
    expect(html).toContain("musterliShader");

    await blankPage(page, html);
    const box = page.locator(".musterli-shader");
    await expect(box.locator("canvas")).toHaveCount(1);
    await page.waitForTimeout(300);
    const shot = await box.screenshot();
    await testInfo.attach("export.png", { body: png, contentType: "image/png" });
    await testInfo.attach("embed.png", { body: shot, contentType: "image/png" });
    // Same shader and uniforms; the moving uniforms are stored to 4 decimals.
    const result = await comparePngs(page, png, shot, 2);
    expect(result.strayRatio).toBeLessThan(0.002);
    expect(result.meanDiff).toBeLessThan(0.5);
  });

  test("the Web Component stands still with reduced motion and falls back without WebGL2", async ({
    page,
  }) => {
    await openEditor(page);
    const dialog = await openExport(page);
    await choose(dialog, "Web Component (live)");
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByTestId("export-download").click(),
    ]);
    const js = await readFile(await file.path(), "utf8");
    const markup = `<musterli-shader style="height: 240px; width: 360px"><h1>Hello</h1></musterli-shader><script>${js}</script>`;

    await blankPage(page, markup);
    const el = page.locator("musterli-shader");
    await expect(el.locator("canvas")).toHaveCount(1);
    await expect(el.getByRole("heading", { name: "Hello" })).toBeVisible();
    await page.waitForTimeout(300);
    const a = await el.screenshot();
    await page.waitForTimeout(600);
    const b = await el.screenshot();
    expect(Buffer.compare(a, b)).toBe(0);

    // Removing the element frees its WebGL context.
    await el.evaluate((node) => node.remove());
    await expect(page.locator("canvas")).toHaveCount(0);

    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof original>
      ) {
        if (args[0] === "webgl2") return null;
        return original.apply(this, args);
      } as typeof original;
    });
    await page.goto("about:blank");
    await page.setContent(`<!doctype html><html><body style="margin:0">${markup}</body></html>`);
    await expect(page.locator("musterli-shader canvas")).toHaveCount(0);
    const bg = await page
      .locator("musterli-shader")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(bg).toMatch(/^rgb\(/);
  });
});

test.describe("live shader embeds with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the Web Component loops while motion is allowed", async ({ page }) => {
    await openEditor(page);
    const dialog = await openExport(page);
    await choose(dialog, "Web Component (live)");
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByTestId("export-download").click(),
    ]);
    const js = await readFile(await file.path(), "utf8");
    await blankPage(
      page,
      `<musterli-shader style="height: 200px; width: 300px"></musterli-shader><script>${js}</script>`,
    );
    const el = page.locator("musterli-shader");
    await expect(el.locator("canvas")).toHaveCount(1);
    await page.waitForTimeout(300);
    const a = await el.screenshot();
    await page.waitForTimeout(1500);
    const b = await el.screenshot();
    expect(Buffer.compare(a, b)).not.toBe(0);
  });
});
