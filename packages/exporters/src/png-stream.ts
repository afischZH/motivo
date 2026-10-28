/**
 * Streaming PNG encoder for raster exports that are too large for one
 * canvas (M3-AP07 follow-up): the image arrives in horizontal strips of RGBA
 * rows, each row gets the usual adaptive PNG filter, and the filtered bytes
 * go through a deflate stream (`CompressionStream("deflate")` in browsers,
 * which emits the zlib format PNG requires). Only one row of the previous
 * strip is kept, so memory stays at about one strip plus the compressed
 * output.
 *
 * No DOM: runs in the raster worker, on the main thread and in Node tests.
 */
import { crc32 } from "@motivo/engine";

/** A deflate stream: `write` raw bytes, `close` flushes; output goes to the callback. */
export interface DeflateSink {
  write(bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  close(): Promise<void>;
}

/** Creates a zlib (RFC 1950) deflate stream whose output chunks go to `onOutput`. */
export type DeflateFactory = (onOutput: (chunk: Uint8Array) => void) => DeflateSink;

/** Whether `CompressionStream` (deflate) is available in this realm. */
export function compressionStreamSupported(): boolean {
  return typeof CompressionStream === "function";
}

/** Deflate through the platform's `CompressionStream("deflate")` (zlib format). */
export const compressionStreamDeflate: DeflateFactory = (onOutput) => {
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  // Read concurrently, otherwise back pressure stalls the writes.
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      onOutput(value);
    }
  })();
  // Keep a rejected pump from surfacing as unhandled before `close` awaits it.
  pump.catch(() => undefined);
  return {
    async write(bytes) {
      await writer.ready;
      await writer.write(bytes);
    },
    async close() {
      await writer.close();
      await pump;
    },
  };
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** RGBA, 8 bit. */
const BYTES_PER_PIXEL = 4;
/** IDAT payloads are collected up to this size before a chunk is written. */
const IDAT_CHUNK_BYTES = 256 * 1024;

function writeU32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = value >>> 24;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

/** One PNG chunk: length, type, data, CRC over type and data. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  writeU32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeU32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** Signed size of a filtered byte (the "minimum sum of absolute differences" heuristic). */
const cost = (v: number): number => (v < 128 ? v : 256 - v);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Writes one filtered scanline (filter type byte plus `row.length` bytes) to
 * `out` at `offset`. `prev` is the unfiltered previous row (zeros for the
 * first row). The filter type (None, Sub, Up, Average or Paeth) is chosen
 * per row by the smallest sum of absolute signed values, as libpng does.
 * Returns the chosen filter type.
 */
export function filterScanline(
  row: Uint8Array,
  prev: Uint8Array,
  out: Uint8Array,
  offset: number,
  bpp: number = BYTES_PER_PIXEL,
): number {
  const n = row.length;
  let sNone = 0;
  let sSub = 0;
  let sUp = 0;
  let sAvg = 0;
  let sPaeth = 0;
  for (let i = 0; i < n; i++) {
    const x = row[i] as number;
    const a = i >= bpp ? (row[i - bpp] as number) : 0;
    const b = prev[i] as number;
    const c = i >= bpp ? (prev[i - bpp] as number) : 0;
    sNone += cost(x);
    sSub += cost((x - a) & 0xff);
    sUp += cost((x - b) & 0xff);
    sAvg += cost((x - ((a + b) >>> 1)) & 0xff);
    sPaeth += cost((x - paeth(a, b, c)) & 0xff);
  }
  let type = 0;
  let best = sNone;
  if (sSub < best) [type, best] = [1, sSub];
  if (sUp < best) [type, best] = [2, sUp];
  if (sAvg < best) [type, best] = [3, sAvg];
  if (sPaeth < best) type = 4;
  out[offset] = type;
  const o = offset + 1;
  for (let i = 0; i < n; i++) {
    const x = row[i] as number;
    const a = i >= bpp ? (row[i - bpp] as number) : 0;
    const b = prev[i] as number;
    const c = i >= bpp ? (prev[i - bpp] as number) : 0;
    let pred = 0;
    if (type === 1) pred = a;
    else if (type === 2) pred = b;
    else if (type === 3) pred = (a + b) >>> 1;
    else if (type === 4) pred = paeth(a, b, c);
    out[o + i] = (x - pred) & 0xff;
  }
  return type;
}

