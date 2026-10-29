import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { LONG_TASKS } from "./support/long-tasks";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const LANDING = "/en/social-media-editor";
const EDITOR = "/en/social-media-editor/edit";

const stage = (page: Page) => page.getByTestId("stage");

/** `updatedAt` of the only saved social design (0 while there is none). */
async function savedAt(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const read = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await read(indexedDB.open("motivo"));
    const rows = (await read(
      db.transaction("social-designs").objectStore("social-designs").getAll(),
    )) as { updatedAt: number }[];
    db.close();
    return Math.max(0, ...rows.map((r) => r.updatedAt));
  });
}

/** Opens the editor on a fresh scene and waits for Konva and the background. */
async function openEditor(page: Page) {
  await page.goto(EDITOR);
  await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
  await expect(stage(page)).toHaveAttribute("data-background", "ready");
}

/** The drawn stage (content layer) as a data URL. */
async function stagePixels(page: Page): Promise<string> {
  return stage(page)
    .locator("canvas")
    .first()
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
}

/** Width and height from a PNG header. */
function pngSize(file: Buffer): { width: number; height: number } {
  expect(file.readUInt32BE(0)).toBe(0x89504e47);
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

async function numberField(page: Page, testId: string): Promise<number> {
  return Number(await page.getByTestId(testId).inputValue());
}

/**
 * One run of the 20 MB pictures test in a fresh browser context: plants the
 * pictures in the draft, reloads, then edits, autosaves and saves twice
 * while long tasks are recorded. Returns their durations.
 */
async function longTasksOfBigPictures(browser: Browser): Promise<number[]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openEditor(page);
    const chars = await page.evaluate(async () => {
      const read = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const db = await read(indexedDB.open("motivo"));
      // The starter scene's draft (autosaved after 800 ms).
      let draft: { scene: { layers: unknown[]; format: { width: number } } } | undefined;
      for (let i = 0; i < 50 && !draft; i++) {
        draft = await read(
          db.transaction("social-drafts").objectStore("social-drafts").get("current"),
        );
        if (!draft) await new Promise((r) => setTimeout(r, 100));
      }
      if (!draft) throw new Error("no draft");
      const noise = async (seed: number, w: number, h: number) => {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d");
        const data = ctx.createImageData(w, h);
        let x = seed * 2654435761;
        for (let i = 0; i < data.data.length; i += 4) {
          x ^= x << 13;
          x ^= x >>> 17;
          x ^= x << 5;
          data.data[i] = x & 255;
          data.data[i + 1] = (x >>> 8) & 255;
          data.data[i + 2] = (x >>> 16) & 255;
          data.data[i + 3] = 255;
        }
        ctx.putImageData(data, 0, 0);
        const blob = await canvas.convertToBlob({ type: "image/png" });
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      };
      // Noise does not compress: pick the size that gives about 5 MB of data URI each.
      const probe = await noise(9, 500, 500);
      const k = Math.sqrt(5_000_000 / probe.length);
      const w = Math.round(500 * k * 1.2);
      const h = Math.round((500 * k) / 1.2);
      const hrefs = await Promise.all([1, 2, 3, 4].map((seed) => noise(seed, w, h)));
      const pictures = hrefs.map((href, i) => ({
        id: `big${i}`,
        name: `Noise ${i + 1}`,
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        x: 40 + i * 120,
        y: 40 + i * 120,
        width: 420,
        height: 300,
        groupId: null,
        constraints: { h: "start", v: "start", size: "short", bleed: false },
        kind: "image",
        image: { kind: "raster", href, width: w, height: h, name: `noise-${i}.png` },
        fit: "cover",
        cornerRadius: 0,
        placeholder: false,
      }));
      const scene = { ...draft.scene, layers: [...draft.scene.layers, ...pictures] };
      await read(
        db
          .transaction("social-drafts", "readwrite")
          .objectStore("social-drafts")
          .put({ ...draft, scene, updatedAt: Date.now() }),
      );
      db.close();
      return hrefs.reduce((sum, h) => sum + h.length, 0);
    });
    // About 20 MB of picture data.
    expect(chars).toBeGreaterThan(18_000_000);
    expect(chars).toBeLessThan(24_000_000); // SCENE_IMAGES_MAX_TOTAL_LENGTH

    await page.reload();
    await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
    await expect(stage(page)).toHaveAttribute("data-pictures", "4", { timeout: 30_000 });
    await expect(stage(page)).toHaveAttribute("data-background", "ready");
    await page.waitForTimeout(1500); // first paint and the reload's own work are done

    await page.evaluate(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__longTasks.push(Math.round(entry.duration));
      }).observe({ type: "longtask" });
    });
    await page
      .getByTestId("layer-row")
      .filter({ hasText: "Noise 4" })
      .getByTestId("layer-select")
      .click();
    for (let i = 0; i < 3; i++) {
      await stage(page).focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(1200);
    }
    // Save (a new design), edit, save over it, then the draft once more.
    await page.getByTestId("design-name").fill("Big pictures");
    await page.getByTestId("save").click();
    await expect(page.getByTestId("announcer")).toHaveText("“Big pictures” saved.", {
      timeout: 30_000,
    });
    await stage(page).focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(1200);
    const firstSave = await savedAt(page);
    await page.getByTestId("save").click();
    await expect.poll(() => savedAt(page), { timeout: 30_000 }).toBeGreaterThan(firstSave);
    await page.waitForTimeout(1200);

    const longTasks = await page.evaluate(
      () => (window as unknown as { __longTasks: number[] }).__longTasks,
    );
    // The saved design holds all four pictures.
    await page.goto("/en/my-designs");
    const card = page.getByTestId("social-design-card").filter({ hasText: "Big pictures" });
    await card.getByTestId("social-design-open").click();
    await expect(stage(page)).toHaveAttribute("data-pictures", "4", { timeout: 30_000 });
    return longTasks;
  } finally {
    await context.close();
  }
}

