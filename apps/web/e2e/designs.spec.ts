import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { designToHash } from "@musterli/editor-ui/share";
import { registry } from "@musterli/tool-registry";
import { expect, test, type Page, type Request } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const EDITOR = "/en/tools/blob-generator";
const MY_DESIGNS = "/en/my-designs";

const preview = (page: Page) => page.getByTestId("preview").locator("img");

/** Opens the editor and waits until saving is ready (hydrated, storage read). */
async function openEditor(page: Page, path = EDITOR) {
  await page.goto(path);
  await expect(preview(page)).toBeVisible();
  await expect(page.getByTestId("save-design")).toBeEnabled();
}

async function previewSrc(page: Page): Promise<string> {
  await expect(preview(page)).toBeVisible();
  return (await preview(page).getAttribute("src")) ?? "";
}

/**
 * Spread of the first thumbnail's luminance (standard deviation, 0 to 255):
 * a real picture, not an empty or single-colour box.
 */
async function thumbnailContrast(page: Page): Promise<number> {
  const thumb = page.getByTestId("design-thumbnail").first();
  await expect(thumb).toBeVisible();
  return thumb.evaluate(async (el) => {
    const img = el as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let sq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
      sum += y;
      sq += y * y;
    }
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
  });
}

/** Rolls a new variant and returns its preview once it is rendered. */
async function newVariant(page: Page): Promise<string> {
  const before = await previewSrc(page);
  await page.getByTestId("new-variant").click();
  await expect.poll(() => previewSrc(page)).not.toBe(before);
  return previewSrc(page);
}

