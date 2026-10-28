/**
 * M1-AP12: "preview == PNG export". For every tool (defaults plus one preset)
 * the editor preview is screenshotted at 100 % and compared pixel by pixel
 * with the 1× PNG export of the same size, inside the same browser run. No
 * golden images: each browser is compared against itself, so the test
 * catches a preview and an export that drift apart (two render paths,
 * browser-specific SVG/CSS handling) without per-browser baselines.
 */
import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";

import { comparePngs } from "./support/compare";
import { areaAverageRgb, decodePng, encodeRgbPng } from "./support/png";

/** Small enough to show at 100 % in the default 1280 × 720 viewport. */
const SIZE = { width: 480, height: 320 };

/** A pixel differs when any channel differs by more than this (0 to 255). */
const CHANNEL_TOLERANCE = 24;
/** Share of differing pixels allowed (anti-aliased edges, gradient dithering). */
const MAX_DIFF_RATIO = 0.01;
/**
 * WebKit anti-aliases an SVG shown by <img> differently from the same SVG
 * decoded and drawn onto the export canvas, so edges of many small shapes
 * differ (CI: Polka Dots 3.1 % and 1.6 % of pixels, every other case under
 * 1 %). The edge-tolerant check below still has to pass, so a real
 * difference (wrong colour, missing or moved shape) is not hidden by this.
 */
const MAX_DIFF_RATIO_BY_BROWSER: Partial<Record<string, number>> = { webkit: 0.05 };
/**
 * Share of pixels allowed to differ even after looking at the 3 × 3
 * neighbourhood in the other image (see `explainedBy`). Anti-aliasing and
 * one-pixel shifts pass this check; changed colours, missing or displaced
 * shapes do not. 0.02 % is about 30 pixels at 480 × 320, less than one
 * missing 12 px dot (the self-check below proves that).
 */
const MAX_STRAY_RATIO = 0.0002;
/** Mean absolute channel difference allowed over the whole image (0 to 255). */
const MAX_MEAN_DIFF = 2;

interface Case {
  toolId: string;
  /** Preset button name; undefined = defaults. Only presets with an opaque background. */
  preset?: string;
  /** CSS tools render the preview as a styled box instead of an <img>. */
  css?: boolean;
  /** Overrides `MAX_MEAN_DIFF`, with the reason in a comment. */
  maxMeanDiff?: number;
  /** Overrides `MAX_STRAY_RATIO` per browser, with the reason in a comment. */
  maxStrayRatio?: Partial<Record<string, number>>;
  /** Animated CSS: emulate reduced motion, so the preview shows the calm frame 0. */
  reducedMotion?: boolean;
}