test.describe("social media editor", () => {
  test("landing page links to the editor and does not load Konva", async ({ page }) => {
    await page.goto(LANDING);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Social media editor");
    await expect(page.getByTestId("social-formats").locator("li")).toHaveCount(13);
    const resources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((e) => e.name),
    );
    expect(resources.filter((name) => /konva/i.test(name))).toEqual([]);
    await page.getByTestId("social-cta").click();
    await expect(page).toHaveURL(/\/en\/social-media-editor\/edit$/);
    await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
  });

  test("designs, resizes, exports and saves a post", async ({ page }) => {
    await openEditor(page);

    // Background: another tool, then a new variant with Space.
    await page.getByTestId("background-tool").selectOption("blob");
    await expect(stage(page)).toHaveAttribute("data-background", "ready");
    const before = await stagePixels(page);
    await stage(page).focus();
    await page.keyboard.press("Space");
    await expect(stage(page)).toHaveAttribute("data-background", "ready");
    await expect.poll(() => stagePixels(page)).not.toBe(before);

    // Text and a shape.
    await page.getByTestId("add-text").click();
    await page.getByTestId("text-content").fill("Launch day");
    await page.getByTestId("add-rect").click();
    await expect(page.getByTestId("layer-row")).toHaveCount(4);

    // Move by keyboard: 1 px, then 10 px with Shift; undo puts it back.
    const x0 = await numberField(page, "field-x");
    await stage(page).focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => numberField(page, "field-x")).toBe(x0 + 1);
    await page.keyboard.press("Shift+ArrowDown");
    await page.waitForTimeout(600); // a new undo step after the merge window
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(() => numberField(page, "field-x")).toBe(x0 + 11);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => numberField(page, "field-x")).toBe(x0 + 1);
    await page.getByTestId("redo").click();
    await expect.poll(() => numberField(page, "field-x")).toBe(x0 + 11);

    // Magic Resize to a story: every text still fits, nothing leaves the canvas.
    await page.getByTestId("format").selectOption("story");
    await expect(stage(page)).toHaveAttribute("data-format", "1080x1920");
    await expect(stage(page)).toHaveAttribute("data-fit-problems", "0");
    await page
      .getByTestId("layer-row")
      .filter({ hasText: "Launch day" })
      .getByTestId("layer-select")
      .click();
    const tx = await numberField(page, "field-x");
    const tw = await numberField(page, "field-width");
    expect(tx).toBeGreaterThanOrEqual(0);
    expect(tx + tw).toBeLessThanOrEqual(1080);
    await expect(stage(page)).toHaveAttribute("data-background", "ready");

    // PNG export at the format size, then at 2x.
    const download = page.waitForEvent("download");
    await page.getByTestId("export").click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("musterli-social-1080x1920.png");
    expect(pngSize(await readFile((await file.path()) ?? ""))).toEqual({
      width: 1080,
      height: 1920,
    });
    await page.getByTestId("export-scale").selectOption("2");
    const download2 = page.waitForEvent("download");
    await page.getByTestId("export").click();
    const file2 = await download2;
    expect(pngSize(await readFile((await file2.path()) ?? ""))).toEqual({
      width: 2160,
      height: 3840,
    });

    // Save, then find it in "My designs".
    await page.getByTestId("design-name").fill("Launch post");
    await page.getByTestId("save").click();
    await expect(page.getByTestId("announcer")).toHaveText("“Launch post” saved.");
    await expect(page).toHaveURL(/#design=[A-Za-z0-9_-]+$/);

    await page.goto("/en/my-designs");
    const card = page.getByTestId("social-design-card").filter({ hasText: "Launch post" });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("social-design-thumbnail")).toBeVisible();
    await expect(card).toContainText("1080 × 1920");

    // Opening it brings the scene back.
    await card.getByTestId("social-design-open").click();
    await expect(page.getByTestId("social-editor")).toHaveAttribute("data-ready", "true");
    await expect(stage(page)).toHaveAttribute("data-format", "1080x1920");
    await expect(page.getByTestId("design-name")).toHaveValue("Launch post");
  });

  /**
   * A scene with about 20 MB of pictures (four noise PNGs that do not
   * compress, as data URIs): editing, the autosave draft, saving and saving
   * again never block the main thread. Scenes from the editor are checked
   * without running the data URI patterns over the pictures again
   * (`parseEditedScene`), saving over a design never reads its old scene,
   * the draft after a save is written in a task of its own, and pictures
   * reach Konva as `ImageBitmap`s (an `<img>` with a data URI costs about
   * 12 ms per picture and redraw, since Konva reads its `src`). The draft
   * is planted in IndexedDB and opened by a reload, so the
   * measuring starts with the pictures in place.
   *
   * Stored scenes keep the pictures as Blobs (`scene-pictures.ts` in
   * `@musterli/storage`): copying 20 MB of strings into IndexedDB took 50 ms
   * and more per autosave on CI. Each Blob is made once, in 1 MB chunks
   * (the first autosave after the reload makes them). As in the 4K
   * screenshot test, the best of up to three runs counts: other processes
   * on the machine stretch such tasks over 50 ms, a real regression fails
   * all three.
   */
  test(
    "edits, autosaves and saves 20 MB of pictures without long tasks",
    LONG_TASKS,
    async ({ browser, browserName }, testInfo) => {
      test.skip(browserName !== "chromium", "Long Tasks API is Chromium-only");
      test.skip(
        testInfo.config.workers > 1,
        "needs an idle CPU: runs in CI (1 worker), pnpm test:e2e:chromium or --workers=1",
      );
      test.setTimeout(300_000);
      let best = Number.POSITIVE_INFINITY;
      for (let run = 1; run <= 3 && best > 50; run++) {
        const longTasks = await longTasksOfBigPictures(browser);
        const worst = Math.max(0, ...longTasks);
        best = Math.min(best, worst);
        testInfo.annotations.push({
          type: "long-tasks",
          description: `run ${run}: ${longTasks.length > 0 ? `${longTasks.join(", ")} ms` : "none over 50 ms"}`,
        });
      }
      expect(best).toBeLessThanOrEqual(50);
    },
  );

  test("works at 768 px with the large screen hint", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 });
    await openEditor(page);
    await expect(page.getByTestId("small-screen-hint")).toBeVisible();
    await expect(stage(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`has no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1280, height: 900 });
      await openEditor(page);
      await page.getByTestId("add-text").click();
      const editor = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(editor.violations).toEqual([]);
      await page.goto(LANDING);
      const landing = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(landing.violations).toEqual([]);
    });
  }
});