/** Names the design and saves it with the button; returns the saved id. */
async function saveDesign(page: Page, name: string): Promise<string> {
  await page.getByTestId("design-name").fill(name);
  await page.getByTestId("save-design").click();
  await expect(page.getByTestId("shell-flash")).toHaveText("Saved, in this browser only.");
  await expect(page).toHaveURL(/#design=[0-9a-f]{32}$/);
  return new URL(page.url()).hash.replace("#design=", "");
}

/**
 * Records every request the page makes while `action` runs. Saving must not
 * talk to any server: no request may carry the design (name, params, body).
 */
async function requestsDuring(page: Page, action: () => Promise<void>): Promise<Request[]> {
  const seen: Request[] = [];
  const listener = (request: Request) => seen.push(request);
  page.on("request", listener);
  try {
    await action();
    // Late requests (e.g. a debounced draft that would sync somewhere) would show up here.
    await page.waitForTimeout(1500);
  } finally {
    page.off("request", listener);
  }
  return seen;
}

test.describe("saving designs locally", () => {
  test("save, reload, reopen, rename, duplicate and delete without a server", async ({ page }) => {
    await openEditor(page);
    const src = await newVariant(page);

    const name = "E2E Blob 7f3a";
    const requests = await requestsDuring(page, async () => {
      await saveDesign(page, name);
    });
    const origin = new URL(page.url()).origin;
    for (const request of requests) {
      expect(request.method(), request.url()).toBe("GET");
      expect(request.postData(), request.url()).toBeNull();
      expect(request.url()).not.toContain("7f3a");
      // Only static assets of our own server (chunks, the raster worker), nothing else.
      if (request.url().startsWith(origin)) {
        expect(new URL(request.url()).pathname, request.url()).toMatch(/^\/_next\//);
      }
    }

    // Reload: the same design comes back from IndexedDB.
    await page.reload();
    await expect(page.getByTestId("design-name")).toHaveValue(name);
    await expect(page.getByTestId("design-status")).toHaveText("Saved");
    await expect.poll(() => previewSrc(page)).toBe(src);

    // A change marks it, Ctrl/Cmd+S saves it again under the same id.
    const id = new URL(page.url()).hash.replace("#design=", "");
    await page.getByTestId("new-variant").click();
    await expect(page.getByTestId("design-status")).toHaveText("Changed");
    await page.locator("body").press("ControlOrMeta+S");
    await expect(page.getByTestId("design-status")).toHaveText("Saved");
    expect(new URL(page.url()).hash).toBe(`#design=${id}`);
    const savedSrc = await previewSrc(page);

    // Overview: card with a real thumbnail.
    await page.getByTestId("my-designs-nav").click();
    await expect(page).toHaveURL(/\/en\/my-designs$/);
    const card = page.getByTestId("design-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("design-name")).toHaveText(name);
    await expect(card.getByTestId("design-thumbnail")).toHaveAttribute(
      "src",
      /^data:image\/(webp|png);base64,/,
    );
    await expect(page.getByTestId("storage-hint")).toBeVisible();

    // Rename with the keyboard.
    await card.getByTestId("design-rename").click();
    const input = card.getByTestId("design-rename-input");
    await expect(input).toBeFocused();
    await input.fill("Renamed blob");
    await input.press("Enter");
    await expect(card.getByTestId("design-name")).toHaveText("Renamed blob");
    await expect(card.getByTestId("design-rename")).toBeFocused();

    // Duplicate.
    await card.getByTestId("design-duplicate").click();
    await expect(page.getByTestId("design-card")).toHaveCount(2);
    const copy = page.getByTestId("design-card").filter({ hasText: "Renamed blob (copy)" });
    await expect(copy).toHaveCount(1);

    // Search by name and by tool name.
    await page.getByTestId("designs-search").fill("copy");
    await expect(page.getByTestId("design-card")).toHaveCount(1);
    await page.getByTestId("designs-search").fill("blob gen");
    await expect(page.getByTestId("design-card")).toHaveCount(2);
    await page.getByTestId("designs-search").fill("nothing like this");
    await expect(page.getByTestId("design-card")).toHaveCount(0);
    await page.getByTestId("designs-search").fill("");

    // Delete: cancel first, then confirm, then undo, then delete for good.
    await copy.getByTestId("design-delete").click();
    const dialog = page.getByRole("dialog", { name: "Delete design?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("design-card")).toHaveCount(2);
    await copy.getByTestId("design-delete").click();
    await dialog.getByTestId("delete-confirm").click();
    await expect(page.getByTestId("design-card")).toHaveCount(1);
    await page.getByTestId("designs-undo").click();
    await expect(page.getByTestId("design-card")).toHaveCount(2);
    await copy.getByTestId("design-delete").click();
    await dialog.getByTestId("delete-confirm").click();
    await expect(page.getByTestId("design-card")).toHaveCount(1);

    // Open in the editor.
    await page.getByTestId("design-card").getByTestId("design-open").click();
    await expect(page).toHaveURL(new RegExp(`/en/tools/blob-generator#design=${id}$`));
    await expect(page.getByTestId("design-name")).toHaveValue("Renamed blob");
    await expect.poll(() => previewSrc(page)).toBe(savedSrc);
  });

  test("restores the draft on return and can start over", async ({ page }) => {
    await openEditor(page);
    const start = await previewSrc(page);
    const changed = await newVariant(page);
    // The draft is written after a short pause.
    await page.waitForTimeout(1500);

    await openEditor(page);
    await expect(page.getByTestId("design-notice")).toContainText("Your last draft is back.");
    await expect.poll(() => previewSrc(page)).toBe(changed);

    await page.getByRole("button", { name: "Start over" }).click();
    await expect.poll(() => previewSrc(page)).toBe(start);
    await page.waitForTimeout(1500);
    await openEditor(page);
    await expect(page.getByTestId("design-notice")).toHaveCount(0);
    await expect.poll(() => previewSrc(page)).toBe(start);
  });

  test("a share link wins over the draft, which is only offered", async ({ page }) => {
    await openEditor(page);
    const draft = await newVariant(page);
    await page.waitForTimeout(1500);

    const blob = registry.get("blob");
    if (!blob) throw new Error("blob tool missing");
    const shared = designToHash({
      toolId: "blob",
      params: blob.defaults,
      seed: 4242,
      size: { width: 1080, height: 1080 },
    });
    if (!shared.ok) throw new Error(shared.error);
    // A fresh page load, as when following a link.
    await page.goto(MY_DESIGNS);
    await openEditor(page, `${EDITOR}${shared.value}`);
    await expect(page.getByTestId("design-notice")).toContainText(
      "You still have an unsaved draft here.",
    );
    const fromLink = await previewSrc(page);
    expect(fromLink).not.toBe(draft);

    await page.getByRole("button", { name: "Restore" }).click();
    await expect.poll(() => previewSrc(page)).toBe(draft);
    await expect(page.getByTestId("design-notice")).toHaveCount(0);
  });

  test("tells the user when the browser cannot store anything", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    await page.goto(MY_DESIGNS);
    await expect(page.getByTestId("designs-unavailable")).toBeVisible();

    await page.goto(EDITOR);
    await expect(page.getByTestId("save-design")).toBeEnabled();
    await page.getByTestId("save-design").click();
    await expect(page.getByTestId("design-notice")).toContainText("does not let Musterli save");
  });
});

test.describe("moving designs with a file", () => {
  test("exports all designs and imports them into a fresh browser", async ({ page, browser }) => {
    await openEditor(page);
    const src = await newVariant(page);
    await saveDesign(page, "Travelling blob");
    await page.goto(MY_DESIGNS);
    await expect(page.getByTestId("design-card")).toHaveCount(1);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("designs-export").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^musterli-designs-v1-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    const text = await readFile(path, "utf8");
    const file = JSON.parse(text) as { format: string; version: number; designs: unknown[] };
    expect(file).toMatchObject({ format: "motivo-designs", version: 1 });
    expect(file.designs).toHaveLength(1);
    await expect(page.getByTestId("designs-message")).toContainText("Saved 1 design to a file.");

    // Another browser profile: empty until the file comes in.
    const fresh = await browser.newContext();
    const other = await fresh.newPage();
    await other.goto(MY_DESIGNS);
    await expect(other.getByTestId("designs-empty")).toBeVisible();
    await other.getByTestId("designs-file").setInputFiles(path);
    await expect(other.getByTestId("designs-message")).toContainText("Imported 1 design.");
    const card = other.getByTestId("design-card");
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("design-name")).toHaveText("Travelling blob");
    // The thumbnail is drawn again after the import.
    await expect(card.getByTestId("design-thumbnail")).toBeVisible();

    // Importing the same file again adds nothing.
    await other.getByTestId("designs-file").setInputFiles(path);
    await expect(other.getByTestId("designs-message")).toContainText("1 design was already here.");
    await expect(card).toHaveCount(1);

    await card.getByTestId("design-open").click();
    await expect(other.getByTestId("design-name")).toHaveValue("Travelling blob");
    expect(await previewSrc(other)).toBe(src);
    await fresh.close();
  });

  test("refuses hostile and broken files with clear messages", async ({ page }) => {
    await page.goto(MY_DESIGNS);
    await expect(page.getByTestId("designs-empty")).toBeVisible();
    const input = page.getByTestId("designs-file");
    const message = page.getByTestId("designs-message");

    await input.setInputFiles({
      name: "evil.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '{"format":"motivo-designs","version":1,"designs":[{"__proto__":{"isAdmin":true}}]}',
      ),
    });
    await expect(message).toContainText("forbidden entries");
    expect(await page.evaluate(() => ({}) as Record<string, unknown>)).not.toHaveProperty(
      "isAdmin",
    );

    await input.setInputFiles({
      name: "other.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hello":"world"}'),
    });
    await expect(message).toContainText("not a Musterli designs file");

    await input.setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
    await expect(message).toContainText("damaged or not JSON");

    // A hostile SVG upload is sanitised again; an unknown tool is skipped with a reason.
    const seamless = registry.get("seamless-patterns");
    if (!seamless) throw new Error("seamless tool missing");
    const hostile =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><rect width="10" height="10"/></svg>';
    const design = (over: Record<string, unknown>) => ({
      id: "x1",
      toolId: "seamless-patterns",
      toolVersion: seamless.version,
      name: "Imported upload",
      seed: 1,
      size: { width: 1080, height: 1080 },
      params: {
        ...seamless.defaults,
        upload: { kind: "svg", svg: hostile, width: 10, height: 10, name: "x.svg" },
      },
      createdAt: 1,
      updatedAt: 2,
      ...over,
    });
    await input.setInputFiles({
      name: "mixed.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "motivo-designs",
          version: 1,
          designs: [design({ toolId: "no-such-tool", name: "Ghost" }), design({})],
        }),
      ),
    });
    await expect(message).toContainText("Imported 1 design.");
    await expect(message).toContainText("Ghost: unknown tool");
    await expect(page.getByTestId("design-card")).toHaveCount(1);
    const stored = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const open = indexedDB.open("motivo");
          open.onerror = () => reject(new Error("open failed"));
          open.onsuccess = () => {
            const all = open.result
              .transaction("design-params")
              .objectStore("design-params")
              .getAll();
            all.onsuccess = () => resolve(JSON.stringify(all.result));
            all.onerror = () => reject(new Error("read failed"));
          };
        }),
    );
    expect(stored).toContain("<rect");
    expect(stored).not.toMatch(/script|onload/i);
  });
});

