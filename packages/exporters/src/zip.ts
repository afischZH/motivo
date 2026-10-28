/**
 * A tiny ZIP writer (PKWARE APPNOTE 6.3, no library): local file headers,
 * file data, central directory and end record. Each entry is stored as is
 * (method 0) or deflated (method 8) through `CompressionStream("deflate-raw")`
 * when that makes it smaller; already compressed files (PNG) stay stored.
 * File names are UTF-8 (flag bit 11). No ZIP64: at most 65 535 entries and
 * 4 GB, plenty for an icon pack.
 *
 * No DOM: runs in the raster worker, on the main thread and in Node tests.
 */
import { crc32 } from "@musterli/engine";
import { ExportError } from "./errors";

/** One file of an archive. */
export interface ZipEntry {
  /** Relative path with `/` separators, e.g. `icons/icon-192.png`. */
  path: string;
  data: Uint8Array;
}

/** Raw deflate (RFC 1951) of a whole buffer. */
export type RawDeflate = (data: Uint8Array) => Promise<Uint8Array>;

export interface ZipOptions {
  /**
   * Deflate entries that shrink; `false` stores everything. Default: on
   * when `CompressionStream` is available.
   */
  compress?: boolean;
  /** Injected raw deflate (tests); default `CompressionStream("deflate-raw")`. */
  deflateRaw?: RawDeflate;
  /**
   * Modification time written for every entry (local time fields, as ZIP
   * stores them). Default 1980-01-01 00:00, the earliest DOS date, which
   * keeps archives reproducible.
   */
  modified?: Date;
}

/** MIME type of ZIP archives. */
export const ZIP_MIME = "application/zip";

