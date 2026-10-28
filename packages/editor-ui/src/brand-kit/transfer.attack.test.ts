/**
 * Attack tests for the brand kit file import (M3-AP11 security review).
 */
import {
  BRAND_LOGOS_MAX,
  BRAND_SHAPES_MAX,
  BRAND_SVG_MAX_LENGTH,
  type BrandAsset,
} from "@musterli/storage";
import { describe, expect, it } from "vitest";
import {
  BRAND_KIT_FILE_FORMAT,
  BRAND_KIT_FILE_MAX_BYTES,
  brandKitFileName,
  brandKitFileTexts,
  parseBrandKitFile,
} from "./transfer";

const fileText = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: BRAND_KIT_FILE_FORMAT,
    version: 1,
    exportedAt: 1,
    defaultPaletteId: null,
    palettes: [],
    assets: [],
    ...over,
  });

const svgAsset = (svg: string, over: Partial<BrandAsset> = {}): BrandAsset =>
  ({
    id: "a1",
    kind: "logo",
    name: "Logo",
    image: { kind: "svg", svg, width: 10, height: 10, name: "logo.svg" },
    createdAt: 1_000,
    ...over,
  }) as BrandAsset;

const time = (fn: () => void) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

// Large inputs on purpose: generous timeouts for loaded CI machines.
describe("brand kit import under attack", { timeout: 60_000 }, () => {
  it("survives SVG nested deeper than any recursive walker allows", () => {
    const depth = 100_000;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${"<g>".repeat(depth)}<rect width="1" height="1"/>${"</g>".repeat(depth)}</svg>`;
    expect(svg.length).toBeLessThan(BRAND_SVG_MAX_LENGTH);
    let result: ReturnType<typeof parseBrandKitFile> | undefined;
    expect(() => {
      result = parseBrandKitFile(fileText({ assets: [svgAsset(svg)] }));
    }).not.toThrow();
    expect(result?.ok).toBe(true);
  });

  it("keeps the sanitizer work of a file at the size limit within the worker timeout", () => {
    // As many hostile shapes as the file allows, each full of class rules,
    // event handlers and external references.
    const body = Array.from(
      { length: 400 },
      (_, i) =>
        `<rect class="c${i % 50}" x="${i}" width="1" height="1" onclick="x()" style="fill:url(https://e.example/${i})"/>`,
    ).join("");
    const style = `<style>${Array.from({ length: 50 }, (_, i) => `.c${i}{fill:#${String(i).padStart(6, "0")}}`).join("")}</style>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 10">${style}${body}</svg>`;
    const count = Math.min(
      BRAND_LOGOS_MAX + BRAND_SHAPES_MAX,
      Math.floor(BRAND_KIT_FILE_MAX_BYTES / (svg.length + 200)),
    );
    const assets = Array.from({ length: count }, (_, i) =>
      svgAsset(svg, { id: `s${i}`, kind: i < BRAND_LOGOS_MAX ? "logo" : "shape" }),
    );
    const text = fileText({ assets });
    expect(text.length).toBeLessThanOrEqual(BRAND_KIT_FILE_MAX_BYTES);
    let ok = false;
    const ms = time(() => {
      const parsed = parseBrandKitFile(text);
      ok = parsed.ok && parsed.assets.length === count;
    });
    expect(ok).toBe(true);
    // The import worker gives up after 60 s; stay far below it.
    expect(ms).toBeLessThan(20_000);
  });

  it("keeps ids, names and timestamps inside their bounds", () => {
    const parsed = parseBrandKitFile(
      fileText({
        palettes: [
          { id: "__proto__", name: "P", colors: ["#000", "#fff"], createdAt: 1, updatedAt: 1 },
          { id: "x".repeat(65), name: "P", colors: ["#000", "#fff"], createdAt: 1, updatedAt: 1 },
          { id: "p/../x", name: "P", colors: ["#000", "#fff"], createdAt: 1, updatedAt: 1 },
          { id: "p", name: "n".repeat(81), colors: ["#000", "#fff"], createdAt: 1, updatedAt: 1 },
          { id: "p", name: "P", colors: ["red", "#fff"], createdAt: 1, updatedAt: 1 },
          { id: "p", name: "P", colors: ["#000", "#fff"], createdAt: -1, updatedAt: 1 },
          { id: "p", name: "P", colors: ["#000", "#fff"], createdAt: 1e20, updatedAt: 1 },
          { id: "p", name: "P", colors: Array(11).fill("#000"), createdAt: 1, updatedAt: 1 },
        ],
      }),
    );
    // A syntactically valid id is just an id ("__proto__" is stored as data).
    expect(parsed.ok && parsed.palettes.map((p) => p.id)).toEqual(["__proto__"]);
    expect(parsed.ok && parsed.skipped).toHaveLength(7);
    // An oversized default id makes the whole file invalid.
    expect(parseBrandKitFile(fileText({ defaultPaletteId: "x".repeat(65) }))).toEqual({
      ok: false,
      error: "wrong-format",
    });
  });

  it("refuses a default palette id that is not in the file", () => {
    const parsed = parseBrandKitFile(
      fileText({
        palettes: [{ id: "p", name: "P", colors: ["#000", "#fff"], createdAt: 1, updatedAt: 1 }],
        defaultPaletteId: "other",
      }),
    );
    expect(parsed.ok && parsed.defaultId).toBeNull();
  });

  it("exports a large brand kit in files that each import again", async () => {
    // 50 large raster logos (about 700 KB each) are more than one file may hold.
    const head =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg";
    const data = head + "A".repeat(700_000 - head.length - 2) + "==";
    const kit = {
      palettes: [
        { id: "p", name: "P", colors: ["#000000", "#ffffff"], createdAt: 1, updatedAt: 1 },
      ],
      defaultId: "p",
      assets: Array.from(
        { length: BRAND_LOGOS_MAX },
        (_, i) =>
          ({
            id: `l${i}`,
            kind: "logo",
            name: `Logo ${i}`,
            image: {
              kind: "raster",
              href: `data:image/png;base64,${data}`,
              width: 1,
              height: 1,
              name: "l.png",
            },
            createdAt: 1,
          }) as BrandAsset,
      ),
    };
    const texts = await brandKitFileTexts(kit, 1);
    expect(texts.length).toBeGreaterThan(1);
    const ids: string[] = [];
    texts.forEach((text, part) => {
      expect(text.length).toBeLessThanOrEqual(BRAND_KIT_FILE_MAX_BYTES);
      const parsed = parseBrandKitFile(text);
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.skipped).toEqual([]);
      // Palettes and the default only once, in the first file.
      expect(parsed.palettes.length).toBe(part === 0 ? 1 : 0);
      expect(parsed.defaultId).toBe(part === 0 ? "p" : null);
      ids.push(...parsed.assets.map((a) => a.id));
    });
    expect(ids).toEqual(kit.assets.map((a) => a.id));
    expect(brandKitFileName(new Date(2026, 9, 28), 0, 2)).toBe(
      "musterli-brandkit-v1-2026-10-28-1.json",
    );
  });

  it("refuses absurd SVG dimensions", () => {
    for (const [width, height] of [
      [0, 10],
      [-1, 10],
      [1e7, 10],
      ["10", 10],
    ] as const) {
      const asset = {
        ...svgAsset('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'),
      } as unknown as { image: Record<string, unknown> };
      asset.image = { ...asset.image, width, height };
      const parsed = parseBrandKitFile(fileText({ assets: [asset] }));
      expect(parsed.ok && parsed.assets, `${String(width)}`).toEqual([]);
    }
  });
});
