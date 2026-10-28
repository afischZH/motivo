/**
 * Large data URIs in CSS previews (an uploaded screenshot or photo as a
 * `background-image`). Setting a style property makes the browser parse the
 * whole value: a 4 MB data URI costs about 100 ms on the main thread in
 * Chromium, on every element that shows it. The preview therefore swaps
 * large data URIs for `blob:` URLs, decoded in small steps between tasks
 * (pictures over `PREVIEW_MAX_EDGE` as a smaller copy). The tool's output
 * and every export keep the data URI; only the on-screen style changes
 * (M4b-AP04).
 */
import { useEffect, useState } from "react";
import { imageDimensions } from "../image-input/dimensions";
import { browserImageInputServices, type ImageInputServices } from "../image-input/services";
import { sniffImageType } from "../image-input/sniff";
import type { CssDeclarations } from "./render";

/** Data URIs from this length on are shown through `blob:` URLs. */
export const LARGE_DATA_URL = 256 * 1024;
/** Base64 characters decoded per task (a multiple of 4). */
const CHUNK = 256 * 1024;
/** Object URLs kept; the oldest is revoked beyond this. */
const MAX_OBJECT_URLS = 24;

const URL_OPEN = 'url("';
const URL_CLOSE = '")';
/**
 * Raster pictures only: a blob: URL belongs to the app's origin, so a data
 * URI of another type (HTML, SVG with script) must never become one, even if
 * a tool's output carried it (M4b-AP05; tools emit only checked PNG and JPEG).
 */
const BASE64_DATA = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,/i;

/**
 * Calls `visit` with the start, end and text of each large base64 data URI
 * in `url("…")` of a value. Only short searches (`url("`, `")`), never a
 * search for the multi-megabyte URI itself.
 */
function eachLargeUrl(value: string, visit: (start: number, end: number, url: string) => void) {
  if (value.length < LARGE_DATA_URL) return;
  let from = 0;
  for (;;) {
    const start = value.indexOf(URL_OPEN, from);
    if (start === -1) return;
    const end = value.indexOf(URL_CLOSE, start + URL_OPEN.length);
    if (end === -1) return;
    const url = value.slice(start + URL_OPEN.length, end);
    if (url.length >= LARGE_DATA_URL && BASE64_DATA.test(url.slice(0, 80))) {
      visit(start + URL_OPEN.length, end, url);
    }
    from = end + URL_CLOSE.length;
  }
}

/** The large base64 data URIs in `url("…")` values of the declarations. */
export function largeDataUrls(declarations: CssDeclarations): string[] {
  const found: string[] = [];
  for (const [, values] of declarations) {
    for (const value of values) eachLargeUrl(value, (_s, _e, url) => found.push(url));
  }
  return found;
}

/** Ready object URLs by data URI, oldest first. */
const ready = new Map<string, string>();
const loading = new Map<string, Promise<string | undefined>>();

/** Whether this environment can show `blob:` URLs (not on the server or in plain Node). */
export function canUseObjectUrls(): boolean {
  return (
    typeof URL.createObjectURL === "function" &&
    typeof Blob === "function" &&
    typeof atob === "function"
  );
}