export const ZIP_MAX_ENTRIES = 0xffff;
const U32_MAX = 0xffffffff;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
/** Version needed to extract: 2.0 (deflate). */
const VERSION = 20;
/** Bit 11: names are UTF-8. */
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** A path is safe in an archive: relative, `/` separated, no `.`/`..` segments, no control characters. */
export function isSafeZipPath(path: string): boolean {
  if (path.length === 0 || path.length > 255) return false;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
  if (/[\0-\x1f\x7f\\:*?"<>|]/.test(path)) return false;
  if (path.startsWith("/") || path.endsWith("/")) return false;
  return path.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** Whether `CompressionStream("deflate-raw")` exists in this realm. */
export function rawDeflateSupported(): boolean {
  if (typeof CompressionStream !== "function") return false;
  try {
    new CompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
}

/** Raw deflate through the platform's `CompressionStream("deflate-raw")`. */
export const compressionStreamDeflateRaw: RawDeflate = async (data) => {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** DOS time and date fields of a local time. Years before 1980 clamp to 1980-01-01. */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = date.getFullYear();
  if (!Number.isFinite(year) || year < 1980) return { time: 0, date: (1 << 5) | 1 };
  const y = Math.min(year, 2107) - 1980;
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: (y << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class Writer {
  readonly bytes: Uint8Array<ArrayBuffer>;
  private readonly view: DataView;
  private offset = 0;
  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }
  u16(v: number): void {
    this.view.setUint16(this.offset, v, true);
    this.offset += 2;
  }
  u32(v: number): void {
    this.view.setUint32(this.offset, v >>> 0, true);
    this.offset += 4;
  }
  raw(data: Uint8Array): void {
    this.bytes.set(data, this.offset);
    this.offset += data.length;
  }
}

interface Prepared {
  name: Uint8Array;
  crc: number;
  method: number;
  data: Uint8Array;
  size: number;
  offset: number;
}

/**
 * Builds a ZIP archive. Returns the parts in order (local records, then the
 * central directory), ready for `new Blob(parts)`. Throws `ExportError`
 * (`encode-failed`) for unsafe or duplicate paths and archives beyond the
 * limits.
 */
export async function createZip(
  entries: readonly ZipEntry[],
  options: ZipOptions = {},
): Promise<Uint8Array<ArrayBuffer>[]> {
  if (entries.length > ZIP_MAX_ENTRIES) {
    throw new ExportError("encode-failed", `A ZIP holds at most ${ZIP_MAX_ENTRIES} entries`);
  }
  const deflate =
    options.compress === false
      ? undefined
      : (options.deflateRaw ?? (rawDeflateSupported() ? compressionStreamDeflateRaw : undefined));
  const { time, date } = dosDateTime(options.modified ?? new Date(1980, 0, 1));
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const prepared: Prepared[] = [];
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (!isSafeZipPath(entry.path)) {
      throw new ExportError("encode-failed", `Unsafe ZIP path "${entry.path}"`);
    }
    if (seen.has(entry.path)) {
      throw new ExportError("encode-failed", `Duplicate ZIP path "${entry.path}"`);
    }
    seen.add(entry.path);
    const name = encoder.encode(entry.path);
    let data = entry.data;
    let method = METHOD_STORE;
    if (deflate && data.length > 0) {
      const packed = await deflate(data);
      if (packed.length < data.length) {
        data = packed;
        method = METHOD_DEFLATE;
      }
    }
    const p: Prepared = {
      name,
      crc: crc32(entry.data),
      method,
      data,
      size: entry.data.length,
      offset,
    };
    const local = new Writer(30 + name.length);
    local.u32(SIG_LOCAL);
    local.u16(VERSION);
    local.u16(FLAG_UTF8);
    local.u16(method);
    local.u16(time);
    local.u16(date);
    local.u32(p.crc);
    local.u32(data.length);
    local.u32(p.size);
    local.u16(name.length);
    local.u16(0);
    local.raw(name);
    parts.push(local.bytes, toArrayBufferView(data));
    offset += local.bytes.length + data.length;
    if (offset > U32_MAX || p.size > U32_MAX) {
      throw new ExportError("encode-failed", "The ZIP would exceed 4 GB");
    }
    prepared.push(p);
  }

  const centralStart = offset;
  const centralSize = prepared.reduce((sum, p) => sum + 46 + p.name.length, 0);
  const central = new Writer(centralSize + 22);
  for (const p of prepared) {
    central.u32(SIG_CENTRAL);
    central.u16(VERSION); // made by: 2.0, MS-DOS attribute compatible
    central.u16(VERSION);
    central.u16(FLAG_UTF8);
    central.u16(p.method);
    central.u16(time);
    central.u16(date);
    central.u32(p.crc);
    central.u32(p.data.length);
    central.u32(p.size);
    central.u16(p.name.length);
    central.u16(0); // extra
    central.u16(0); // comment
    central.u16(0); // disk
    central.u16(0); // internal attributes
    central.u32(0); // external attributes
    central.u32(p.offset);
    central.raw(p.name);
  }
  central.u32(SIG_END);
  central.u16(0);
  central.u16(0);
  central.u16(prepared.length);
  central.u16(prepared.length);
  central.u32(centralSize);
  central.u32(centralStart);
  central.u16(0);
  parts.push(central.bytes);
  return parts;
}

function toArrayBufferView(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer
    ? (data as Uint8Array<ArrayBuffer>)
    : new Uint8Array(data);
}

/** `createZip` as an `application/zip` Blob. */
export async function zipBlob(entries: readonly ZipEntry[], options?: ZipOptions): Promise<Blob> {
  return new Blob(await createZip(entries, options), { type: ZIP_MIME });
}

/** One entry as read back by `readZip`. */
export interface ZipRecord {
  path: string;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  /** Stored or still compressed bytes as in the archive. */
  data: Uint8Array;
}

/**
 * Reads the central directory of an archive written by `createZip` and
 * checks it against the local headers (tests, sanity checks). Throws on
 * any structural mismatch. Does not inflate.
 */
export function readZip(bytes: Uint8Array): ZipRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (end < 0 || view.getUint32(end, true) !== SIG_END) throw new Error("No end record");
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let at = view.getUint32(end + 16, true);
  if (at + centralSize !== end) throw new Error("Central directory does not end at the end record");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const out: ZipRecord[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== SIG_CENTRAL) throw new Error(`Bad central header ${i}`);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (view.getUint32(local, true) !== SIG_LOCAL) throw new Error(`Bad local header ${path}`);
    if (
      view.getUint16(local + 8, true) !== method ||
      view.getUint32(local + 14, true) !== crc ||
      view.getUint32(local + 18, true) !== compressedSize ||
      view.getUint32(local + 22, true) !== size
    ) {
      throw new Error(`Local header of ${path} disagrees with the central directory`);
    }
    const localName = view.getUint16(local + 26, true);
    const localExtra = view.getUint16(local + 28, true);
    const start = local + 30 + localName + localExtra;
    out.push({
      path,
      method,
      crc,
      compressedSize,
      size,
      data: bytes.subarray(start, start + compressedSize),
    });
    at += 46 + nameLength + extra + comment;
  }
  return out;
}
