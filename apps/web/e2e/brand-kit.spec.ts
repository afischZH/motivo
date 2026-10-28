/**
 * M3-AP05 and M3-AP06: the Brand Kit page (palettes, logos, own shapes, only
 * in this browser), the file export and import, and the brand palette in the
 * editor (applied generically in several tools, one undo step, kept by new
 * variants, swatches in every colour picker, brand images in the upload
 * field). Hostile SVG and forged files are refused or cleaned.
 */
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const BRAND_KIT = "/en/brand-kit";
const BRAND = ["#e11d48", "#0ea5e9", "#84cc16", "#7c3aed"];

/** A hostile SVG logo: everything but the rect must be stripped. */
const HOSTILE_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 40 20" onload="window.__pwned=1">',
  "<script>window.__pwned=2</script>",
  '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
  '<use xlink:href="https://example.com/evil.svg#a"/>',
  '<rect width="40" height="20" fill="#2a9d8f"/>',
  "</svg>",
].join("");

const editorPath = (toolId: string) => `/en/tools/${toolSlug(toolId, "en")}`;

async function openBrandKit(page: Page) {
  await page.goto(BRAND_KIT);
  await expect(page.getByTestId("brand-palettes")).toBeVisible();
}

/** Creates a palette through the form; the starting form has 3 colours. */
async function createPalette(page: Page, name: string, colors: readonly string[]) {
  await page.getByTestId("palette-new").click();
  const form = page.getByTestId("palette-form");
  await expect(form.getByTestId("palette-form-name")).toBeFocused();
  await form.getByTestId("palette-form-name").fill(name);
  for (let i = 3; i < colors.length; i++) await form.getByTestId("palette-form-add").click();
  const hex = form.getByTestId("palette-form-hex");
  await expect(hex).toHaveCount(Math.max(3, colors.length));
  for (const [i, color] of colors.entries()) await hex.nth(i).fill(color.toUpperCase());
  await form.getByTestId("palette-form-save").click();
  await expect(page.getByTestId("brand-message")).toContainText(`Palette “${name}” saved.`);
  await expect(form).toHaveCount(0);
}

async function openEditor(page: Page, toolId: string) {
  await page.goto(editorPath(toolId));
  await expect(page.getByTestId("preview")).toBeVisible();
  await expect(page.getByTestId("brand-palette-apply")).toBeEnabled();
}

/**
 * Lower-cased text where the editor shows its colours: the preview (SVG data
 * URL), accessible names and visible text, without the brand palette section
 * itself (which always lists the palette).
 */
function editorColours(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = [];
    const src = document.querySelector('[data-testid="preview"] img')?.getAttribute("src") ?? "";
    try {
      parts.push(decodeURIComponent(src));
    } catch {
      parts.push(src);
    }
    for (const el of document.querySelectorAll("[aria-label]")) {
      if (!el.closest('[data-testid="brand-palette"]'))
        parts.push(el.getAttribute("aria-label") ?? "");
    }
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const el of clone.querySelectorAll('[data-testid="brand-palette"]')) el.remove();
    parts.push(clone.textContent ?? "");
    return parts.join("\n").toLowerCase();
  });
}

/** Records every request the page makes while `action` runs. */
async function requestsDuring(page: Page, action: () => Promise<void>): Promise<Request[]> {
  const seen: Request[] = [];
  const listener = (request: Request) => seen.push(request);
  page.on("request", listener);
  try {
    await action();
    await page.waitForTimeout(1000);
  } finally {
    page.off("request", listener);
  }
  return seen;
}

function expectNoDataSent(requests: Request[], origin: string, marker: string) {
  for (const request of requests) {
    expect(request.method(), request.url()).toBe("GET");
    expect(request.postData(), request.url()).toBeNull();
    expect(request.url()).not.toContain(marker);
    if (request.url().startsWith(origin)) {
      expect(new URL(request.url()).pathname, request.url()).toMatch(/^\/_next\//);
    }
  }
}

function readStore(page: Page, store: string): Promise<string> {
  return page.evaluate(
    (name) =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("motivo");
        open.onerror = () => reject(new Error("open failed"));
        open.onsuccess = () => {
          const all = open.result.transaction(name).objectStore(name).getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve(JSON.stringify(all.result));
          };
          all.onerror = () => reject(new Error("read failed"));
        };
      }),
    store,
  );
}

