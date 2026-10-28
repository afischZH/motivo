/**
 * Minimal PNG decoder for tests (8-bit RGBA, non-interlaced, as written by
 * `PngStreamEncoder`), inflating with `DecompressionStream`. Test-only module.
 */

async function inflate(parts: Uint8Array[]): Promise<Uint8Array> {
  const stream = new Blob(parts as BlobPart[])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Whether two byte arrays hold the same bytes. */
export function sameBytes(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface DecodedPng {
  width: number;
  height: number;
  data: Uint8Array;
  /** Chunk types in file order. */
  chunks: string[];
  /** Filter type of each scanline. */
  filters: number[];
}

const u32 = (b: Uint8Array, o: number): number =>
  (((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0)) >>> 0;

export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((v, i) => bytes[i] === v)) throw new Error("not a PNG");
  let o = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  const chunks: string[] = [];
  while (o < bytes.length) {
    const len = u32(bytes, o);
    const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    const data = bytes.subarray(o + 8, o + 8 + len);
    chunks.push(type);
    if (type === "IHDR") {
      width = u32(data, 0);
      height = u32(data, 4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error("unsupported PNG");
    } else if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = await inflate(idat);
  const stride = width * 4;
  const out = new Uint8Array(stride * height);
  const filters: number[] = [];
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)] ?? 0;
    filters.push(type);
    const src = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? (out[y * stride + i - 4] ?? 0) : 0;
      const b = y > 0 ? (out[(y - 1) * stride + i] ?? 0) : 0;
      const c = i >= 4 && y > 0 ? (out[(y - 1) * stride + i - 4] ?? 0) : 0;
      let pred = 0;
      if (type === 1) pred = a;
      else if (type === 2) pred = b;
      else if (type === 3) pred = (a + b) >>> 1;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = ((raw[src + i] ?? 0) + pred) & 0xff;
    }
  }
  return { width, height, data: out, chunks, filters };
}
