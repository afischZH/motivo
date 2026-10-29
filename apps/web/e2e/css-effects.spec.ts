/**
 * M4-AP06: Glass and Border Effects and Bento Grid. Landing pages in DE and
 * EN, the real CSS preview (backdrop-filter on a real element), reduced
 * motion for the rotating border, the contrast hint, export choices per
 * effect, copying code, axe in light and dark, and no horizontal overflow at
 * 375, 768 and 1280 px.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { enableClipboard } from "./support/clipboard";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const card = (page: Page): Locator => page.getByTestId("preview").locator("[data-motif-element]");

async function openEditor(page: Page, toolId: string, locale: "de" | "en" = "en", hash = "") {
  await page.goto(`/${locale}/tools/${toolSlug(toolId, locale)}${hash}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: locale === "de" ? "Teilen" : "Share" }),
  ).toBeEnabled();
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

/** Sets a colour control through its popover (swatch button, then hex field). */
async function setColor(page: Page, name: string, hexLabel: string, value: string) {
  await page.getByRole("button", { name: new RegExp(`^${name} #`) }).click();
  const hex = page.getByRole("textbox", { name: hexLabel, exact: true });
  await hex.fill(value);
  await hex.press("Enter");
  await page.keyboard.press("Escape");
  await expect(hex).toBeHidden();
}

