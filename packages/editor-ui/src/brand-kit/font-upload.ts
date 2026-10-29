/**
 * Own fonts for the brand kit (M6-AP03): a file is taken only when it is
 * small enough, carries the signature of a WOFF2, WOFF, TrueType or
 * OpenType font and the browser actually loads it through `FontFace` (the
 * browser's font sanitizer parses every table; a broken or hostile file
 * fails here and is never stored). The bytes never leave the browser.
 */
import {
  BRAND_FONT_MAX_BYTES,
  BRAND_FONT_MIN_BYTES,
  sniffFontFormat,
  type BrandFontFormat,
} from "@musterli/storage";

export type BrandFontError = "too-large" | "not-a-font" | "broken" | "unavailable";

export type BrandFontResult =
  { ok: true; format: BrandFontFormat; data: ArrayBuffer } | { ok: false; error: BrandFontError };

/** Accept list of the file input (types and extensions, browsers differ). */
export const FONT_ACCEPT = ".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf";

/** Loads font bytes as a throwaway `FontFace` (never added to the page). */
export type FontVerifier = (data: ArrayBuffer) => Promise<boolean>;

let checks = 0;

export const browserFontVerifier: FontVerifier = async (data) => {
  if (typeof FontFace === "undefined") throw new Error("unavailable");
  try {
    // A copy: FontFace may keep or detach the buffer.
    const face = new FontFace(`musterli-check-${++checks}`, data.slice(0));
    await face.load();
    return face.status === "loaded";
  } catch {
    return false;
  }
};

/** Checks bytes that are already in memory (uploads and imported files). */
export async function checkBrandFontBytes(
  data: ArrayBuffer,
  verify: FontVerifier = browserFontVerifier,
): Promise<BrandFontResult> {
  if (data.byteLength > BRAND_FONT_MAX_BYTES) return { ok: false, error: "too-large" };
  if (data.byteLength < BRAND_FONT_MIN_BYTES) return { ok: false, error: "not-a-font" };
  const format = sniffFontFormat(new Uint8Array(data, 0, 4));
  if (!format) return { ok: false, error: "not-a-font" };
  try {
    if (!(await verify(data))) return { ok: false, error: "broken" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, format, data };
}

/** Reads and checks a font file; the size is checked before anything is read. */
export async function prepareBrandFont(
  file: Blob,
  verify: FontVerifier = browserFontVerifier,
): Promise<BrandFontResult> {
  if (file.size > BRAND_FONT_MAX_BYTES) return { ok: false, error: "too-large" };
  let data: ArrayBuffer;
  try {
    data = await file.arrayBuffer();
  } catch {
    return { ok: false, error: "not-a-font" };
  }
  return checkBrandFontBytes(data, verify);
}

/** File name without extension, as the font's default name. */
export function fontNameFromFile(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.replace(/[-_]+/g, " ").trim().slice(0, 80);
}
