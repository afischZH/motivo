import { BRAND_FONT_MAX_BYTES } from "@musterli/storage";
import { describe, expect, it, vi } from "vitest";
import { checkBrandFontBytes, fontNameFromFile, prepareBrandFont } from "./font-upload";

function fontBytes(tag: string, size = 64): ArrayBuffer {
  const bytes = new Uint8Array(size).fill(3);
  for (let i = 0; i < 4; i++) bytes[i] = tag.charCodeAt(i);
  return bytes.buffer;
}

describe("brand font upload", () => {
  it("takes a font the browser loads", async () => {
    const verify = vi.fn(async () => true);
    const result = await prepareBrandFont(new Blob([fontBytes("wOF2")]), verify);
    expect(result).toMatchObject({ ok: true, format: "woff2" });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(await checkBrandFontBytes(fontBytes("\u0000\u0001\u0000\u0000"), verify)).toMatchObject({
      ok: true,
      format: "ttf",
    });
  });

  it("refuses large files unread, other files by signature, broken fonts by loading", async () => {
    const verify = vi.fn(async () => true);
    const big = new Blob([new Uint8Array(BRAND_FONT_MAX_BYTES + 1)]);
    const spy = vi.spyOn(big, "arrayBuffer");
    expect(await prepareBrandFont(big, verify)).toEqual({ ok: false, error: "too-large" });
    expect(spy).not.toHaveBeenCalled();
    expect(await prepareBrandFont(new Blob([fontBytes("<svg")]), verify)).toEqual({
      ok: false,
      error: "not-a-font",
    });
    expect(await prepareBrandFont(new Blob([fontBytes("ttcf")]), verify)).toEqual({
      ok: false,
      error: "not-a-font",
    });
    expect(await prepareBrandFont(new Blob([new Uint8Array(3)]), verify)).toEqual({
      ok: false,
      error: "not-a-font",
    });
    expect(verify).not.toHaveBeenCalled();
    expect(await prepareBrandFont(new Blob([fontBytes("OTTO")]), async () => false)).toEqual({
      ok: false,
      error: "broken",
    });
    expect(
      await prepareBrandFont(new Blob([fontBytes("OTTO")]), async () => {
        throw new Error("no FontFace");
      }),
    ).toEqual({ ok: false, error: "unavailable" });
  });

  it("names fonts after the file", () => {
    expect(fontNameFromFile("Haus-Schrift_Bold.woff2")).toBe("Haus Schrift Bold");
    expect(fontNameFromFile(".hidden")).toBe(".hidden");
  });
});
