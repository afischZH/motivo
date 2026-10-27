import AxeBuilder from "@axe-core/playwright";
import { encodePng } from "@motivo/engine";
import { expect, test, type Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** A 12 × 10 PNG: navy on the top 6 rows, red on 3, sand on 1 (60 / 30 / 10 %). */
function fixturePng(): Buffer {
  const width = 12;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const rgb = y < 6 ? [29, 53, 87] : y < 9 ? [230, 57, 70] : [241, 250, 238];
    for (let x = 0; x < width; x++) data.set([...rgb, 255], (y * width + x) * 4);
  }
  return Buffer.from(encodePng({ width, height, data }));
}

/** The SVG behind the preview image, decoded. */
async function previewSvg(page: Page): Promise<string> {
  const src = (await page.getByTestId("preview").locator("img").getAttribute("src")) ?? "";
  return decodeURIComponent(src.slice(src.indexOf(",") + 1));
}

/** Hex colours shown in the preview, in order. */
function previewHexes(svg: string): string[] {
  return [...svg.matchAll(/>(#[0-9a-f]{6})<\/text>/g)].map((m) => m[1] ?? "");
}

/** True when two hex colours differ by at most `tolerance` per channel. */
function closeHex(a: string, b: string, tolerance = 8): boolean {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ca, cb] = [channels(a), channels(b)];
  return ca.every((v, i) => Math.abs(v - (cb[i] ?? -999)) <= tolerance);
}

async function openTool(page: Page, locale: "de" | "en") {
  await page.goto(`/${locale}/tools/palette-from-image`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Hydrated: the controller has drawn the sample thumbnail and is idle.
  await expect(page.getByTestId("image-input-source")).toHaveText(
    locale === "de" ? "Beispielbild" : "Sample image",
  );
}

test.describe("palette from image", () => {
  test("extracts the colours of an uploaded image with their shares", async ({ page }) => {
    await openTool(page, "en");
    const count = page.getByRole("textbox", { name: "Number of colors" });
    await count.fill("3");
    await count.press("Enter");
    await page.getByLabel("Choose image").setInputFiles({
      name: "flag.png",
      mimeType: "image/png",
      buffer: fixturePng(),
    });
    await expect(page.getByTestId("image-input-status")).toHaveText(
      "flag.png is analyzed. The preview shows the result.",
    );
    await expect(page.getByTestId("image-input-source")).toHaveText("flag.png");
    await expect.poll(() => previewSvg(page)).toContain(">#1d3557</text>");
    const svg = await previewSvg(page);
    for (const text of [
      ">#e63946</text>",
      ">#f1faee</text>",
      ">60%</text>",
      ">30%</text>",
      ">10%</text>",
    ]) {
      expect(svg).toContain(text);
    }
    expect(await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).toMatchObject({
      violations: [],
    });
  });

  test("extracts the colours of an SVG without running its scripts", async ({ page }) => {
    await openTool(page, "en");
    const count = page.getByRole("textbox", { name: "Number of colors" });
    await count.fill("3");
    await count.press("Enter");
    // No width/height (viewBox only), a script and an event handler.
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 10" onload="window.__pwned = 2">',
      "<script>window.__pwned = 1</script>",
      '<rect width="12" height="6" fill="#1d3557"/>',
      '<rect y="6" width="12" height="3" fill="#e63946"/>',
      '<rect y="9" width="12" height="1" fill="#f1faee"/>',
      "</svg>",
    ].join("");
    await page.getByLabel("Choose image").setInputFiles({
      name: "flag.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(svg),
    });
    await expect(page.getByTestId("image-input-source")).toHaveText("flag.svg");
    await expect.poll(() => previewSvg(page)).toContain(">#1d3557</text>");
    const preview = await previewSvg(page);
    for (const text of [">60%</text>", ">30%</text>"]) expect(preview).toContain(text);
    // Browsers rasterise SVG differently (Firefox blends rect edges into the
    // red, e.g. #e63b47), so the colours are compared with a small tolerance.
    const hexes = previewHexes(preview);
    for (const expected of ["#1d3557", "#e63946", "#f1faee"]) {
      expect(
        hexes.some((hex) => closeHex(hex, expected)),
        `${expected} in ${hexes.join(", ")}`,
      ).toBe(true);
    }
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test("reports files that are not images", async ({ page }) => {
    await openTool(page, "de");
    await page.getByLabel("Bild wählen").setInputFiles({
      name: "notes.png",
      mimeType: "image/png",
      buffer: Buffer.from("<html><script>window.__pwned = 1</script></html>"),
    });
    await expect(page.getByTestId("image-input-error")).toContainText(
      "Dieses Format kennt Motivo nicht.",
    );
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test("has no axe violations in the empty state", async ({ page }) => {
    await openTool(page, "de");
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
