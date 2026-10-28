import {
  BRAND_PALETTES_MAX,
  BRAND_RASTER_MAX_EDGE,
  BRAND_RASTER_MAX_LENGTH,
  BRAND_SVG_MAX_LENGTH,
  type BrandAsset,
  type BrandPalette,
} from "@motivo/storage";
import {
  IMAGE_ASSET_MAX_RASTER_LENGTH,
  IMAGE_ASSET_MAX_SVG_LENGTH,
  IMAGE_ASSET_RASTER_MAX_EDGE,
} from "@motivo/tool-registry";
import { describe, expect, it } from "vitest";
import { DESIGNS_FILE_FORMAT, parseDesignsFile } from "../designs/transfer";
import { registry } from "@motivo/tool-registry";
import { readBrandKitFile } from "./import-client";
import { brandImageToFile } from "./prepare";
import {
  BRAND_KIT_FILE_FORMAT,
  BRAND_KIT_FILE_MAX_BYTES,
  brandKitFileName,
  buildBrandKitFile,
  parseBrandKitFile,
} from "./transfer";

/** A 1x1 PNG. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** The first bytes of a GIF, base64. */
const GIF_HEAD = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const palette = (over: Partial<BrandPalette> = {}): BrandPalette => ({
  id: "p1",
  name: "Haus",
  colors: ["#112233", "#445566"],
  createdAt: 1_000,
  updatedAt: 2_000,
  ...over,
});

const svgLogo = (svg: string, over: Partial<BrandAsset> = {}): BrandAsset =>
  ({
    id: "a1",
    kind: "logo",
    name: "Logo",
    image: { kind: "svg", svg, width: 10, height: 10, name: "logo.svg" },
    createdAt: 1_000,
    ...over,
  }) as BrandAsset;

const rasterLogo = (href: string, over: Partial<BrandAsset> = {}): BrandAsset =>
  ({
    id: "r1",
    kind: "logo",
    name: "PNG",
    image: { kind: "raster", href, width: 1, height: 1, name: "a.png" },
    createdAt: 1_000,
    ...over,
  }) as BrandAsset;

const SAFE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#f00"/></svg>';

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