/** The object URL for a data URI, if it is decoded already. */
export function objectUrlOf(dataUrl: string): string | undefined {
  return ready.get(dataUrl);
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The bytes of a base64 data URI, decoded in steps between tasks. */
async function decodeBase64(
  dataUrl: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string } | null> {
  const head = BASE64_DATA.exec(dataUrl.slice(0, 80));
  if (!head) return null;
  const b64 = dataUrl.slice(head[0].length);
  const bytes = new Uint8Array(Math.ceil(b64.length / 4) * 3);
  let length = 0;
  for (let i = 0; i < b64.length; i += CHUNK) {
    const binary = atob(b64.slice(i, i + CHUNK));
    for (let j = 0; j < binary.length; j++) bytes[length++] = binary.charCodeAt(j);
    await nextTask();
  }
  return { bytes: bytes.subarray(0, length), mime: head[1] ?? "" };
}

async function decode(dataUrl: string): Promise<string | undefined> {
  const decoded = await decodeBase64(dataUrl);
  if (!decoded) return undefined;
  const shown = (await previewCopy(decoded.bytes)) ?? decoded;
  return URL.createObjectURL(new Blob([shown.bytes], { type: shown.mime }));
}

/**
 * Longest edge of the picture the preview shows. Larger pictures (a 4K
 * screenshot) are shown as a smaller copy: Chromium decodes and scales an
 * 8-megapixel bitmap for every changed frame, and with software raster the
 * main thread waits 50 to 130 ms for it. Exports always use the full picture.
 */
export const PREVIEW_MAX_EDGE = 1600;

let services: ImageInputServices | null = null;

/**
 * A copy of a PNG or JPEG at most `PREVIEW_MAX_EDGE` long, scaled and
 * encoded in the image worker. Null when it is small enough already, or
 * when there is no worker (scaling on the main thread would block it).
 */
async function previewCopy(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string } | null> {
  if (typeof Worker === "undefined") return null;
  const mime = sniffImageType(bytes);
  if (mime !== "image/png" && mime !== "image/jpeg") return null;
  const size = imageDimensions(bytes, mime);
  if (!size || Math.max(size.width, size.height) <= PREVIEW_MAX_EDGE) return null;
  try {
    services ??= browserImageInputServices();
    const crop = { x: 0, y: 0, width: size.width, height: size.height };
    const small = await services.crop(bytes, mime, crop, PREVIEW_MAX_EDGE);
    return small.ok ? await decodeBase64(small.href) : null;
  } catch {
    return null;
  }
}

/** Decodes a data URI into an object URL without blocking the main thread for long. */
export function loadObjectUrl(dataUrl: string): Promise<string | undefined> {
  const done = ready.get(dataUrl);
  if (done !== undefined) return Promise.resolve(done);
  const pending = loading.get(dataUrl);
  if (pending) return pending;
  const job = decode(dataUrl)
    .catch(() => undefined)
    .then((url) => {
      loading.delete(dataUrl);
      if (url === undefined) return undefined;
      ready.set(dataUrl, url);
      while (ready.size > MAX_OBJECT_URLS) {
        const [oldest, oldUrl] = ready.entries().next().value as [string, string];
        ready.delete(oldest);
        URL.revokeObjectURL(oldUrl);
      }
      return url;
    });
  loading.set(dataUrl, job);
  return job;
}

/**
 * The declarations with large data URIs replaced by their object URLs. A
 * value whose data URI is not decoded yet is left out for now (the picture
 * appears a moment later) instead of making the browser parse it.
 */
export function withObjectUrls(declarations: CssDeclarations, large: readonly string[]) {
  if (large.length === 0) return declarations;
  const out: [string, string[]][] = [];
  for (const [property, values] of declarations) {
    const kept: string[] = [];
    for (const value of values) {
      let next = "";
      let done = 0;
      let missing = false;
      eachLargeUrl(value, (start, end, dataUrl) => {
        const url = ready.get(dataUrl);
        if (url === undefined) missing = true;
        else {
          next += value.slice(done, start) + url;
          done = end;
        }
      });
      if (!missing) kept.push(done === 0 ? value : next + value.slice(done));
    }
    if (kept.length > 0) out.push([property, kept]);
  }
  return out as CssDeclarations;
}

/**
 * A URL to show `dataUrl` in an `<img>`: the data URI itself when it is
 * small, otherwise its object URL once decoded (undefined until then).
 */
export function useDisplayUrl(dataUrl: string | null): string | undefined {
  const large = dataUrl !== null && dataUrl.length >= LARGE_DATA_URL && canUseObjectUrls();
  const [, setDecoded] = useState(0);
  useEffect(() => {
    if (!large || objectUrlOf(dataUrl) !== undefined) return;
    let live = true;
    void loadObjectUrl(dataUrl).then(() => {
      if (live) setDecoded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [large, dataUrl]);
  if (dataUrl === null) return undefined;
  return large ? objectUrlOf(dataUrl) : dataUrl;
}