/**
 * Encodes an RGBA image of `width` x `height` pixels that arrives top to
 * bottom in strips (`addRows`). Output: 8-bit RGBA PNG, non-interlaced.
 */
export class PngStreamEncoder {
  readonly width: number;
  readonly height: number;
  private readonly parts: Uint8Array<ArrayBuffer>[] = [];
  private readonly sink: DeflateSink;
  private readonly stride: number;
  private prev: Uint8Array;
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private rowsDone = 0;

  constructor(width: number, height: number, deflate: DeflateFactory = compressionStreamDeflate) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`PngStreamEncoder: invalid size ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.stride = width * BYTES_PER_PIXEL;
    this.prev = new Uint8Array(this.stride);
    const ihdr = new Uint8Array(13);
    writeU32(ihdr, 0, width);
    writeU32(ihdr, 4, height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type RGBA; compression, filter and interlace stay 0
    this.parts.push(Uint8Array.from(PNG_SIGNATURE), pngChunk("IHDR", ihdr));
    this.sink = deflate((chunk) => this.collect(chunk));
  }

  /** Rows encoded so far. */
  get rows(): number {
    return this.rowsDone;
  }

  private collect(chunk: Uint8Array): void {
    this.pending.push(chunk);
    this.pendingBytes += chunk.length;
    if (this.pendingBytes >= IDAT_CHUNK_BYTES) this.flushIdat();
  }

  private flushIdat(): void {
    if (this.pendingBytes === 0) return;
    const data = new Uint8Array(this.pendingBytes);
    let o = 0;
    for (const c of this.pending) {
      data.set(c, o);
      o += c.length;
    }
    this.parts.push(pngChunk("IDAT", data));
    this.pending = [];
    this.pendingBytes = 0;
  }

  /**
   * Adds the next `rows` rows; `data` holds at least `rows * width * 4`
   * straight (non-premultiplied) RGBA bytes, row-major, as `getImageData`
   * returns them.
   */
  async addRows(data: Uint8Array | Uint8ClampedArray, rows: number): Promise<void> {
    if (!Number.isInteger(rows) || rows < 1)
      throw new RangeError(`addRows: invalid row count ${rows}`);
    if (this.rowsDone + rows > this.height) {
      throw new RangeError(
        `addRows: ${this.rowsDone + rows} rows exceed the height ${this.height}`,
      );
    }
    if (data.length < rows * this.stride) throw new RangeError("addRows: not enough data");
    // One element type keeps the filter loop monomorphic.
    const bytes = new Uint8Array(data.buffer, data.byteOffset, rows * this.stride);
    const out = new Uint8Array(rows * (this.stride + 1));
    let prev = this.prev;
    for (let r = 0; r < rows; r++) {
      const row = bytes.subarray(r * this.stride, (r + 1) * this.stride);
      filterScanline(row, prev, out, r * (this.stride + 1));
      prev = row;
    }
    // Keep a copy: the caller may reuse or transfer `data`.
    this.prev = prev.slice();
    this.rowsDone += rows;
    await this.sink.write(out);
  }

  /** Finishes the stream; returns the PNG file as parts (for `new Blob(parts)`). */
  async finish(): Promise<Uint8Array<ArrayBuffer>[]> {
    if (this.rowsDone !== this.height) {
      throw new RangeError(`finish: ${this.rowsDone} of ${this.height} rows encoded`);
    }
    await this.sink.close();
    this.flushIdat();
    this.parts.push(pngChunk("IEND", new Uint8Array(0)));
    return this.parts;
  }
}