/** Picks an option of a segmented control (radio group) in the controls panel. */
async function pick(page: Page, name: string) {
  await page.getByRole("radio", { name, exact: true }).first().click();
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("landing pages", () => {
  const pages = [
    ["glass-effects", "de", "Glas- und Rahmen-Effekte"],
    ["glass-effects", "en", "Glass and Border Effects"],
    ["bento-grid", "de", "Bento-Grid"],
    ["bento-grid", "en", "Bento Grid"],
  ] as const;
  for (const [toolId, locale, name] of pages) {
    test(`${toolId} (${locale}) has a landing page with FAQ and an editor link`, async ({
      page,
    }) => {
      const response = await page.goto(`/${locale}/${toolSlug(toolId, locale)}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
      await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached();
      await expect(
        page.locator(`a[href^="/${locale}/tools/${toolSlug(toolId, locale)}"]`).first(),
      ).toBeVisible();
      const og = await page.locator('meta[property="og:image"]').getAttribute("content");
      expect(og).toContain(`/og/${locale}/${toolId}.png`);
    });
  }

  test("the CSS effects category lists both tools", async ({ page }) => {
    await page.goto("/de/tools/kategorie/css-effekte");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("CSS-Effekte und Layouts");
    await expect(
      page.getByRole("link", { name: /Glas- und Rahmen-Effekte/ }).first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Bento-Grid/ }).first()).toBeVisible();
  });

  test("the sitemap lists both landing pages", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/de/glas-effekt-generator");
    expect(xml).toContain("/en/glassmorphism-generator");
    expect(xml).toContain("/en/bento-grid-generator");
  });
});

test.describe("glass and border effects", () => {
  test("previews real CSS: backdrop-filter on a card above the stage", async ({ page }) => {
    await openEditor(page, "glass-effects");
    await expect(card(page)).toBeVisible();
    const style = await card(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { backdrop: s.backdropFilter, radius: s.borderRadius };
    });
    expect(style.backdrop).toBe("blur(16px) saturate(1.6)");
    expect(style.radius).toBe("24px");
  });

  test("offers code only for glass, images for border and glow", async ({ page }) => {
    await openEditor(page, "glass-effects");
    let dialog = await openExport(page);
    await expect(dialog.getByRole("radio", { name: "PNG", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("radio", { name: "HTML example", exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await pick(page, "Glow");
    dialog = await openExport(page);
    await expect(dialog.getByRole("radio", { name: "PNG", exact: true })).toHaveCount(1);
    await expect(dialog.getByRole("radio", { name: "WebP", exact: true })).toHaveCount(1);
  });

  test("copies the CSS with the -webkit- prefix", async ({ page, context, browserName }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "glass-effects");
    const dialog = await openExport(page);
    await choose(dialog, "CSS");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText("-webkit-backdrop-filter: blur(16px) saturate(160%);");
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Copied! Off to your project.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(await code.textContent());
    expect(copied).toMatch(/^\.glass-card \{/);
  });

  test("shows the own card text in the preview and the HTML example", async ({ page }) => {
    await openEditor(page, "glass-effects");
    const preview = page.getByTestId("preview");
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    // Typing a space in the field adds text and does not roll a new variant.
    await title.fill("Hello");
    await title.press("Space");
    await title.pressSequentially("glass");
    await page.getByRole("textbox", { name: "Text", exact: true }).fill("Readable on any stage.");
    await expect(preview.getByText("Hello glass", { exact: true })).toBeVisible();
    await expect(preview.getByText("Readable on any stage.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Text color #ffffff" })).toBeVisible();
    await pick(page, "Center");
    await expect(preview.getByText("Hello glass", { exact: true })).toHaveCSS(
      "text-align",
      "center",
    );
    const dialog = await openExport(page);
    await choose(dialog, "HTML example");
    await expect(dialog.getByTestId("export-code")).toContainText("<h2>Hello glass</h2>");
  });

  test("shows a contrast hint for unreadable text on glass", async ({ page }) => {
    await openEditor(page, "glass-effects");
    const hint = page.getByTestId("advisory-text-contrast");
    // The default passes: white text on darkly tinted glass.
    await expect(page.getByRole("button", { name: "Text color #ffffff" })).toBeVisible();
    await expect(hint).toHaveCount(0);
    // Dark text on dark glass misses AA.
    await setColor(page, "Text color", "Hex value", "#1e1b4b");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("WCAG AA needs 4.5:1");
    // Undo brings the readable colour back and the hint goes away.
    await page.locator("body").press("ControlOrMeta+Z");
    await expect(hint).toHaveCount(0);
  });

  test("animates the rotating border only when motion is allowed", async ({ page }) => {
    await openEditor(page, "glass-effects");
    await page.getByRole("button", { name: "Neon ring" }).first().click();
    await expect(card(page)).toBeVisible();
    await expect
      .poll(() => card(page).evaluate((el) => getComputedStyle(el).animationName))
      .toBe("musterli-border-spin");
    // The @property rule is installed once in the document.
    const registered = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) =>
        [...sheet.cssRules].some((rule) => rule.cssText.includes("--musterli-border-angle")),
      ),
    );
    expect(registered).toBe(true);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() => card(page).evaluate((el) => getComputedStyle(el).animationName))
      .toBe("none");
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`editor has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      // Check the panel with the contrast hint shown.
      await openEditor(page, "glass-effects", "de");
      await setColor(page, "Textfarbe", "HEX-Wert", "#1e1b4b");
      await expect(page.getByTestId("advisory-text-contrast")).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("bento grid", () => {
  const motif = (page: Page) => page.getByTestId("preview").locator("img");
  const src = async (page: Page) => (await motif(page).getAttribute("src")) ?? "";

  test("Space rolls a new layout, the locked layout stays", async ({ page }) => {
    await openEditor(page, "bento-grid");
    await expect(motif(page)).toBeVisible();
    const first = await src(page);
    await page.locator("body").press("Space");
    await expect.poll(() => src(page)).not.toBe(first);

    // Lock the layout: the number stays on Space.
    const field = page.getByRole("textbox", { name: "Layout no." });
    const before = await field.inputValue();
    await page.getByRole("button", { name: /Lock.*Layout no\./ }).click();
    await page.locator("body").press("Space");
    await expect.poll(() => src(page)).not.toBe(first);
    await expect(field).toHaveValue(before);
  });

  test("copies CSS grid code", async ({ page, context, browserName }) => {
    await enableClipboard(context, browserName);
    await openEditor(page, "bento-grid");
    const dialog = await openExport(page);
    await choose(dialog, "CSS Grid + HTML");
    const code = dialog.getByTestId("export-code");
    await expect(code).toContainText("grid-template-columns: repeat(4, minmax(0, 1fr));");
    await dialog.getByRole("button", { name: "Copy", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(await code.textContent());
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`editor has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openEditor(page, "bento-grid", "de");
      await page.locator("body").press("Space");
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("layout widths", () => {
  for (const width of [375, 768, 1280]) {
    for (const path of [
      "/de/tools/glas-effekt-generator",
      "/en/tools/bento-grid-generator",
      "/de/glas-effekt-generator",
      "/en/bento-grid-generator",
    ]) {
      test(`${path} has no horizontal overflow at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await horizontalOverflow(page)).toBe(0);
      });
    }
  }
});
