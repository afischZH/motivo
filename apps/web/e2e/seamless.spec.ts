/**
 * M3-AP12: Seamless Patterns in the editor. Shape picker, tiling switch,
 * SVG and PNG upload with the crop dialog (keyboard), uploads left out of
 * share links, the PNG tile export, and axe in light and dark mode with an
 * open crop dialog. Preview == PNG export lives in preview-export.spec.ts.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const TOOL = "seamless-patterns";

const motif = (page: Page): Locator => page.getByTestId("preview").locator("img");

async function motifSrc(page: Page): Promise<string> {
  await expect(motif(page)).toBeVisible();
  return (await motif(page).getAttribute("src")) ?? "";
}

async function openEditor(page: Page, locale: "de" | "en" = "de") {
  await page.goto(`/${locale}/tools/${toolSlug(TOOL, locale)}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(motif(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
}

/** A hostile SVG: everything but the rect must be stripped by the sanitizer. */
const HOSTILE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 40 20" onload="window.__pwned=1">',
  "<script>window.__pwned=2</script>",
  '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
  '<use xlink:href="https://example.com/evil.svg#a"/>',
  '<rect width="40" height="20" fill="#2a9d8f"/>',
  "</svg>",
].join("");

/** 8 × 4 PNG, solid colour (zlib stream with stored blocks, valid CRCs). */
function solidPng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  // zlib: header, one stored block, adler32.
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const stored = Buffer.alloc(5);
  stored[0] = 1;
  stored.writeUInt16LE(raw.length, 1);
  stored.writeUInt16LE(~raw.length & 0xffff, 3);
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0);
  const idat = Buffer.concat([Buffer.from([0x78, 0x01]), stored, raw, adler]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const cropDialog = (page: Page) => page.getByRole("dialog", { name: "Zuschneiden" });

test.describe("seamless patterns", () => {
  test("picks a shape and switches the tiling", async ({ page }) => {
    await openEditor(page);
    const first = await motifSrc(page);
    const shapes = page.getByRole("radiogroup", { name: "Form" });
    await shapes.getByRole("radio", { name: "Herz" }).click();
    await expect(shapes.getByRole("radio", { name: "Herz" })).toBeChecked();
    await expect.poll(() => motifSrc(page)).not.toBe(first);

    const heart = await motifSrc(page);
    await page.getByRole("radio", { name: "Gespiegelt", exact: true }).click();
    await expect.poll(() => motifSrc(page)).not.toBe(heart);
    expect(decodeURIComponent(await motifSrc(page))).toContain("<pattern");
  });

  test("uploads a hostile SVG, crops it by keyboard and never runs its code", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Datei wählen").setInputFiles({
      name: "evil.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(HOSTILE_SVG),
    });
    const dialog = cropDialog(page);
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("asset-status")).toContainText("Anzahl:");

    // Square crop, then move the frame with the keyboard.
    await dialog.getByText("Quadratisch", { exact: true }).click();
    const frame = dialog.getByTestId("crop-frame");
    await expect(frame).toHaveAccessibleName(/links 25 %/);
    await frame.focus();
    await frame.press("Shift+ArrowRight");
    await expect(frame).toHaveAccessibleName(/links 35 %/);
    await frame.press("Alt+ArrowLeft");
    await expect(frame).toHaveAccessibleName(/Breite 49 %/);
    await dialog.getByRole("button", { name: "Übernehmen" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByTestId("asset-thumbnail")).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Form" })).toHaveCount(0);
    const src = decodeURIComponent(await motifSrc(page));
    expect(src).not.toMatch(/script|onload|foreignObject|example\.com/i);
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
    // No inline SVG from the user anywhere in the document.
    await expect(page.locator("svg script, svg foreignObject")).toHaveCount(0);

    // Keep the original colours, then remove the upload again.
    const mono = await motifSrc(page);
    await page.getByRole("switch", { name: "Originalfarben behalten" }).click();
    await expect.poll(() => motifSrc(page)).not.toBe(mono);
    await page.getByRole("button", { name: "Entfernen" }).click();
    await expect(page.getByRole("radiogroup", { name: "Form" })).toBeVisible();
  });

  test("uploads a PNG with the crop dialog and leaves it out of share links", async ({
    page,
    context,
    browserName,
  }) => {
    await enableClipboard(context, browserName);
    await openEditor(page);
    const before = await motifSrc(page);
    await page.getByLabel("Datei wählen").setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: solidPng(8, 4),
    });
    const dialog = cropDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Übernehmen" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("asset-thumbnail")).toHaveAttribute(
      "src",
      /^data:image\/(png|jpeg);base64,/,
    );
    await expect.poll(() => motifSrc(page)).not.toBe(before);

    await page.getByRole("button", { name: "Teilen" }).click();
    await expect(page.getByTestId("shell-notice")).toContainText("nicht im Link");
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/#d=/);

    // The link opens with the built-in shape.
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.getByRole("radiogroup", { name: "Form" })).toBeVisible();
    await expect(other.getByTestId("asset-thumbnail")).toHaveCount(0);
  });

  test("exports one repeat tile as PNG", async ({ page }) => {
    await openEditor(page, "en");
    const dialog = page.getByRole("dialog", { name: "Export" });
    // Retried: a click before hydration finishes does nothing.
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    const radio = dialog.getByRole("radio", { name: "PNG tile", exact: true });
    await dialog.locator(`label[for="${(await radio.getAttribute("id")) ?? ""}"]`).click();
    await expect(radio).toBeChecked();
    // The tile is far smaller than the canvas: it only scales.
    await expect(dialog.getByTestId("export-output-size")).toHaveText(
      /^Result: \d{2,3} × \d{2,3} px\.$/,
    );
    await expect(dialog.getByText("Custom size", { exact: true })).toHaveCount(0);
    const download = page.waitForEvent("download");
    await dialog.getByTestId("export-download").click();
    expect((await download).suggestedFilename()).toMatch(/-tile\.png$/);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`editor and crop dialog have no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page);
      await page.locator("body").press("Space");
      let results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);

      await page.getByLabel("Datei wählen").setInputFiles({
        name: "logo.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(HOSTILE_SVG),
      });
      await expect(cropDialog(page)).toBeVisible();
      results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