describe("brand kit file", () => {
  it("round-trips palettes, assets and the default", () => {
    const file = buildBrandKitFile(
      {
        palettes: [palette(), palette({ id: "p2", name: "Zwei" })],
        defaultId: "p2",
        assets: [svgLogo(SAFE_SVG), rasterLogo(`data:image/png;base64,${PNG_1X1}`)],
      },
      5,
    );
    const parsed = parseBrandKitFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.palettes.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(parsed.defaultId).toBe("p2");
    expect(parsed.assets).toHaveLength(2);
    expect(parsed.skipped).toEqual([]);
    expect(brandKitFileName(new Date(2026, 9, 28))).toBe("motivo-brandkit-v1-2026-10-28.json");
  });

  it("normalises colours and skips invalid palettes", () => {
    const parsed = parseBrandKitFile(
      fileText({
        palettes: [
          palette({ colors: ["#ABC", "#DDEEFF"] }),
          palette({ id: "x", colors: ["#000000"] }),
          palette({ id: "y", colors: ["#000000", "url(javascript:alert(1))"] }),
          { id: "z", name: "<img onerror=alert(1)>", colors: "red" },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.palettes).toHaveLength(1);
    expect(parsed.palettes[0]?.colors).toEqual(["#aabbcc", "#ddeeff"]);
    expect(parsed.skipped.map((s) => [s.type, s.index, s.reason])).toEqual([
      ["palette", 1, "invalid"],
      ["palette", 2, "invalid"],
      ["palette", 3, "invalid"],
    ]);
    // The default must point at an imported palette.
    expect(parsed.defaultId).toBeNull();
  });

  it("sanitises hostile SVG logos and shapes again", () => {
    const hostile = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><rect width="10" height="10"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject><iframe src="https://evil.example"/></foreignObject><circle r="4"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><image xlink:href="https://evil.example/x.png" width="10" height="10"/><a href="javascript:alert(1)"><rect width="5" height="5"/></a></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>@import url(https://evil.example/x.css);</style><rect width="10" height="10" style="fill:url(https://evil.example/#a)"/></svg>',
    ];
    const parsed = parseBrandKitFile(
      fileText({
        assets: hostile.map((svg, i) =>
          svgLogo(svg, { id: `h${i}`, kind: i % 2 === 0 ? "logo" : "shape" }),
        ),
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.removed).toBeGreaterThan(0);
    for (const asset of parsed.assets) {
      if (asset.image.kind !== "svg") throw new Error("expected svg");
      const svg = asset.image.svg.toLowerCase();
      expect(svg).not.toMatch(
        /<script|onload|foreignobject|iframe|javascript:|evil\.example|@import/,
      );
    }
    // Everything that survives is skipped or cleaned, never passed through.
    expect(parsed.assets.length + parsed.skipped.length).toBe(hostile.length);
  });

  it("skips SVG the sanitizer cannot read", () => {
    const parsed = parseBrandKitFile(
      fileText({ assets: [svgLogo("<html><body>not svg</body></html>")] }),
    );
    expect(parsed.ok && parsed.skipped).toEqual([
      { type: "asset", index: 0, name: "Logo", reason: "unsafe-image" },
    ]);
  });

  it("checks raster logos by magic bytes and refuses raster shapes", () => {
    const parsed = parseBrandKitFile(
      fileText({
        assets: [
          rasterLogo(`data:image/png;base64,${PNG_1X1}`),
          // Declared PNG, really a GIF.
          rasterLogo(`data:image/png;base64,${GIF_HEAD}`, { id: "r2" }),
          // Declared JPEG, really a PNG.
          rasterLogo(`data:image/jpeg;base64,${PNG_1X1}`, { id: "r3" }),
          // Not an image type the schema allows.
          rasterLogo(`data:image/svg+xml;base64,${btoa(SAFE_SVG)}`, { id: "r4" }),
          // A raster shape.
          rasterLogo(`data:image/png;base64,${PNG_1X1}`, { id: "r5", kind: "shape" }),
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.assets.map((a) => a.id)).toEqual(["r1"]);
    expect(parsed.skipped.map((s) => [s.index, s.reason])).toEqual([
      [1, "unsafe-image"],
      [2, "unsafe-image"],
      [3, "invalid"],
      [4, "invalid"],
    ]);
  });

  it("rejects manipulated files as a whole", () => {
    expect(parseBrandKitFile("")).toEqual({ ok: false, error: "empty" });
    expect(parseBrandKitFile("{not json")).toEqual({ ok: false, error: "malformed" });
    expect(parseBrandKitFile("[]")).toEqual({ ok: false, error: "wrong-format" });
    expect(parseBrandKitFile(fileText({ format: "other" }))).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(parseBrandKitFile(fileText({ version: 2 }))).toEqual({
      ok: false,
      error: "unsupported-version",
    });
    expect(parseBrandKitFile(fileText({ palettes: "x" }))).toEqual({
      ok: false,
      error: "wrong-format",
    });
    expect(
      parseBrandKitFile(fileText({ palettes: Array(BRAND_PALETTES_MAX + 1).fill(palette()) })),
    ).toEqual({ ok: false, error: "too-many" });
    expect(parseBrandKitFile("x".repeat(BRAND_KIT_FILE_MAX_BYTES + 1))).toEqual({
      ok: false,
      error: "too-large",
    });
    // Multi-byte characters count as their UTF-8 size.
    expect(parseBrandKitFile("ü".repeat(BRAND_KIT_FILE_MAX_BYTES / 2 + 1))).toEqual({
      ok: false,
      error: "too-large",
    });
  });

  it("refuses prototype pollution at any depth and leaves Object.prototype alone", () => {
    const attacks = [
      `{"format":"${BRAND_KIT_FILE_FORMAT}","version":1,"__proto__":{"polluted":true},"palettes":[],"assets":[]}`,
      fileText({ palettes: [{ ...palette(), constructor: { prototype: { polluted: true } } }] }),
      fileText({ assets: [JSON.parse('{"id":"a","__proto__":{"polluted":true}}')] }).replace(
        '"id":"a"',
        '"id":"a","__proto__":{"polluted":true}',
      ),
    ];
    for (const text of attacks) {
      expect(parseBrandKitFile(text)).toEqual({ ok: false, error: "forbidden-keys" });
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("points to the right page for the other file type", () => {
    const designs = JSON.stringify({ format: DESIGNS_FILE_FORMAT, version: 1, designs: [] });
    expect(parseBrandKitFile(designs)).toEqual({ ok: false, error: "designs-file" });
    expect(parseDesignsFile(fileText(), registry)).toEqual({ ok: false, error: "brand-kit-file" });
  });

  it("reads files on the main thread when no worker is available", async () => {
    const result = await readBrandKitFile(new Blob([fileText({ palettes: [palette()] })]), {
      createWorker: null,
    });
    expect(result.ok && result.palettes).toHaveLength(1);
    expect(await readBrandKitFile(new Blob([]), { createWorker: null })).toEqual({
      ok: false,
      error: "empty",
    });
    const big = { size: BRAND_KIT_FILE_MAX_BYTES + 1 } as Blob;
    expect(await readBrandKitFile(big)).toEqual({ ok: false, error: "too-large" });
  });
});

describe("brand images", () => {
  it("keeps the storage limits equal to the upload param limits", () => {
    expect(BRAND_SVG_MAX_LENGTH).toBe(IMAGE_ASSET_MAX_SVG_LENGTH);
    expect(BRAND_RASTER_MAX_LENGTH).toBe(IMAGE_ASSET_MAX_RASTER_LENGTH);
    expect(BRAND_RASTER_MAX_EDGE).toBe(IMAGE_ASSET_RASTER_MAX_EDGE);
  });

  it("turns stored images back into files for upload fields", async () => {
    const svg = brandImageToFile(
      { kind: "svg", svg: SAFE_SVG, width: 10, height: 10, name: "x.svg" },
      "logo.svg",
    );
    expect(svg.type).toBe("image/svg+xml");
    expect(await svg.text()).toBe(SAFE_SVG);
    const png = brandImageToFile(
      { kind: "raster", href: `data:image/png;base64,${PNG_1X1}`, width: 1, height: 1, name: "" },
      "a.png",
    );
    expect(png.type).toBe("image/png");
    expect(new Uint8Array(await png.arrayBuffer()).slice(1, 4)).toEqual(
      new Uint8Array([0x50, 0x4e, 0x47]),
    );
  });
});
