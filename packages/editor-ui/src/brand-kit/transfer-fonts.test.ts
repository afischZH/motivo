import { BRAND_FONT_MAX_BYTES, BRAND_FONTS_MAX, type BrandFont } from "@musterli/storage";
import { describe, expect, it } from "vitest";
import { base64DecodedLength, base64ToBytes, bytesToBase64 } from "../transfer/base64";
import {
  BRAND_KIT_FILE_FORMAT,
  brandKitFileTexts,
  buildBrandKitFile,
  parseBrandKitFile,
  readBrandFont,
} from "./transfer";

function fontBytes(tag: string, size = 64, fill = 7): ArrayBuffer {
  const bytes = new Uint8Array(size).fill(fill);
  for (let i = 0; i < 4; i++) bytes[i] = tag.charCodeAt(i);
  return bytes.buffer;
}

const font = (over: Partial<BrandFont> = {}): BrandFont => ({
  id: "f1",
  name: "Hausschrift",
  format: "woff2",
  data: fontBytes("wOF2"),
  createdAt: 1_000,
  ...over,
});

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

const entry = (over: Record<string, unknown> = {}) => ({
  id: "f1",
  name: "Hausschrift",
  format: "woff2",
  data: bytesToBase64(new Uint8Array(fontBytes("wOF2"))),
  createdAt: 1,
  ...over,
});

describe("base64", () => {
  it("round-trips bytes of any length and refuses broken text", () => {
    for (const length of [0, 1, 2, 3, 100, 70_000]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 31) % 256);
      const text = bytesToBase64(bytes);
      expect(base64ToBytes(text)).toEqual(bytes);
      expect(base64DecodedLength(text.length)).toBeGreaterThanOrEqual(length);
    }
    expect(base64ToBytes("abc")).toBeNull();
    expect(base64ToBytes("ab!=")).toBeNull();
    expect(base64ToBytes("a===")).toBeNull();
  });
});

describe("brand kit file with fonts", () => {
  it("round-trips fonts as base64 and keeps old files readable", () => {
    const file = buildBrandKitFile(
      {
        palettes: [],
        defaultId: null,
        assets: [],
        fonts: [font(), font({ id: "f2", format: "otf", data: fontBytes("OTTO") })],
      },
      5,
    );
    expect(file.fonts[0]?.data).toMatch(/^d09GMg/);
    const parsed = parseBrandKitFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fonts.map((f) => [f.id, f.format, f.data.byteLength])).toEqual([
      ["f1", "woff2", 64],
      ["f2", "otf", 64],
    ]);
    expect(new Uint8Array(parsed.fonts[0]?.data ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array(fontBytes("wOF2")),
    );

    // A file of M3 has no `fonts` list.
    const old = parseBrandKitFile(fileText());
    expect(old.ok && old.fonts).toEqual([]);
  });

  it("skips entries that are not the declared font or not base64", () => {
    const parsed = parseBrandKitFile(
      fileText({
        fonts: [
          entry(),
          entry({ id: "zip", data: bytesToBase64(new Uint8Array(fontBytes("PK\u0003\u0004"))) }),
          entry({ id: "lie", format: "ttf" }),
          entry({ id: "b64", data: "d09GMg==!!!!" }),
          entry({ id: "short", data: bytesToBase64(new Uint8Array(fontBytes("wOF2", 8))) }),
          entry({ id: "eot", format: "eot" }),
          entry({ id: "x".repeat(65) }),
          { ...entry(), data: 42 },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fonts.map((f) => f.id)).toEqual(["f1"]);
    expect(parsed.skipped.map((s) => [s.type, s.index, s.reason])).toEqual([
      ["font", 1, "unsafe-font"],
      ["font", 2, "unsafe-font"],
      ["font", 3, "invalid"],
      ["font", 4, "invalid"],
      ["font", 5, "invalid"],
      ["font", 6, "invalid"],
      ["font", 7, "invalid"],
    ]);
  });

  it("refuses too many fonts and fonts over 2 MB", () => {
    const many = Array.from({ length: BRAND_FONTS_MAX + 1 }, (_, i) => entry({ id: `f${i}` }));
    expect(parseBrandKitFile(fileText({ fonts: many }))).toEqual({ ok: false, error: "too-many" });
    const big = bytesToBase64(new Uint8Array(fontBytes("wOF2", BRAND_FONT_MAX_BYTES + 3)));
    expect(readBrandFont(entry({ data: big }))).toBe("invalid");
    const max = bytesToBase64(new Uint8Array(fontBytes("wOF2", BRAND_FONT_MAX_BYTES)));
    expect(typeof readBrandFont(entry({ data: max }))).toBe("object");
  });

  it("refuses prototype keys inside font entries", () => {
    const text = fileText({ fonts: [entry()] }).replace(
      '"format":"woff2"',
      '"__proto__":{},"format":"woff2"',
    );
    expect(parseBrandKitFile(text)).toEqual({ ok: false, error: "forbidden-keys" });
  });

  it("splits large kits so every file imports again", async () => {
    const fonts = Array.from({ length: BRAND_FONTS_MAX }, (_, i) =>
      font({ id: `f${i}`, data: fontBytes("wOF2", 1_500_000, i) }),
    );
    const max = 6 * 1024 * 1024;
    const texts = await brandKitFileTexts(
      { palettes: [], defaultId: null, assets: [], fonts },
      1,
      max,
    );
    expect(texts.length).toBeGreaterThan(2);
    const ids: string[] = [];
    for (const text of texts) {
      expect(text.length).toBeLessThanOrEqual(max);
      const parsed = parseBrandKitFile(text);
      if (!parsed.ok) throw new Error(parsed.error);
      expect(parsed.skipped).toEqual([]);
      ids.push(...parsed.fonts.map((f) => f.id));
    }
    expect(ids).toEqual(fonts.map((f) => f.id));
  });
});
