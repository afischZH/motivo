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

import { toolSlug } from "../i18n/slugs";

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
  /** Share of differing pixels not explained by the other image's 3 × 3 neighbourhood (both directions). */
  strayRatio: number;
  meanDiff: number;
  /** Mean channel difference without the anti-aliasing-only pixels (catches global colour shifts). */
  meanDiffOffEdges: number;
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
      const w = x.width;
      const h = x.height;
      /**
       * Whether pixel (px, py) of `p` is explained by the 3 × 3 neighbourhood
       * of `q`: every channel lies within that neighbourhood's range (plus
       * tolerance). An anti-aliased edge pixel is a blend of its neighbours,
       * so it passes whether the other image is smoother, harder or shifted by
       * up to one pixel. Inside a missing, recoloured or moved shape the whole
       * neighbourhood has other colours, so those pixels fail.
       */
      const explainedBy = (p: ImageData, q: ImageData, px: number, py: number) => {
        const i = (py * w + px) * 4;
        for (let c = 0; c < 3; c++) {
          let lo = 255;
          let hi = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const qx = px + dx;
              const qy = py + dy;
              if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
              const v = q.data[(qy * w + qx) * 4 + c] ?? 0;
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          }
          const v = p.data[i + c] ?? 0;
          if (v < lo - tolerance || v > hi + tolerance) return false;
        }
        return true;
      };
      const out = new ImageData(w, h);
      let differing = 0;
      let stray = 0;
      let sum = 0;
      let edgeSum = 0;
      let edgePixels = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        let max = 0;
        let pixelSum = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs((x.data[i + c] ?? 0) - (y.data[i + c] ?? 0));
          pixelSum += d;
          if (d > max) max = d;
        }
        sum += pixelSum;
        const bad = max > tolerance;
        let isStray = false;
        if (bad) {
          differing++;
          const px = (i / 4) % w;
          const py = Math.floor(i / 4 / w);
          isStray = !explainedBy(x, y, px, py) || !explainedBy(y, x, px, py);
          if (isStray) stray++;
          else {
            edgeSum += pixelSum;
            edgePixels++;
          }
        }
        // Red: not explained by the neighbourhood; yellow: edge/anti-aliasing only.
        out.data[i] = bad ? 255 : (x.data[i] ?? 0) / 4;
        out.data[i + 1] = bad ? (isStray ? 0 : 200) : (x.data[i + 1] ?? 0) / 4;
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
        strayRatio: stray / pixels,
        meanDiff: sum / (pixels * 3),
        meanDiffOffEdges: (sum - edgeSum) / Math.max(1, (pixels - edgePixels) * 3),
        diffPng: canvas.toDataURL("image/png"),
      };
    },
    { a64: a.toString("base64"), b64: b.toString("base64"), tolerance: CHANNEL_TOLERANCE },
  );
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
    const shifted = await comparePngs(page, base, await dots(page, { offset: 0.5 }));
    expect(shifted.diffRatio).toBeGreaterThan(0);
    expect(shifted.strayRatio).toBeLessThanOrEqual(MAX_STRAY_RATIO);

    const missing = await comparePngs(page, base, await dots(page, { skip: 40 }));
    expect(missing.strayRatio).toBeGreaterThan(MAX_STRAY_RATIO);

    const recoloured = await comparePngs(page, base, await dots(page, { shift: 12 }));
    expect(recoloured.meanDiffOffEdges).toBeGreaterThan(MAX_MEAN_DIFF);
  });
});

test.describe("preview equals PNG export", () => {
  for (const c of CASES) {
    const label = `${c.toolId} (${c.preset ?? "defaults"})`;

    test(label, async ({ page, browserName }, testInfo) => {
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
        description: [
          `${(result.diffRatio * 100).toFixed(3)} % pixels differ`,
          `${(result.strayRatio * 100).toFixed(4)} % not explained by edges`,
          `mean ${result.meanDiff.toFixed(3)}`,
          `mean off edges ${result.meanDiffOffEdges.toFixed(3)}`,
        ].join(", "),
      });

      expect({ width: result.width, height: result.height }).toEqual(SIZE);
      expect(result.strayRatio, "share of pixels that differ beyond edges").toBeLessThanOrEqual(
        MAX_STRAY_RATIO,
      );
      expect(result.diffRatio, "share of pixels that differ").toBeLessThanOrEqual(
        MAX_DIFF_RATIO_BY_BROWSER[browserName] ?? MAX_DIFF_RATIO,
      );
      expect(result.meanDiffOffEdges, "mean channel difference off edges").toBeLessThanOrEqual(
        c.maxMeanDiff ?? MAX_MEAN_DIFF,
      );
    });
  }
});