const CASES: Case[] = [
  { toolId: "css-gradient", css: true },
  { toolId: "css-gradient", preset: "Ember", css: true },
  // Conic: the export SVG approximates the CSS conic gradient with 2° wedges
  // (SVG has no conic paint), so every pixel is slightly off, none visibly
  // (no pixel beyond CHANNEL_TOLERANCE; Chromium mean about 2.2).
  { toolId: "css-gradient", preset: "Prism", css: true, maxMeanDiff: 4 },
  // Stacked pattern layers (M2-AP04): one and three layers, partly translucent.
  { toolId: "css-patterns", css: true },
  { toolId: "css-patterns", preset: "Highland", css: true },
  { toolId: "blob" },
  { toolId: "blob", preset: "Lava" },
  { toolId: "svg-waves" },
  { toolId: "svg-waves", preset: "Dunes" },
  { toolId: "polka-dots" },
  { toolId: "polka-dots", preset: "Retro" },
  // M3-AP12: SVG <pattern> fills (brick by default, mirror with flips).
  { toolId: "seamless-patterns" },
  { toolId: "seamless-patterns", preset: "Botanical" },
  // M4-AP02: tile fills plus shapes in a nested grid, and outlines with free rotation.
  { toolId: "geometric-patterns" },
  // WebKit anti-aliases hundreds of small rotated shapes (Mosaic) and thin
  // translucent strokes (Blueprint) differently in <img> and on the export
  // canvas (CI: 0.025 % and 0.093 % stray pixels, about 38 and 143 at
  // 480 × 320). Only WebKit gets the larger budget; Chromium and Firefox
  // keep the default, so a missing or moved shape still fails there.
  { toolId: "geometric-patterns", preset: "Mosaic", maxStrayRatio: { webkit: 0.0004 } },
  { toolId: "geometric-patterns", preset: "Blueprint", maxStrayRatio: { webkit: 0.0012 } },
  // M3-AP08: layered blobs (partly translucent, gradients), many thin strokes, charts.
  { toolId: "blob-composition" },
  { toolId: "blob-composition", preset: "Dusk" },
  { toolId: "doodles" },
  { toolId: "doodles", preset: "Chalkboard" },
  { toolId: "svg-charts" },
  { toolId: "svg-charts", preset: "Quarterly" },
  // M3-AP07 gradients: with and without the grain tile; mesh with its
  // Gaussian blur filter, blurry and striped without filters.
  { toolId: "mesh-gradient" },
  { toolId: "mesh-gradient", preset: "Meadow" },
  { toolId: "blurry-gradient" },
  { toolId: "blurry-gradient", preset: "Sorbet" },
  { toolId: "striped-gradient" },
  { toolId: "striped-gradient", preset: "Dusk" },
  // M4-AP05: SVG text and glyphs; real CSS box-shadow vs. its SVG twin
  // (Gaussian blur per layer, outer on a gradient, inner clipped, dots stage).
  { toolId: "contrast-checker" },
  { toolId: "contrast-checker", preset: "Traffic light" },
  { toolId: "css-shadow", css: true },
  { toolId: "css-shadow", preset: "Inner", css: true },
  { toolId: "css-shadow", preset: "Floating", css: true },
  // M4b-AP03: hundreds of thin, crossing strokes (blend), spirograph loops coloured along the lines.
  { toolId: "guilloche" },
  { toolId: "guilloche", preset: "Spirograph" },
  // M4b-AP01: hundreds of thin contour lines and filled even-odd bands; flow
  // lines as strokes and as tapered fills.
  { toolId: "topo-lines" },
  { toolId: "topo-lines", preset: "Lagoon" },
  { toolId: "flow-field" },
  { toolId: "flow-field", preset: "Whirlpool" },
  // M4b-AP02: hundreds of abutting triangles (seam strokes), Voronoi cells
  // with gaps and rounded corners, Terrazzo as an SVG pattern with grain.
  { toolId: "low-poly" },
  { toolId: "low-poly", preset: "Mosaic" },
  { toolId: "terrazzo" },
  { toolId: "terrazzo", preset: "Pebbles" },
  // M4b-AP04: nested backdrop SVG of another tool, layered blurred shadows,
  // clipped placeholder, window bar with text; solid background with border.
  { toolId: "screenshot-beautifier", css: true },
  { toolId: "screenshot-beautifier", preset: "Paper", css: true },
  // M4b-AP07: responsive website mockup (four devices, placeholder sites, per-device shadows).
  { toolId: "screenshot-beautifier", preset: "Responsive", css: true },
  // M4c-AP03: animated CSS (calm state) against its SVG twin: pan on an
  // oversized background, conic wedges (as Prism above), @property colours,
  // soft radial blobs in boxes.
  { toolId: "animated-gradient", css: true, reducedMotion: true },
  { toolId: "animated-gradient", preset: "Radar", css: true, reducedMotion: true, maxMeanDiff: 4 },
  { toolId: "animated-gradient", preset: "Chameleon", css: true, reducedMotion: true },
  { toolId: "animated-gradient", preset: "Lava lamp", css: true, reducedMotion: true },
];

// Compare device pixels 1:1 (Desktop Safari defaults to a 2× display).
test.use({ deviceScaleFactor: 1 });

/** The motif inside the preview (img for SVG tools, the outer styled box for CSS tools). */
const motif = (page: Page, css: boolean): Locator =>
  css
    ? page.getByTestId("preview").locator(":scope > div[aria-hidden='true']")
    : page.getByTestId("preview").locator("img");

async function choose(dialog: Locator, name: string) {
  const radio = dialog.getByRole("radio", { name, exact: true });
  const id = await radio.getAttribute("id");
  await dialog.locator(`label[for="${id}"]`).click();
  await expect(radio).toBeChecked();
}

