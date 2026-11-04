/**
 * S2 shader backgrounds (docs/TOOLS.md C7, D9 to D11): each tool compiles
 * on the GPU, its PNG export matches the CPU twin that draws the static
 * motifs, its HTML embed shows the same still frame as the PNG export, and
 * both landing pages render.
 */
import { readFile } from "node:fs/promises";

import { designToHash } from "@musterli/editor-ui/share";
import { PngStreamEncoder } from "@musterli/exporters/png-stream";
import { registry, renderWebglReference } from "@musterli/tool-registry";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { toolSlug } from "../i18n/slugs";
import { comparePngs } from "./support/compare";

const TOOLS = ["dot-wave", "liquid-chrome", "caustics", "light-beams"] as const;
const SIZE = { width: 480, height: 300 };
const SEED = 1;

test.use({ deviceScaleFactor: 1, reducedMotion: "reduce" });

function tool(id: string) {
  const found = registry.get(id);
  if (!found) throw new Error(`${id} missing`);
  return found;
}

/** Opens the defaults with seed 1 at `SIZE` through a share link. */
async function openEditor(page: Page, id: string) {
  const hash = designToHash(
    { toolId: id, params: { ...tool(id).defaults }, seed: SEED, size: SIZE },
    registry,
  );
  if (!hash.ok) throw new Error("no share hash");
  await page.goto(`/en/tools/${toolSlug(id, "en")}${hash.value}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("preview").locator("canvas[data-shader-motif]")).toHaveAttribute(
    "data-design",
    `${SIZE.width}x${SIZE.height}`,
    { timeout: 30_000 },
  );
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

async function download(page: Page, format: string, scale?: string): Promise<Buffer> {
  const dialog = await openExport(page);
  await choose(dialog, format);
  if (scale) await choose(dialog, scale);
  const [file] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    dialog.getByTestId("export-download").click(),
  ]);
  const body = await readFile(await file.path());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  return body;
}

async function cpuPng(id: string): Promise<Buffer> {
  const pixels = renderWebglReference(tool(id), tool(id).defaults, SEED, SIZE, SIZE);
  const encoder = new PngStreamEncoder(pixels.width, pixels.height);
  await encoder.addRows(pixels.data, pixels.height);
  return Buffer.concat((await encoder.finish()).map((p) => Buffer.from(p)));
}

for (const id of TOOLS) {
  test.describe(id, () => {
    test("the PNG export matches the CPU twin and the HTML embed", async ({ page }, testInfo) => {
      await openEditor(page, id);
      const png = await download(page, "PNG", `1× (${SIZE.width} × ${SIZE.height})`);
      await testInfo.attach("export.png", { body: png, contentType: "image/png" });

      // GPU (float32) against the float64 twin of the static motifs.
      const cpu = await cpuPng(id);
      await testInfo.attach("cpu.png", { body: cpu, contentType: "image/png" });
      const twin = await comparePngs(page, png, cpu, 3);
      await testInfo.attach("cpu-diff.png", {
        body: Buffer.from(twin.diffPng.split(",")[1] ?? "", "base64"),
        contentType: "image/png",
      });
      expect(twin.strayRatio).toBeLessThan(0.01);
      expect(twin.meanDiff).toBeLessThan(1);

      const dialog = await openExport(page);
      await choose(dialog, "HTML embed (live)");
      const [file] = await Promise.all([
        page.waitForEvent("download"),
        dialog.getByTestId("export-download").click(),
      ]);
      const html = (await readFile(await file.path(), "utf8")).replace(
        /min-height: \d+px;/,
        `width: ${SIZE.width}px; height: ${SIZE.height}px;`,
      );
      await page.goto("about:blank");
      await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
      const box = page.locator(".musterli-shader");
      await expect(box.locator("canvas")).toHaveCount(1);
      await page.waitForTimeout(300);
      const shot = await box.screenshot();
      await testInfo.attach("embed.png", { body: shot, contentType: "image/png" });
      const embed = await comparePngs(page, png, shot, 2);
      expect(embed.strayRatio).toBeLessThan(0.002);
      expect(embed.meanDiff).toBeLessThan(0.5);
    });

    for (const locale of ["de", "en"] as const) {
      test(`landing page ${locale} has content and a motif`, async ({ page }) => {
        const res = await page.goto(`/${locale}/tools/${toolSlug(id, locale)}`);
        expect(res?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const motif = await page.request.get(`/motifs/${id}/default.svg`);
        expect(motif.status()).toBe(200);
        expect(await motif.text()).toMatch(/href="data:image\/png;base64,/);
      });
    }
  });
}
