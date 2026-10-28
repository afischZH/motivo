/**
 * Helpers for import files (designs, brand kit): hostile JSON is parsed
 * without ever creating keys that could pollute prototypes, and sizes are
 * measured in UTF-8 bytes before anything is parsed.
 */

/** Keys that never appear in our files and could pollute prototypes when copied. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export class ForbiddenKeyError extends Error {}

/** `JSON.parse` that throws `ForbiddenKeyError` on any forbidden key, at any depth. */
export function parseUntrustedJson(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => {
    if (FORBIDDEN_KEYS.has(key)) throw new ForbiddenKeyError(key);
    return value;
  });
}

/** Byte length of a string in UTF-8, without encoding it. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** `{ format }` of a parsed file, if it has a string one. */
export function fileFormatOf(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  const format = (json as { format?: unknown }).format;
  return typeof format === "string" ? format : undefined;
}