test.describe("pixel comparison self-check", () => {
  /** Draws dots on a canvas in the page and returns the PNG. */
  async function dots(
    page: Page,
    o: { offset?: number; skip?: number; shift?: number; aliased?: boolean },
  ): Promise<Buffer> {
    const url = await page.evaluate(
      ({ size, offset, skip, shift, aliased }) => {
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.fillStyle = `rgb(${253 - shift}, 240, 213)`;
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.fillStyle = "#c1121f";
        let n = 0;
        for (let y = 16; y < size.height; y += 26) {
          for (let x = 16; x < size.width; x += 26) {
            if (n++ === skip) continue;
            if (aliased) ctx.fillRect(Math.round(x - 6), Math.round(y - 6), 12, 12);
            else {
              ctx.beginPath();
              ctx.arc(x + offset, y + offset, 6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        return canvas.toDataURL("image/png");
      },
      {
        size: SIZE,
        offset: o.offset ?? 0,
        skip: o.skip ?? -1,
        shift: o.shift ?? 0,
        aliased: o.aliased ?? false,
      },
    );
    return Buffer.from(url.split(",")[1] ?? "", "base64");
  }

  test("tolerates sub-pixel edges but flags missing shapes and colour shifts", async ({ page }) => {
    await page.goto("/en");
    const base = await dots(page, {});
    const shifted = await comparePngs(
      page,
      base,
      await dots(page, { offset: 0.5 }),
      CHANNEL_TOLERANCE,
    );
    expect(shifted.diffRatio).toBeGreaterThan(0);
    expect(shifted.strayRatio).toBeLessThanOrEqual(MAX_STRAY_RATIO);

    const missing = await comparePngs(
      page,
      base,
      await dots(page, { skip: 40 }),
      CHANNEL_TOLERANCE,
    );
    expect(missing.strayRatio).toBeGreaterThan(MAX_STRAY_RATIO);

    const recoloured = await comparePngs(
      page,
      base,
      await dots(page, { shift: 12 }),
      CHANNEL_TOLERANCE,
    );
    expect(recoloured.meanDiffOffEdges).toBeGreaterThan(MAX_MEAN_DIFF);
  });
});

/**
 * Opens the tool, sets the design size, screenshots the preview at 100 %,
 * exports a 1× PNG of the same size and compares the two pixel by pixel.
 */
async function expectPreviewEqualsExport(
  page: Page,
  browserName: string,
  testInfo: TestInfo,
  c: Case,
): Promise<void> {
  if (c.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/en/tools/${toolSlug(c.toolId, "en")}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();

  if (c.preset) {
    const preset = page.getByRole("button", { name: c.preset, exact: true });
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");
  }

  // One edge at a time, each confirmed by the preview label: the height
  // field commits with the width it last rendered with, so typing it
  // before the width commit re-rendered (slow WebKit on CI) would drop
  // the new width.
  const label = (w: number | string, h: number | string) =>
    page.getByRole("img", { name: new RegExp(`${w} × ${h} px`) });
  await expect(async () => {
    const width = page.getByLabel("Width", { exact: true });
    await width.fill(String(SIZE.width));
    await width.press("Enter");
    await expect(label(SIZE.width, "\\d+")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await expect(async () => {
    const height = page.getByLabel("Height", { exact: true });
    await height.fill(String(SIZE.height));
    await height.press("Enter");
    await expect(label(SIZE.width, SIZE.height)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });

  // 100 % zoom: one CSS pixel per design pixel.
  await page.locator("body").press("1");
  await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute("aria-pressed", "true");

  const shown = motif(page, Boolean(c.css));
  await expect(shown).toBeVisible();
  await expect(shown).toHaveCSS("width", `${SIZE.width}px`);
  if (!c.css) {
    // The <img> must be decoded before the screenshot.
    await expect
      .poll(() => shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
  }
  // Clip to whole pixels: the centred motif can sit at a fractional offset,
  // and an element screenshot would then round outward (one row too many).
  const box = await shown.boundingBox();
  if (!box) throw new Error("preview has no bounding box");
  const preview = await page.screenshot({
    animations: "disabled",
    scale: "css",
    clip: { x: Math.round(box.x), y: Math.round(box.y), ...SIZE },
  });

  const dialog = page.getByRole("dialog", { name: "Export" });
  await expect(async () => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await choose(dialog, "PNG");
  await choose(dialog, `1× (${SIZE.width} × ${SIZE.height})`);
  await expect(dialog.getByTestId("export-output-size")).toHaveText(
    `Result: ${SIZE.width} × ${SIZE.height} px.`,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download" }).click(),
  ]);
  const exported = await readFile(await download.path());

  const result = await comparePngs(page, preview, exported, CHANNEL_TOLERANCE);
  await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
  await testInfo.attach("export.png", { body: exported, contentType: "image/png" });
  await testInfo.attach("diff.png", {
    body: Buffer.from(result.diffPng.split(",")[1] ?? "", "base64"),
    contentType: "image/png",
  });
  testInfo.annotations.push({
    type: "pixel-diff",
    description: [
      `${(result.diffRatio * 100).toFixed(3)} % pixels differ`,
      `${(result.strayRatio * 100).toFixed(4)} % not explained by edges`,
      `mean ${result.meanDiff.toFixed(3)}`,
      `mean off edges ${result.meanDiffOffEdges.toFixed(3)}`,
    ].join(", "),
  });

  expect({ width: result.width, height: result.height }).toEqual(SIZE);
  expect(result.strayRatio, "share of pixels that differ beyond edges").toBeLessThanOrEqual(
    c.maxStrayRatio?.[browserName] ?? MAX_STRAY_RATIO,
  );
  expect(result.diffRatio, "share of pixels that differ").toBeLessThanOrEqual(
    MAX_DIFF_RATIO_BY_BROWSER[browserName] ?? MAX_DIFF_RATIO,
  );
  expect(result.meanDiffOffEdges, "mean channel difference off edges").toBeLessThanOrEqual(
    c.maxMeanDiff ?? MAX_MEAN_DIFF,
  );
}

test.describe("preview equals PNG export", () => {
  for (const c of CASES) {
    test(`${c.toolId} (${c.preset ?? "defaults"})`, async ({ page, browserName }, testInfo) => {
      await expectPreviewEqualsExport(page, browserName, testInfo, c);
    });
  }
});

/**
 * Exports larger than the canvas area limit (4096 x 4096, WebKit) are drawn
 * in strips and encoded by the streaming PNG encoder in the raster worker.
 * Here the limit is lowered in the page (test hook of the exporter) so a
 * 480 × 320 export takes the same path as an 8K export: strips of 64 rows.
 * The worker messages are recorded to prove the path, and the PNG must
 * still equal the preview (no seams between strips, same colours).
 */
test.describe("preview equals PNG export in strips (canvas area limit)", () => {
  const STRIP_ROWS = 64;
  const STRIP_CASES = CASES.filter(
    (c) =>
      (c.toolId === "polka-dots" && c.preset === "Retro") ||
      (c.toolId === "mesh-gradient" && c.preset === "Meadow") ||
      (c.toolId === "blob-composition" && c.preset === "Dusk"),
  );

  const AREA = SIZE.width * STRIP_ROWS;

  /**
   * Lowers the exporter's canvas area limit (its test hook) before any page
   * script runs, and records the kinds of messages posted to workers.
   */
  async function limitCanvasArea(page: Page, area: number) {
    await page.addInitScript(
      ({ area }) => {
        const w = window as unknown as Record<string, unknown>;
        w.__musterliMaxCanvasArea = area;
        const log: string[] = [];
        w.__rasterWorkerLog = log;
        const post = Worker.prototype.postMessage;
        Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
          const message = args[0] as { kind?: unknown; bitmap?: unknown } | null;
          if (message && typeof message === "object") {
            if (typeof message.kind === "string") log.push(message.kind);
            else if ("bitmap" in message) log.push("bitmap");
          }
          return (post as (...a: unknown[]) => void).apply(this, args);
        } as typeof Worker.prototype.postMessage;
      },
      { area },
    );
  }

  const workerLog = (page: Page) =>
    page.evaluate(() => (window as unknown as { __rasterWorkerLog: string[] }).__rasterWorkerLog);

  for (const c of STRIP_CASES) {
    test(`${c.toolId} (${c.preset ?? "defaults"})`, async ({ page, browserName }, testInfo) => {
      await limitCanvasArea(page, AREA);
      await expectPreviewEqualsExport(page, browserName, testInfo, c);
      expect(await workerLog(page)).toEqual([
        "strip-start",
        ...Array<string>(Math.ceil(SIZE.height / STRIP_ROWS)).fill("strip-rows"),
        "strip-end",
      ]);
    });
  }

  // JPG has no strip encoder: it keeps one canvas and checks probe pixels
  // against single-pixel draws. Real renderings must pass that check.
  test("JPG above the limit keeps one canvas and passes the probe check", async ({ page }) => {
    await limitCanvasArea(page, AREA);
    await page.goto(`/en/tools/${toolSlug("polka-dots", "en")}`);
    await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
    const preset = page.getByRole("button", { name: "Retro", exact: true });
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");

    const dialog = page.getByRole("dialog", { name: "Export" });
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    await choose(dialog, "JPG");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.jpg$/);
    const file = await readFile(await download.path());
    expect([...file.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    await expect(dialog.getByRole("alert")).toHaveText("");
    expect(await workerLog(page)).not.toContain("strip-start");
  });
});

/**
 * Large exports of blurred motifs (M3-AP07 follow-up): browsers clamp the
 * standard deviation of `feGaussianBlur` in output pixels (Chromium about
 * 520 px), so a 4× export of a strong blur used to come out sharper than the
 * preview. The mesh gradient now renders large blurs as an upscaled raster
 * field. The 8K export, scaled down to the preview size, must match the
 * preview (Meadow has no grain, which scaling down would average away).
 */
test.describe("large export equals the preview", () => {
  const DESIGN = { width: 1920, height: 1080 };
  /** Mean channel difference allowed (the clamped filter gave about 3.2 in Chromium). */
  const MAX_MEAN = 1.5;
  /** Largest single channel difference allowed (smooth content, no edges). */
  const MAX_CHANNEL = 8;

  test("mesh-gradient (Meadow) at 8K", async ({ page }, testInfo) => {
    test.slow();
    await page.goto(`/en/tools/${toolSlug("mesh-gradient", "en")}`);
    await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();
    const preset = page.getByRole("button", { name: "Meadow", exact: true });
    await preset.click();
    await expect(preset).toHaveAttribute("aria-pressed", "true");

    const label = (w: number | string, h: number | string) =>
      page.getByRole("img", { name: new RegExp(`${w} × ${h} px`) });
    await expect(async () => {
      const width = page.getByLabel("Width", { exact: true });
      await width.fill(String(DESIGN.width));
      await width.press("Enter");
      await expect(label(DESIGN.width, "\\d+")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
    await expect(async () => {
      const height = page.getByLabel("Height", { exact: true });
      await height.fill(String(DESIGN.height));
      await height.press("Enter");
      await expect(label(DESIGN.width, DESIGN.height)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });

    const shown = motif(page, false);
    await expect(shown).toBeVisible();
    await expect
      .poll(() => shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
    const box = await shown.boundingBox();
    if (!box) throw new Error("preview has no bounding box");
    // Whole pixels strictly inside the (possibly fractional) preview box.
    const clip = {
      x: Math.ceil(box.x),
      y: Math.ceil(box.y),
      width: Math.floor(box.x + box.width) - Math.ceil(box.x),
      height: Math.floor(box.y + box.height) - Math.ceil(box.y),
    };
    const preview = await page.screenshot({ animations: "disabled", scale: "css", clip });

    const dialog = page.getByRole("dialog", { name: "Export" });
    await expect(async () => {
      await page.getByRole("button", { name: "Export", exact: true }).click();
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass();
    await choose(dialog, "PNG");
    await choose(dialog, "4× (7680 × 4320)");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      dialog.getByRole("button", { name: "Download" }).click(),
    ]);
    const exported = await readFile(await download.path());

    // Decoded and scaled in Node: browsers cannot all decode an 8K PNG into
    // one bitmap (WebKit's canvas and bitmap area limit is 4096 x 4096).
    const e = decodePng(exported);
    const p = decodePng(preview);
    // The part of the export that the clipped preview shows, scaled to the clip.
    const k = e.width / box.width;
    const a = areaAverageRgb(
      e,
      (clip.x - box.x) * k,
      (clip.y - box.y) * k,
      clip.width * k,
      clip.height * k,
      clip.width,
      clip.height,
    );
    const b = areaAverageRgb(p, 0, 0, p.width, p.height, clip.width, clip.height);
    let sum = 0;
    let max = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(Math.round(a[i] ?? 0) - Math.round(b[i] ?? 0));
      sum += d;
      if (d > max) max = d;
    }
    const result = { width: e.width, height: e.height, mean: sum / a.length, max };
    await testInfo.attach("export-scaled.png", {
      body: encodeRgbPng(a, clip.width, clip.height),
      contentType: "image/png",
    });
    await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
    testInfo.annotations.push({
      type: "pixel-diff",
      description: `mean ${result.mean.toFixed(3)}, max ${result.max}`,
    });
    expect({ width: result.width, height: result.height }).toEqual({ width: 7680, height: 4320 });
    expect(result.mean, "mean channel difference").toBeLessThanOrEqual(MAX_MEAN);
    expect(result.max, "largest channel difference").toBeLessThanOrEqual(MAX_CHANNEL);
  });
});