test.describe("my designs page", () => {
  test("German slug, noindex and not in the sitemap", async ({ page, request }) => {
    const response = await page.goto("/de/meine-designs");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Meine Designs");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByTestId("designs-empty")).toContainText("Noch keine Designs");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).not.toMatch(/meine-designs|my-designs/);
    // The English slug under /de redirects to the German one.
    await page.goto("/de/my-designs");
    await expect(page).toHaveURL(/\/de\/meine-designs$/);
  });

  // M5b-AP01: WebGL and image-effect designs get a thumbnail too, drawn by
  // their workers: when saving in the editor and again after an import.
  for (const toolId of ["shader-gradient", "halftone"] as const) {
    test(`shows a thumbnail of a ${toolId} design`, async ({ page, browser }) => {
      await page.goto(`/en/tools/${toolSlug(toolId, "en")}`);
      await expect(page.getByTestId("save-design")).toBeEnabled();
      // The worker preview is on screen before saving.
      await expect(page.getByTestId("preview").locator("canvas")).toBeVisible();
      await saveDesign(page, `Thumb ${toolId}`);
      await page.goto(MY_DESIGNS);
      const thumb = page.getByTestId("design-card").getByTestId("design-thumbnail");
      await expect(thumb).toHaveAttribute("src", /^data:image\/(webp|png);base64,/);
      expect(await thumbnailContrast(page)).toBeGreaterThan(8);

      // Imported without thumbnails: My Designs draws them again.
      const downloadPromise = page.waitForEvent("download");
      await page.getByTestId("designs-export").click();
      const path = await (await downloadPromise).path();
      const fresh = await browser.newContext();
      const other = await fresh.newPage();
      await other.goto(MY_DESIGNS);
      await other.getByTestId("designs-file").setInputFiles(path);
      await expect(other.getByTestId("designs-message")).toContainText("Imported 1 design.");
      await expect(other.getByTestId("design-thumbnail")).toHaveAttribute(
        "src",
        /^data:image\/(webp|png);base64,/,
        { timeout: 20_000 },
      );
      expect(await thumbnailContrast(other)).toBeGreaterThan(8);
      await fresh.close();
    });
  }

  for (const width of [375, 768, 1280]) {
    test(`fits ${width} px without horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openEditor(page);
      await saveDesign(page, "A design with a rather long name to check the layout");
      await page.goto(MY_DESIGNS);
      await expect(page.getByTestId("design-card")).toHaveCount(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`has no axe violations with and without designs (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(MY_DESIGNS);
      await expect(page.getByTestId("designs-empty")).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

      await openEditor(page);
      await saveDesign(page, "Axe check");
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);

      await page.goto(MY_DESIGNS);
      await expect(page.getByTestId("design-thumbnail")).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
      await page.getByTestId("design-delete").click();
      await expect(page.getByRole("dialog", { name: "Delete design?" })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([]);
    });
  }
});
