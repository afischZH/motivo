/**
 * PNG decoding and area-average scaling in Node, for comparisons that must
 * not depend on the browser under test (e.g. an 8K export, which WebKit
 * cannot decode into one bitmap). Supports what browsers and the Motivo
 * exporter write: 8-bit RGB or RGBA, non-interlaced.
 */
import { deflateSync, inflateSync } from "node:zlib";

export interface Rgba {
  width: number;
  height: number;
  /** Straight RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

const u32 = (b: Buffer, o: number): number => b.readUInt32BE(o);

export function decodePng(file: Buffer): Rgba {
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let o = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (o < file.length) {
    const len = u32(file, o);
    const type = file.toString("latin1", o + 4, o + 8);
    const data = file.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      width = u32(data, 0);
      height = u32(data, 4);
      const [depth, colour, , , interlace] = [data[8], data[9], data[10], data[11], data[12]];
      if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
        throw new Error(
          `unsupported PNG (depth ${depth}, colour ${colour}, interlace ${interlace})`,
        );
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? (rows[row + i - channels] ?? 0) : 0;
      const b = y > 0 ? (rows[row - stride + i] ?? 0) : 0;
      const c = i >= channels && y > 0 ? (rows[row - stride + i - channels] ?? 0) : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >>> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rows[row + i] = ((raw[src + i] ?? 0) + pred) & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: rows };
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = rows[p * 3] ?? 0;
    data[p * 4 + 1] = rows[p * 3 + 1] ?? 0;
    data[p * 4 + 2] = rows[p * 3 + 2] ?? 0;
    data[p * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Pixel weights of the source span [from, to) (fractional ends count partly). */
function spans(from: number, to: number, limit: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = Math.max(0, Math.floor(from)); i < Math.min(limit, Math.ceil(to)); i++) {
    const w = Math.min(to, i + 1) - Math.max(from, i);
    if (w > 0) out.push([i, w]);
  }
  return out;
}

/**
 * Scales the source rectangle (sx, sy, sw, sh), in fractional source pixels,
 * to `width` x `height` by averaging the covered area (box filter). Returns
 * RGB values as floats, 3 per pixel.
 */
export function areaAverageRgb(
  img: Rgba,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  width: number,
  height: number,
): Float64Array {
  const out = new Float64Array(width * height * 3);
  const kx = sw / width;
  const ky = sh / height;
  const cols = Array.from({ length: width }, (_, x) =>
    spans(sx + x * kx, sx + (x + 1) * kx, img.width),
  );
  for (let y = 0; y < height; y++) {
    const rowSpans = spans(sy + y * ky, sy + (y + 1) * ky, img.height);
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let total = 0;
      for (const [py, wy] of rowSpans) {
        for (const [px, wx] of cols[x] ?? []) {
          const w = wx * wy;
          const i = (py * img.width + px) * 4;
          r += (img.data[i] ?? 0) * w;
          g += (img.data[i + 1] ?? 0) * w;
          b += (img.data[i + 2] ?? 0) * w;
          total += w;
        }
      }
      const o = (y * width + x) * 3;
      out[o] = r / total;
      out[o + 1] = g / total;
      out[o + 2] = b / total;
    }
  }
  return out;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  data.copy(out, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) c = (CRC[(c ^ (out[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length);
  return out;
}

/** Encodes RGB floats (as `areaAverageRgb` returns) as an 8-bit RGB PNG, for test reports. */
export function encodeRgbPng(rgb: ArrayLike<number>, width: number, height: number): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width * 3; i++) {
      const v = Math.round(rgb[y * width * 3 + i] ?? 0);
      raw[y * stride + 1 + i] = Math.max(0, Math.min(255, v));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
