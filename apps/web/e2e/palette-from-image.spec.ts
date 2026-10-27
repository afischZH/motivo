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
