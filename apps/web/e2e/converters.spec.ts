import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

/** An SVG that tries to run script in every common way; it must stay inert. */
const HOSTILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" id="user-svg" viewBox="0 0 10 10" onload="window.__pwned = 1">
  <script>window.__pwned = 2</script>
  <foreignObject width="10" height="10"><img xmlns="http://www.w3.org/1999/xhtml" src="x" onerror="window.__pwned = 3"/></foreignObject>
  <rect width="10" height="10" fill="#5b5bd6"/>
</svg>`;

/** 1×1 transparent PNG. */
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const pwned = (page: Page) =>
  page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned);

test.describe("SVG to CSS converter", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`converts, previews only via img and passes axe (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/en/convert/svg-to-css");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("SVG to CSS converter");
      if (scheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      await expectNoAxeViolations(page);

      await page.getByLabel("SVG code").fill(HOSTILE_SVG);
      const output = page.getByRole("textbox", { name: "Converted code" });
      await expect(output).toHaveValue(/^background-image: url\("data:image\/svg\+xml,%3Csvg /);

      const preview = page.getByRole("img", { name: "Preview of the converted image" });
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute("src", /^data:image\/svg\+xml,/);

      // The user SVG is never part of the DOM and none of its scripts ran.
      await expect(page.locator("#user-svg")).toHaveCount(0);
      await expect(page.locator("main svg")).toHaveCount(0);
      expect(await pwned(page)).toBeUndefined();

      await page.getByText("Data URI", { exact: true }).click();
      await expect(page.getByRole("radio", { name: "Data URI" })).toBeChecked();
      await expect(output).toHaveValue(/^data:image\/svg\+xml,%3Csvg /);

      await expectNoAxeViolations(page);
    });
  }

  test("is keyboard operable and copies the result", async ({ page, context, browserName }) => {
    await page.goto("/en/convert/svg-to-css");
    await page.getByRole("button", { name: "Insert example" }).focus();
    await page.keyboard.press("Enter");
    const output = page.getByRole("textbox", { name: "Converted code" });
    await expect(output).toHaveValue(/^background-image: url\("data:image\/svg\+xml,/);

    // Arrow keys move through the format radio group.
    await page.getByRole("radio", { name: "CSS" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Data URI" })).toBeChecked();

    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Copied! Off to your project.");
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(await output.inputValue());
  });

  test("explains invalid input", async ({ page }) => {
    await page.goto("/de/konverter/svg-zu-css");
    const input = page.getByLabel("SVG-Code");
    // Retried: input typed before hydration never reaches React, and the
    // debounced worker run can be slow on CI (WebKit).
    await expect(async () => {
      await input.fill("");
      await input.fill("<html><body>kein svg</body></html>");
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Das sieht nicht nach SVG aus.",
        { timeout: 3000 },
      );
    }).toPass({ timeout: 20_000 });
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: "Herunterladen" })).toBeDisabled();
  });
});

test.describe("Base64 to image converter", () => {
  test("decodes a PNG into a blob preview and downloads it", async ({ page }) => {
    await page.goto("/en/convert/base64-to-image");
    const input = page.getByLabel("Base64 or data URI");
    const preview = page.getByRole("img", { name: "Preview of the converted image" });
    // Retried for the same reasons as "explains invalid input".
    await expect(async () => {
      await input.fill("");
      await input.fill(`data:image/png;base64,${PNG_BASE64}`);
      await expect(preview).toHaveAttribute("src", /^blob:/, { timeout: 3000 });
    }).toPass({ timeout: 20_000 });

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe("image.png");
  });

  test("rejects non-image data URIs", async ({ page }) => {
    await page.goto("/en/convert/base64-to-image");
    const html = Buffer.from("<script>window.__pwned = 4</script>").toString("base64");
    await page.getByLabel("Base64 or data URI").fill(`data:text/html;base64,${html}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "This type is not supported.",
    );
    await expect(page.getByRole("img", { name: "Preview of the converted image" })).toHaveCount(0);
    expect(await pwned(page)).toBeUndefined();
  });
});

test("image to Base64 reads a picked file", async ({ page }) => {
  await page.goto("/en/convert/image-to-base64");
  await page.locator('input[type="file"]').setInputFiles({
    name: "dot.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_BASE64, "base64"),
  });
  await expect(page.getByRole("textbox", { name: "Converted code" })).toHaveValue(
    `data:image/png;base64,${PNG_BASE64}`,
  );
});

test("converter index links to all six converters", async ({ page }) => {
  await page.goto("/en/convert");
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(6);
  await expectNoAxeViolations(page);
});
