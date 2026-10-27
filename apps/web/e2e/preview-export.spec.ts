/**
 * M1-AP12: "preview == PNG export". For every tool (defaults plus one preset)
 * the editor preview is screenshotted at 100 % and compared pixel by pixel
 * with the 1× PNG export of the same size, inside the same browser run. No
 * golden images: each browser is compared against itself, so the test
 * catches a preview and an export that drift apart (two render paths,
 * browser-specific SVG/CSS handling) without per-browser baselines.
 */
import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

/** Small enough to show at 100 % in the default 1280 × 720 viewport. */
const SIZE = { width: 480, height: 320 };

/** A pixel differs when any channel differs by more than this (0 to 255). */
const CHANNEL_TOLERANCE = 24;
/** Share of differing pixels allowed (anti-aliased edges, gradient dithering). */
const MAX_DIFF_RATIO = 0.01;
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
}

const CASES: Case[] = [
  { toolId: "css-gradient", css: true },
  { toolId: "css-gradient", preset: "Ember", css: true },
  // Conic: the export SVG approximates the CSS conic gradient with 2° wedges
  // (SVG has no conic paint), so every pixel is slightly off, none visibly
  // (no pixel beyond CHANNEL_TOLERANCE; Chromium mean about 2.2).
  { toolId: "css-gradient", preset: "Prism", css: true, maxMeanDiff: 4 },
  { toolId: "blob" },
  { toolId: "blob", preset: "Lava" },
  { toolId: "svg-waves" },
  { toolId: "svg-waves", preset: "Dunes" },
  { toolId: "polka-dots" },
  { toolId: "polka-dots", preset: "Retro" },
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

interface DiffResult {
  width: number;
  height: number;
  diffRatio: number;
  meanDiff: number;
  /** Diff image (red = differing pixel) as a PNG data URL, for the report. */
  diffPng: string;
}

/** Decodes both PNGs in the page and compares them pixel by pixel. */
async function comparePngs(page: Page, a: Buffer, b: Buffer): Promise<DiffResult> {
  return page.evaluate(
    async ({ a64, b64, tolerance }) => {
      const decode = async (b64: string) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [x, y] = await Promise.all([decode(a64), decode(b64)]);
      if (x.width !== y.width || x.height !== y.height) {
        throw new Error(`size mismatch: ${x.width}x${x.height} vs ${y.width}x${y.height}`);
      }
      const out = new ImageData(x.width, x.height);
      let differing = 0;
      let sum = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        let max = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs((x.data[i + c] ?? 0) - (y.data[i + c] ?? 0));
          sum += d;
          if (d > max) max = d;
        }
        const bad = max > tolerance;
        if (bad) differing++;
        out.data[i] = bad ? 255 : (x.data[i] ?? 0) / 4;
        out.data[i + 1] = bad ? 0 : (x.data[i + 1] ?? 0) / 4;
        out.data[i + 2] = bad ? 0 : (x.data[i + 2] ?? 0) / 4;
        out.data[i + 3] = 255;
      }
      const canvas = document.createElement("canvas");
      canvas.width = x.width;
      canvas.height = x.height;
      canvas.getContext("2d")?.putImageData(out, 0, 0);
      const pixels = x.width * x.height;
      return {
        width: x.width,
        height: x.height,
        diffRatio: differing / pixels,
        meanDiff: sum / (pixels * 3),
        diffPng: canvas.toDataURL("image/png"),
      };
    },
    { a64: a.toString("base64"), b64: b.toString("base64"), tolerance: CHANNEL_TOLERANCE },
  );
}

test.describe("preview equals PNG export", () => {
  for (const c of CASES) {
    const label = `${c.toolId} (${c.preset ?? "defaults"})`;

    test(label, async ({ page }, testInfo) => {
      await page.goto(`/en/tools/${c.toolId}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Share" })).toBeEnabled();

      if (c.preset) {
        const preset = page.getByRole("button", { name: c.preset, exact: true });
        await preset.click();
        await expect(preset).toHaveAttribute("aria-pressed", "true");
      }

      const width = page.getByLabel("Width", { exact: true });
      await width.fill(String(SIZE.width));
      await width.press("Enter");
      const height = page.getByLabel("Height", { exact: true });
      await height.fill(String(SIZE.height));
      await height.press("Enter");
      await expect(
        page.getByRole("img", { name: new RegExp(`${SIZE.width} × ${SIZE.height} px`) }),
      ).toBeVisible();

      // 100 % zoom: one CSS pixel per design pixel.
      await page.locator("body").press("1");
      await expect(page.getByRole("button", { name: "100%" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

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

      const result = await comparePngs(page, preview, exported);
      await testInfo.attach("preview.png", { body: preview, contentType: "image/png" });
      await testInfo.attach("export.png", { body: exported, contentType: "image/png" });
      await testInfo.attach("diff.png", {
        body: Buffer.from(result.diffPng.split(",")[1] ?? "", "base64"),
        contentType: "image/png",
      });
      testInfo.annotations.push({
        type: "pixel-diff",
        description: `${(result.diffRatio * 100).toFixed(3)} % pixels differ, mean ${result.meanDiff.toFixed(3)}`,
      });

      expect({ width: result.width, height: result.height }).toEqual(SIZE);
      expect(result.diffRatio, "share of pixels that differ").toBeLessThanOrEqual(MAX_DIFF_RATIO);
      expect(result.meanDiff, "mean channel difference").toBeLessThanOrEqual(
        c.maxMeanDiff ?? MAX_MEAN_DIFF,
      );
    });
  }
});
