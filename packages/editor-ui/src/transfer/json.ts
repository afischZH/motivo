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

/**
 * Packs serialised items into as few files as possible, each at most
 * `maxBytes` (UTF-8) so it can be imported again. `wrap(part, body)` builds
 * the file text of part `part` (from 0) around the comma-joined items. An
 * item too large on its own still gets a file of its own (the schemas keep
 * single items far below the import limits). Always returns at least one file.
 */
export function packIntoFiles(
  items: readonly string[],
  wrap: (part: number, body: string) => string,
  maxBytes: number,
): string[] {
  const files: string[] = [];
  let body: string[] = [];
  let size = utf8Length(wrap(0, ""));
  for (const item of items) {
    const bytes = utf8Length(item);
    if (body.length > 0 && size + 1 + bytes > maxBytes) {
      files.push(wrap(files.length, body.join(",")));
      body = [];
      size = utf8Length(wrap(files.length, ""));
    }
    size += bytes + (body.length > 0 ? 1 : 0);
    body.push(item);
  }
  files.push(wrap(files.length, body.join(",")));
  return files;
}

/** `<base>.json`, or `<base>-<n>.json` when an export needs several files. */
export function partFileName(base: string, part: number, parts: number): string {
  return parts > 1 ? `${base}-${part + 1}.json` : `${base}.json`;
}

/** `{ format }` of a parsed file, if it has a string one. */
export function fileFormatOf(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  const format = (json as { format?: unknown }).format;
  return typeof format === "string" ? format : undefined;
}
