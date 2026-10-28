/**
 * M4c-AP02: Favicon generator. Landing pages in DE and EN, the editor with
 * its variants, "preview == PNG export" on a square canvas (the icon has
 * transparent sides on the wide canvas of preview-export.spec.ts), the icon
 * pack (ZIP: file list, copied head snippet, archive contents), axe in
 * light and dark mode and 375 px.
 */
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

import { enableClipboard } from "./support/clipboard";
import { comparePngs } from "./support/compare";

const ID = "favicon-generator";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const PACK_FILES = [
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png",
  "site.webmanifest",
  "head-snippet.html",
];

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");
const src = (page: Page) => motif(page).getAttribute("src");

async function openEditor(page: Page, locale: "de" | "en") {
  await page.goto(`/${locale}/tools/${toolSlug(ID, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(motif(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

async function openExport(page: Page, locale: "de" | "en" = "en"): Promise<Locator> {
  const name = locale === "de" ? "Exportieren" : "Export";
  const dialog = page.getByRole("dialog", { name });
  // Retried: a click before hydration finishes does nothing.
  await expect(async () => {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  return dialog;
}

async function choose(dialog: Locator, name: string) {
  const radio = dialog.getByRole("radio", { name, exact: true });
  await dialog.locator(`label[for="${(await radio.getAttribute("id")) ?? ""}"]`).click();
  await expect(radio).toBeChecked();
}

interface ZipItem {
  path: string;
  data: Buffer;
}

/** Reads a ZIP through its central directory (STORE and deflate). */
function readZip(zip: Buffer): ZipItem[] {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(0);
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  const items: ZipItem[] = [];
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const method = zip.readUInt16LE(at + 10);
    const compressed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const path = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + compressed);
    items.push({ path, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
    at += 46 + nameLength + extra + comment;
  }
  return items;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test.describe("favicon generator", () => {
  test("switches content and variants", async ({ page }) => {
    await openEditor(page, "en");
    const before = await src(page);
    await page.getByRole("radio", { name: "Shape", exact: true }).click();
    await expect.poll(() => src(page)).not.toBe(before);
    await expect(page.getByRole("textbox", { name: "Text", exact: true })).toHaveCount(0);

    const shape = await src(page);
    await page.getByRole("radio", { name: "Maskable", exact: true }).click();
    await expect.poll(() => src(page)).not.toBe(shape);
    // Maskable icons are full bleed: the tile starts at the canvas corner.
    expect(decodeURIComponent((await src(page)) ?? "")).toContain('d="M0 0H512V512H0Z"');

    // The dark variant asks for dark mode colours first.
    await page.getByRole("radio", { name: "Dark", exact: true }).click();
    await expect(page.getByText("The dark variant needs its own colors.")).toBeVisible();
  });

  for (const [label, setup] of [
    ["Code preset (square tile)", async (page: Page) => clickPreset(page, "Code")],
    [
      "Apple touch variant",
      async (page: Page) => page.getByRole("radio", { name: "Apple touch", exact: true }).click(),
    ],
  ] as const) {
    test(`preview equals PNG export: ${label}`, async ({ page }, testInfo) => {
      const SIZE = { width: 320, height: 320 };
      await openEditor(page, "en");
      await setup(page);
      const sized = (w: number | string, h: number | string) =>
        page.getByRole("img", { name: new RegExp(`${w} × ${h} px`) });
      await expect(async () => {
        const width = page.getByLabel("Width", { exact: true });
        await width.fill(String(SIZE.width));
        await width.press("Enter");
        await expect(sized(SIZE.width, "\\d+")).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      await expect(async () => {
        const height = page.getByLabel("Height", { exact: true });
        await height.fill(String(SIZE.height));
        await height.press("Enter");
        await expect(sized(SIZE.width, SIZE.height)).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      await page.locator("body").press("1");
      await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const shown = motif(page);
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

      const dialog = await openExport(page);
      await choose(dialog, "PNG");
      await choose(dialog, `1× (${SIZE.width} × ${SIZE.height})`);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        dialog.getByTestId("export-download").click(),
      ]);
      const exported = await readFile(await download.path());
      const result = await comparePngs(page, preview, exported, 24);
      await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
      await testInfo.attach("export.png", { body: exported, contentType: "image/png" });
      expect({ width: result.width, height: result.height }).toEqual(SIZE);
      expect(result.strayRatio).toBeLessThanOrEqual(0.0002);
      expect(result.diffRatio).toBeLessThanOrEqual(0.01);
      expect(result.meanDiffOffEdges).toBeLessThanOrEqual(2);
    });
  }

  test("exports the icon pack as a ZIP and copies the head tags", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "en");
    await page.locator("summary", { hasText: "App and manifest" }).click();
    await page.getByRole("textbox", { name: "App name", exact: true }).fill("Musterli Test");
    await page.getByRole("textbox", { name: "App name", exact: true }).press("Enter");

    const dialog = await openExport(page);
    await choose(dialog, "Icon pack (ZIP)");
    const files = dialog.getByTestId("export-bundle-files").locator("li");
    await expect(files).toHaveText(PACK_FILES);
    await expect(dialog.getByTestId("export-code")).toContainText(
      '<link rel="manifest" href="/site.webmanifest">',
    );

    await dialog.getByTestId("export-copy").click();
    await expect(dialog.getByRole("status")).toHaveText("Copied! Off to your project.");
    const html = await page.evaluate(() => navigator.clipboard.readText());
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<meta name="theme-color" content="#4f46e5">');

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByTestId("export-download").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^musterli-favicon-generator-\d+-icon-pack\.zip$/);
    const zip = readZip(await readFile(await download.path()));
    expect(zip.map((f) => f.path)).toEqual(PACK_FILES);
    const byPath = Object.fromEntries(zip.map((f) => [f.path, f.data]));

    // favicon.ico: three PNG entries 16, 32 and 48 px.
    const ico = byPath["favicon.ico"] as Buffer;
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 48]);
    const first = ico.readUInt32LE(6 + 12);
    expect(ico.subarray(first, first + 8)).toEqual(PNG_SIGNATURE);

    for (const [path, edge] of [
      ["apple-touch-icon.png", 180],
      ["icon-192.png", 192],
      ["icon-512.png", 512],
      ["icon-512-maskable.png", 512],
    ] as const) {
      const png = byPath[path] as Buffer;
      expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([edge, edge]);
    }
    expect((byPath["favicon.svg"] as Buffer).toString("utf8")).toMatch(/^<svg /);
    const manifest = JSON.parse((byPath["site.webmanifest"] as Buffer).toString("utf8")) as {
      name: string;
      icons: { purpose?: string }[];
    };
    expect(manifest.name).toBe("Musterli Test");
    expect(manifest.icons.at(-1)?.purpose).toBe("maskable");
    expect((byPath["head-snippet.html"] as Buffer).toString("utf8")).toBe(html);
  });

  test("has no horizontal overflow at 375 px, also with the export dialog", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openEditor(page, "de");
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBe(0);
    const dialog = await openExport(page, "de");
    await choose(dialog, "Icon-Paket (ZIP)");
    await expect(dialog.getByTestId("export-bundle-files").locator("li")).toHaveCount(8);
    expect(await overflow()).toBe(0);
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 375).toBe(true);
  });
});

async function clickPreset(page: Page, name: string) {
  const preset = page.getByRole("button", { name, exact: true });
  await preset.click();
  await expect(preset).toHaveAttribute("aria-pressed", "true");
}

test.describe("favicon generator pages", () => {
  for (const [locale, name] of [
    ["de", "Favicon-Generator"],
    ["en", "Favicon Generator"],
  ] as const) {
    test(`landing page ${locale}`, async ({ page }) => {
      const response = await page.goto(`/${locale}/${toolSlug(ID, locale)}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
      await expect(page.locator("#faq-heading")).toBeVisible();
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`editor, export dialog and landing page have no axe violations (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "de");
      await page.locator("body").press("Space");
      const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(editor.violations).toEqual([]);
      const dialog = await openExport(page, "de");
      await choose(dialog, "Icon-Paket (ZIP)");
      const exportDialog = await new AxeBuilder({ page })
        .include('[data-testid="export-dialog"]')
        .withTags(AXE_TAGS)
        .analyze();
      expect(exportDialog.violations).toEqual([]);
      await page.goto(`/en/${toolSlug(ID, "en")}`);
      const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(landing.violations).toEqual([]);
    });
  }
});
