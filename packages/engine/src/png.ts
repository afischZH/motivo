/**
 * Minimal synchronous PNG encoder and base64, without DOM or canvas, so
 * raster tiles can be embedded into SVG on the server, in workers and in
 * tests alike.
 *
 * Image data is written with uncompressed ("stored") deflate blocks: the
 * intended input is noise, which does not compress anyway, and this keeps
 * the encoder tiny and fast. Not meant for photos or large images.
 */

/** RGBA pixels, row-major; structurally compatible with `ImageData`. */
export interface RgbaBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** `gray` stores only the red channel (8-bit greyscale), `rgb` drops alpha. */
export type PngColorType = "gray" | "rgb" | "rgba";

/** Largest edge accepted by `encodePng`; larger buffers belong in a canvas encoder. */
export const PNG_MAX_EDGE = 4096;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (ISO 3309, as used by PNG and zlib's crc32). */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32 checksum (zlib trailer). */
export function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  // 5552 is the largest block length for which b cannot overflow before the modulo.
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(bytes.length, i + 5552);
    for (; i < end; i++) {
      a += bytes[i] as number;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const STORED_BLOCK_MAX = 65535;

/** zlib stream (RFC 1950) holding `raw` in stored deflate blocks (RFC 1951). */
export function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / STORED_BLOCK_MAX));
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  out[0] = 0x78; // CMF: deflate, 32 KB window
  out[1] = 0x01; // FLG: no dictionary, fastest; (0x78 << 8 | 0x01) % 31 === 0
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const start = b * STORED_BLOCK_MAX;
    const len = Math.min(STORED_BLOCK_MAX, raw.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0; // BFINAL, BTYPE = 00
    out[o++] = len & 0xff;
    out[o++] = len >>> 8;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  const adler = adler32(raw);
  out[o++] = adler >>> 24;
  out[o++] = (adler >>> 16) & 0xff;
  out[o++] = (adler >>> 8) & 0xff;
  out[o] = adler & 0xff;
  return out;
}

function writeU32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = value >>> 24;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32(out, 0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeU32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<PngColorType, number> = { gray: 1, rgb: 3, rgba: 4 };
const COLOR_TYPE_CODE: Record<PngColorType, number> = { gray: 0, rgb: 2, rgba: 6 };

/**
 * Encodes an RGBA buffer as an 8-bit PNG. Throws a RangeError for empty,
 * inconsistent or oversized buffers.
 */
export function encodePng(image: RgbaBuffer, colorType: PngColorType = "rgba"): Uint8Array {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`encodePng: invalid size ${width}x${height}`);
  }
  if (width > PNG_MAX_EDGE || height > PNG_MAX_EDGE) {
    throw new RangeError(`encodePng: ${width}x${height} exceeds ${PNG_MAX_EDGE} px`);
  }
  if (data.length !== width * height * 4) {
    throw new RangeError("encodePng: data length does not match width * height * 4");
  }
  const channels = CHANNELS[colorType];
  const stride = width * channels + 1; // filter byte (0 = None) per row
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    let o = y * stride + 1;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      for (let c = 0; c < channels; c++) raw[o++] = data[i + c] as number;
    }
  }

  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = COLOR_TYPE_CODE[colorType];
  // compression, filter and interlace methods stay 0

  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 with padding (RFC 4648 section 4). */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let line = "";
  const full = bytes.length - (bytes.length % 3);
  for (let i = 0; i < full; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    line +=
      B64.charAt(n >>> 18) +
      B64.charAt((n >>> 12) & 63) +
      B64.charAt((n >>> 6) & 63) +
      B64.charAt(n & 63);
    // Flush periodically: joining chunks is faster than one huge concatenation.
    if (line.length >= 8192) {
      parts.push(line);
      line = "";
    }
  }
  const rest = bytes.length - full;
  if (rest === 1) {
    const n = (bytes[full] as number) << 16;
    line += `${B64.charAt(n >>> 18)}${B64.charAt((n >>> 12) & 63)}==`;
  } else if (rest === 2) {
    const n = ((bytes[full] as number) << 16) | ((bytes[full + 1] as number) << 8);
    line += `${B64.charAt(n >>> 18)}${B64.charAt((n >>> 12) & 63)}${B64.charAt((n >>> 6) & 63)}=`;
  }
  parts.push(line);
  return parts.join("");
}

/** `data:image/png;base64,...` URI of an RGBA buffer. */
export function pngDataUri(image: RgbaBuffer, colorType: PngColorType = "rgba"): string {
  return `data:image/png;base64,${toBase64(encodePng(image, colorType))}`;
}
