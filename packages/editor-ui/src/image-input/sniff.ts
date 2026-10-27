/**
 * Content sniffing for user images (converters and the editor's image
 * input). The declared type of a file or data URI is never trusted: we look
 * at the bytes and only accept the image types on the allowlist below.
 * Pure and DOM-free, so it runs in workers and in Node tests.
 */

/** Strict UTF-8 decode. Returns `null` for invalid byte sequences. */
function utf8Decode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
] as const;

export type ImageMime = (typeof IMAGE_TYPES)[number];

export const IMAGE_EXTENSIONS: Record<ImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, i) => bytes[offset + i] === value);
}

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = ascii("GIF87a");
const GIF89 = ascii("GIF89a");
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const BOM = String.fromCharCode(0xfeff);

/**
 * Strips what may legally precede the root element of an SVG file: a BOM,
 * the XML declaration, processing instructions, comments and a doctype.
 */
export function stripProlog(text: string): string {
  let rest = text.startsWith(BOM) ? text.slice(1) : text;
  for (;;) {
    const trimmed = rest.trimStart();
    let next: string | null = null;
    if (trimmed.startsWith("<?")) {
      const end = trimmed.indexOf("?>");
      next = end < 0 ? null : trimmed.slice(end + 2);
    } else if (trimmed.startsWith("<!--")) {
      const end = trimmed.indexOf("-->");
      next = end < 0 ? null : trimmed.slice(end + 3);
    } else if (/^<!DOCTYPE/i.test(trimmed)) {
      // A doctype may carry an internal subset in brackets.
      const bracket = trimmed.indexOf("[");
      const close = trimmed.indexOf(">");
      if (bracket >= 0 && bracket < close) {
        const end = trimmed.indexOf("]>", bracket);
        next = end < 0 ? null : trimmed.slice(end + 2);
      } else {
        next = close < 0 ? null : trimmed.slice(close + 1);
      }
    }
    if (next === null) return trimmed;
    rest = next;
  }
}

/**
 * True when the text is an SVG document: after the prolog, the root element
 * is `<svg` (optionally namespace-prefixed) and the document closes it.
 */
export function looksLikeSvg(text: string): boolean {
  const body = stripProlog(text);
  const open = /^<(?:[A-Za-z_][\w.-]*:)?svg[\s/>]/.exec(body);
  if (!open) return false;
  return /<\/(?:[A-Za-z_][\w.-]*:)?svg\s*>/.test(body) || /^<[^>]*\/>\s*$/.test(body);
}

/** Detects an allowed image type from its leading bytes, or `null`. */
export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return "image/gif";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp";
  // SVG is text: it must be valid UTF-8 and have an <svg> root element.
  const text = utf8Decode(bytes);
  if (text !== null && looksLikeSvg(text)) return "image/svg+xml";
  return null;
}