test.describe("brand kit page", () => {
  test("creates, edits and keeps palettes without a server", async ({ page }) => {
    await openBrandKit(page);
    await expect(page.getByTestId("palettes-empty")).toBeVisible();
    await expect(page.getByTestId("brand-storage-hint")).toContainText("stays in this browser");

    const origin = new URL(page.url()).origin;
    const requests = await requestsDuring(page, () => createPalette(page, "Acme 9c4e", BRAND));
    expectNoDataSent(requests, origin, "9c4e");

    const card = page.getByTestId("palette-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("palette-name")).toHaveText("Acme 9c4e");
    await expect(card.getByTestId("palette-default")).toHaveText("Default");
    await expect(card.locator("[data-color]")).toHaveCount(4);
    expect(
      await card
        .locator("[data-color]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-color"))),
    ).toEqual(BRAND);

    // Edit with the keyboard: move a colour, focus stays on the button used.
    await card.getByTestId("palette-edit").click();
    const form = page.getByTestId("palette-form");
    await form.getByRole("button", { name: "Move colour 1 down" }).click();
    await expect(form.getByRole("button", { name: "Move colour 2 down" })).toBeFocused();
    await expect(form.getByTestId("palette-form-hex").nth(0)).toHaveValue(BRAND[1] ?? "");
    // An invalid value is named and focused, nothing is saved.
    await form.getByTestId("palette-form-hex").nth(2).fill("#zz");
    await form.getByTestId("palette-form-save").click();
    await expect(form.getByRole("alert")).toContainText("colour 3");
    await expect(form.getByTestId("palette-form-hex").nth(2)).toBeFocused();
    // Escape cancels the edit.
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);

    // A second palette, made the default.
    await createPalette(page, "Second", ["#111111", "#eeeeee"]);
    await expect(page.getByTestId("palette-card")).toHaveCount(2);
    const second = page.getByTestId("palette-card").filter({ hasText: "Second" });
    await second.getByTestId("palette-make-default").click();
    await expect(second.getByTestId("palette-default")).toBeVisible();

    // Still there after a reload.
    await page.reload();
    await expect(page.getByTestId("palette-card")).toHaveCount(2);
    await expect(
      page.getByTestId("palette-card").filter({ hasText: "Second" }).getByTestId("palette-default"),
    ).toBeVisible();

    // Delete and undo.
    await second.getByTestId("palette-delete").click();
    await expect(page.getByTestId("palette-card")).toHaveCount(1);
    await page.getByTestId("brand-undo").click();
    await expect(page.getByTestId("palette-card")).toHaveCount(2);
    await expect(
      page.getByTestId("palette-card").filter({ hasText: "Second" }).getByTestId("palette-default"),
    ).toBeVisible();
  });

  test("sanitizes an SVG logo with a script and refuses forged images", async ({ page }) => {
    await openBrandKit(page);
    const origin = new URL(page.url()).origin;
    const requests = await requestsDuring(page, async () => {
      await page.getByTestId("logo-file").setInputFiles({
        name: "evil-5d1b.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(HOSTILE_SVG),
      });
      await expect(page.getByTestId("brand-message")).toContainText("Logo “evil-5d1b” added.");
    });
    expectNoDataSent(requests, origin, "5d1b");
    await expect(page.getByTestId("brand-message")).toContainText("removed parts of the SVG");

    const image = page.getByTestId("logo-image");
    await expect(image).toHaveCount(1);
    const src = decodeURIComponent((await image.getAttribute("src")) ?? "");
    expect(src).toContain("<rect");
    expect(src).not.toMatch(/script|onload|foreignObject|example\.com/i);
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(page.locator("svg script, svg foreignObject")).toHaveCount(0);
    const stored = await readStore(page, "brand-assets");
    expect(stored).toContain("<rect");
    expect(stored).not.toMatch(/script|onload|foreignObject|example\.com/i);

    // Not an image, whatever the name says (magic bytes).
    await page.getByTestId("logo-file").setInputFiles({
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from("<html><script>alert(1)</script></html>"),
    });
    await expect(page.getByTestId("brand-message")).toContainText(
      "This format does not work here.",
    );
    // Shapes must be SVG.
    await page.getByTestId("shape-file").setInputFiles({
      name: "shape.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await expect(page.getByTestId("brand-message")).toContainText("Shapes must be SVG files.");
    await expect(page.getByTestId("shape-card")).toHaveCount(0);
    await expect(page.getByTestId("logo-card")).toHaveCount(1);

    // Survives a reload, delete with undo.
    await page.reload();
    await expect(page.getByTestId("logo-card")).toHaveCount(1);
    await page
      .getByTestId("logo-card")
      .getByRole("button", { name: /Delete/ })
      .click();
    await expect(page.getByTestId("logo-card")).toHaveCount(0);
    await page.getByTestId("brand-undo").click();
    await expect(page.getByTestId("logo-card")).toHaveCount(1);
  });

  test("German slug, noindex and not in the sitemap", async ({ page, request }) => {
    const response = await page.goto("/de/brand-kit");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Brand Kit");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByTestId("palettes-empty")).toBeVisible();
    await expect(page.getByTestId("brand-kit-nav")).toHaveAttribute("href", "/de/brand-kit");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("brand-kit");
  });

  for (const width of [375, 768, 1280]) {
    test(`fits ${width} px without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openBrandKit(page);
      await createPalette(page, "A palette with a rather long name to check the layout", BRAND);
      await page.getByTestId("logo-file").setInputFiles({
        name: "logo.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(HOSTILE_SVG),
      });
      await expect(page.getByTestId("logo-card")).toHaveCount(1);
      await page.getByTestId("palette-edit").click();
      await expect(page.getByTestId("palette-form")).toBeVisible();
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      expect(await overflow()).toBeLessThanOrEqual(0);
      await openEditor(page, "blob");
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const axe = async () =>
        expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual(
          [],
        );
      await openBrandKit(page);
      await expect(page.getByTestId("palettes-empty")).toBeVisible();
      await axe();

      await createPalette(page, "Axe", BRAND);
      await page.getByTestId("logo-file").setInputFiles({
        name: "logo.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(HOSTILE_SVG),
      });
      await expect(page.getByTestId("logo-card")).toHaveCount(1);
      await axe();
      await page.getByTestId("palette-edit").click();
      await page.getByTestId("palette-form-hex").nth(0).fill("#zz");
      await page.getByTestId("palette-form-save").click();
      await expect(page.getByTestId("palette-form").getByRole("alert")).toBeVisible();
      await axe();

      await openEditor(page, "blob");
      await axe();
      await page.getByTestId("brand-palette-apply").click();
      await openColourPicker(page);
      await expect(page.getByTestId("brand-swatches")).toBeVisible();
      await axe();
    });
  }
});

/** Opens the first colour picker of the control panel (not the brand section). */
async function openColourPicker(page: Page) {
  const trigger = page
    .locator('button[aria-haspopup="dialog"]')
    .filter({ has: page.locator("span[style*='background-color']") })
    .first();
  await trigger.click();
}

test.describe("brand palette in the editor", () => {
  test("applies in three tools, locks the colours and undoes in one step", async ({ page }) => {
    await page.goto(editorPath("blob"));
    await expect(page.getByTestId("brand-palette-empty")).toBeVisible();
    await expect(page.getByTestId("brand-kit-link")).toHaveAttribute("href", "/en/brand-kit");

    await openBrandKit(page);
    await createPalette(page, "Acme", BRAND);
    await createPalette(page, "Other", ["#123456", "#654321"]);

    for (const toolId of ["blob", "css-patterns", "palette-generator"]) {
      await openEditor(page, toolId);
      const select = page.getByTestId("brand-palette-select");
      // The default palette is preselected.
      await expect(select.locator("option:checked")).toHaveText("Acme (default)");
      const before = await editorColours(page);
      expect(before, toolId).not.toContain(BRAND[0]);

      await page.getByTestId("brand-palette-apply").click();
      await expect(page.getByTestId("shell-flash")).toHaveText("Brand palette “Acme” applied.");
      await expect.poll(() => editorColours(page), { message: toolId }).toContain(BRAND[0]);

      // New variants keep the brand colours (they are locked).
      await page.getByTestId("new-variant").click();
      await page.getByTestId("new-variant").click();
      expect(await editorColours(page), toolId).toContain(BRAND[0]);

      // One undo step brings the colours back (after the two variants).
      await page.locator("body").press("ControlOrMeta+Z");
      await page.locator("body").press("ControlOrMeta+Z");
      await page.locator("body").press("ControlOrMeta+Z");
      await expect.poll(() => editorColours(page), { message: toolId }).not.toContain(BRAND[0]);
    }

    // Another palette from the list.
    await openEditor(page, "blob");
    await page.getByTestId("brand-palette-select").selectOption({ label: "Other" });
    await page.getByTestId("brand-palette-apply").click();
    await expect(page.getByTestId("shell-flash")).toHaveText("Brand palette “Other” applied.");
    await expect.poll(() => editorColours(page)).toContain("#123456");
  });

  test("shows brand swatches in colour pickers", async ({ page }) => {
    await openBrandKit(page);
    await createPalette(page, "Acme", BRAND);
    await openEditor(page, "blob");
    await openColourPicker(page);
    const swatches = page.getByTestId("brand-swatches");
    await expect(swatches).toBeVisible();
    await expect(swatches.locator("[data-brand-color]")).toHaveCount(BRAND.length);
    await swatches.getByRole("button", { name: `Use brand colour ${BRAND[3]}` }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => editorColours(page)).toContain(BRAND[3]);
  });

  test("uses a brand logo in Seamless Patterns, sanitized again", async ({ page }) => {
    await openBrandKit(page);
    await page.getByTestId("logo-file").setInputFiles({
      name: "acme.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(HOSTILE_SVG),
    });
    await expect(page.getByTestId("logo-card")).toHaveCount(1);

    await page.goto(editorPath("seamless-patterns"));
    await expect(page.getByTestId("preview")).toBeVisible();
    await page.getByTestId("asset-brand-kit").click();
    const item = page.getByTestId("asset-brand-item");
    await expect(item).toHaveCount(1);
    await item.click();
    const dialog = page.getByRole("dialog", { name: "Crop" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("asset-thumbnail")).toBeVisible();
    const src = decodeURIComponent(
      (await page.getByTestId("preview").locator("img").getAttribute("src")) ?? "",
    );
    expect(src).not.toMatch(/script|onload|foreignObject|example\.com/i);
    expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  });
});

test.describe("moving the brand kit with a file", () => {
  test("exports and imports into a fresh browser", async ({ page, browser }) => {
    await openBrandKit(page);
    await createPalette(page, "Travelling", BRAND);
    await page.getByTestId("logo-file").setInputFiles({
      name: "logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(HOSTILE_SVG),
    });
    await expect(page.getByTestId("logo-card")).toHaveCount(1);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("brand-export").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^motivo-brandkit-v1-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    const file = JSON.parse(await readFile(path, "utf8")) as {
      format: string;
      version: number;
      palettes: unknown[];
      assets: unknown[];
    };
    expect(file).toMatchObject({ format: "motivo-brandkit", version: 1 });
    expect(file.palettes).toHaveLength(1);
    expect(file.assets).toHaveLength(1);
    await expect(page.getByTestId("brand-message")).toContainText("Brand Kit saved as a file.");

    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await openBrandKit(other);
    await expect(other.getByTestId("palettes-empty")).toBeVisible();
    await other.getByTestId("brand-file").setInputFiles(path);
    await expect(other.getByTestId("brand-message")).toContainText(
      "Imported 1 palette and 1 image.",
    );
    const card = other.getByTestId("palette-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("palette-name")).toHaveText("Travelling");
    await expect(card.getByTestId("palette-default")).toBeVisible();
    await expect(other.getByTestId("logo-card")).toHaveCount(1);

    // The same file again adds nothing.
    await other.getByTestId("brand-file").setInputFiles(path);
    await expect(other.getByTestId("brand-message")).toContainText("2 entries were already there.");
    await expect(card).toHaveCount(1);

    // The imported palette works in the editor.
    await openEditor(other, "blob");
    await other.getByTestId("brand-palette-apply").click();
    await expect.poll(() => editorColours(other)).toContain(BRAND[0]);
    await fresh.close();
  });

  test("refuses forged and wrong files with clear messages", async ({ page }) => {
    await openBrandKit(page);
    const input = page.getByTestId("brand-file");
    const message = page.getByTestId("brand-message");
    const json = (name: string, value: string) => ({
      name,
      mimeType: "application/json",
      buffer: Buffer.from(value),
    });

    await input.setInputFiles(
      json(
        "evil.json",
        '{"format":"motivo-brandkit","version":1,"palettes":[{"__proto__":{"isAdmin":true}}],"assets":[]}',
      ),
    );
    await expect(message).toContainText("forbidden entries");
    expect(await page.evaluate(() => ({}) as Record<string, unknown>)).not.toHaveProperty(
      "isAdmin",
    );

    await input.setInputFiles(
      json("designs.json", '{"format":"motivo-designs","version":1,"designs":[]}'),
    );
    await expect(message).toContainText("This is a designs file.");
    await input.setInputFiles(json("other.json", '{"hello":"world"}'));
    await expect(message).toContainText("not a Motivo Brand Kit file");
    await input.setInputFiles(json("broken.json", "{broken"));
    await expect(message).toContainText("damaged or not JSON");
    await input.setInputFiles(
      json("future.json", '{"format":"motivo-brandkit","version":99,"palettes":[],"assets":[]}'),
    );
    await expect(message).toContainText("newer version");

    // Hostile SVG is cleaned again, forged rasters and bad palettes are skipped.
    const now = Date.now();
    await input.setInputFiles(
      json(
        "mixed.json",
        JSON.stringify({
          format: "motivo-brandkit",
          version: 1,
          exportedAt: now,
          defaultPaletteId: null,
          palettes: [
            {
              id: "1".repeat(32),
              name: "Ok",
              colors: ["#E11D48", "#0ea5e9"],
              createdAt: 1,
              updatedAt: 2,
            },
            {
              id: "2".repeat(32),
              name: "Bad",
              colors: ["red", "javascript:alert(1)"],
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          assets: [
            {
              id: "a".repeat(32),
              kind: "shape",
              name: "Hostile",
              image: { kind: "svg", svg: HOSTILE_SVG, width: 40, height: 20, name: "h.svg" },
              createdAt: 1,
            },
            {
              id: "b".repeat(32),
              kind: "logo",
              name: "Forged",
              image: {
                kind: "raster",
                href: `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`,
                width: 10,
                height: 10,
                name: "f.png",
              },
              createdAt: 1,
            },
          ],
        }),
      ),
    );
    await expect(message).toContainText("Imported 1 palette and 1 image.");
    await expect(message).toContainText("Palette Bad: invalid data");
    await expect(message).toContainText("Image Forged: unsafe or damaged image");
    await expect(page.getByTestId("palette-card")).toHaveCount(1);
    await expect(page.getByTestId("shape-card")).toHaveCount(1);
    await expect(page.getByTestId("logo-card")).toHaveCount(0);
    const stored = await readStore(page, "brand-assets");
    expect(stored).toContain("<rect");
    expect(stored).not.toMatch(/script|onload|foreignObject|example\.com/i);
    expect(await readStore(page, "brand-palettes")).toContain("#e11d48");
  });
});
