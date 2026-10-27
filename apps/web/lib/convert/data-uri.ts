/**
 * Data URI parsing and extraction (RFC 2397, processed like the WHATWG
 * fetch "data: URL processor": the body is percent-decoded first, then
 * Base64-decoded when the `;base64` flag is present).
 */
import { base64ToBytes, bytesToBinary, percentDecode } from "./bytes";

export type ParsedDataUri = {
  /** Lowercased media type without parameters, e.g. `image/svg+xml`. */
  mime: string;
  base64: boolean;
  bytes: Uint8Array;
};

export type DataUriError = "invalidDataUri" | "invalidBase64";

export function parseDataUri(
  input: string,
): { ok: true; value: ParsedDataUri } | { ok: false; error: DataUriError } {
  const uri = input.trim();
  if (!/^data:/i.test(uri)) return { ok: false, error: "invalidDataUri" };
  const comma = uri.indexOf(",");
  if (comma < 0) return { ok: false, error: "invalidDataUri" };

  const meta = uri
    .slice(5, comma)
    .split(";")
    .map((part) => part.trim());
  let base64 = false;
  if (meta.length > 1 && meta[meta.length - 1]?.toLowerCase() === "base64") {
    base64 = true;
    meta.pop();
  }
  const mime = (meta[0] ?? "").toLowerCase() || "text/plain";
  if (!/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(mime)) return { ok: false, error: "invalidDataUri" };

  const body = percentDecode(uri.slice(comma + 1));
  if (!base64) return { ok: true, value: { mime, base64, bytes: body } };

  const bytes = base64ToBytes(bytesToBinary(body));
  if (bytes === null) return { ok: false, error: "invalidBase64" };
  return { ok: true, value: { mime, base64, bytes } };
}

/** Removes CSS string escapes (`\"`, `\'`, `\\`, escaped newlines). */
function unescapeCss(text: string): string {
  return text.replace(/\\\r?\n/g, "").replace(/\\(.)/g, "$1");
}

/**
 * Finds every data URI in a text such as a CSS rule, an HTML attribute or a
 * bare URI. A quote or `url(` directly before `data:` determines where the
 * URI ends; a bare URI ends at whitespace, `;` or the end of the text.
 */
export function extractDataUris(text: string): string[] {
  const found: string[] = [];
  const pattern = /data:/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    let back = start - 1;
    while (back >= 0 && /\s/.test(text[back] as string)) back--;
    const opener = text[back];
    let end = start;
    if (opener === '"' || opener === "'") {
      while (end < text.length && text[end] !== opener) end += text[end] === "\\" ? 2 : 1;
    } else if (opener === "(") {
      while (end < text.length && text[end] !== ")" && !/\s/.test(text[end] as string)) end++;
    } else {
      // `;` separates parameters before the comma but ends a CSS value after it.
      let inBody = false;
      while (end < text.length) {
        const char = text[end] as string;
        if (/[\s"'<>]/.test(char) || (inBody && char === ";")) break;
        if (char === ",") inBody = true;
        end++;
      }
    }
    end = Math.min(end, text.length);
    found.push(unescapeCss(text.slice(start, end)));
    pattern.lastIndex = Math.max(end, start + 5);
  }
  return found;
}
