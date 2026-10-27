/**
 * Byte helpers for the converters: UTF-8, Base64 and percent-encoding.
 * Pure, table-driven functions without DOM access: a 5 MB input converts in
 * tens of milliseconds (`btoa`/`atob` and regex callbacks are much slower).
 */

const encoder = new TextEncoder();
const asciiDecoder = new TextDecoder("utf-8");

export function utf8Encode(text: string): Uint8Array {
  return encoder.encode(text);
}

/** Strict UTF-8 decode. Returns `null` for invalid byte sequences. */
export function utf8Decode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Number of UTF-8 bytes a string occupies, without allocating a buffer. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const ENCODE = Uint8Array.from(ALPHABET, (c) => c.charCodeAt(0));
const PAD = 0x3d; // "="

/** Base64 alphabet value per char code; Base64url `-` and `_` are accepted too. */
const DECODE = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) DECODE[ALPHABET.charCodeAt(i)] = i;
DECODE[0x2d] = 62; // "-"
DECODE[0x5f] = 63; // "_"

/** ASCII whitespace per WHATWG infra: tab, LF, FF, CR, space. */
const isAsciiWhitespace = (code: number) =>
  code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d;

export function bytesToBase64(bytes: Uint8Array): string {
  const out = new Uint8Array(Math.ceil(bytes.length / 3) * 4);
  let o = 0;
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out[o++] = ENCODE[n >> 18] as number;
    out[o++] = ENCODE[(n >> 12) & 63] as number;
    out[o++] = ENCODE[(n >> 6) & 63] as number;
    out[o++] = ENCODE[n & 63] as number;
  }
  const rest = bytes.length - i;
  if (rest > 0) {
    const n = ((bytes[i] as number) << 16) | (rest === 2 ? (bytes[i + 1] as number) << 8 : 0);
    out[o++] = ENCODE[n >> 18] as number;
    out[o++] = ENCODE[(n >> 12) & 63] as number;
    out[o++] = rest === 2 ? (ENCODE[(n >> 6) & 63] as number) : PAD;
    out[o] = PAD;
  }
  return asciiDecoder.decode(out);
}

/**
 * Forgiving Base64 decode (WHATWG infra): ASCII whitespace is ignored and
 * padding is optional. Base64url characters are accepted as a lenient extra.
 * Returns `null` when the input is not valid Base64.
 */
export function base64ToBytes(input: string): Uint8Array | null {
  const values = new Uint8Array(input.length);
  let count = 0;
  let padding = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (isAsciiWhitespace(code)) continue;
    if (code === PAD) {
      padding++;
      continue;
    }
    // Data after padding, or a character outside the alphabet.
    if (padding > 0 || code > 127) return null;
    const value = DECODE[code] as number;
    if (value < 0) return null;
    values[count++] = value;
  }
  if (padding > 2 || (padding > 0 && (count + padding) % 4 !== 0)) return null;
  if (count % 4 === 1) return null;

  const out = new Uint8Array(Math.floor((count * 3) / 4));
  let o = 0;
  let i = 0;
  for (; i + 3 < count; i += 4) {
    const n =
      ((values[i] as number) << 18) |
      ((values[i + 1] as number) << 12) |
      ((values[i + 2] as number) << 6) |
      (values[i + 3] as number);
    out[o++] = n >> 16;
    out[o++] = (n >> 8) & 255;
    out[o++] = n & 255;
  }
  const rest = count - i;
  if (rest >= 2) {
    const n =
      ((values[i] as number) << 18) |
      ((values[i + 1] as number) << 12) |
      (rest === 3 ? (values[i + 2] as number) << 6 : 0);
    out[o++] = n >> 16;
    if (rest === 3) out[o] = (n >> 8) & 255;
  }
  return out;
}

/** Maps each byte to one UTF-16 code unit (a "binary string"). */
export function bytesToBinary(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return binary;
}

const HEX = Uint8Array.from("0123456789ABCDEF", (c) => c.charCodeAt(0));

function hexValue(byte: number | undefined): number {
  if (byte === undefined) return -1;
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
  return -1;
}

/**
 * Percent-decodes a string to bytes (WHATWG URL "percent-decode"): invalid
 * `%` sequences stay as they are instead of throwing like `decodeURIComponent`.
 */
export function percentDecode(input: string): Uint8Array {
  const source = utf8Encode(input);
  const out = new Uint8Array(source.length);
  let length = 0;
  for (let i = 0; i < source.length; i++) {
    const byte = source[i] as number;
    if (byte === 0x25) {
      const hi = hexValue(source[i + 1]);
      const lo = hexValue(source[i + 2]);
      if (hi >= 0 && lo >= 0) {
        out[length++] = hi * 16 + lo;
        i += 2;
        continue;
      }
    }
    out[length++] = byte;
  }
  return out.subarray(0, length);
}

/**
 * Bytes that must be escaped in an SVG data URI used inside a double-quoted
 * CSS `url("...")` or an HTML attribute: controls, the double quote, `#`
 * (fragment), `%`, `<`, `>`, backslash, a few unsafe URL characters and all
 * non-ASCII bytes. Everything else (letters, spaces, `'`, `=`, `/`) stays
 * readable, which keeps the CSS short.
 */
const UNSAFE_BYTE = new Uint8Array(256);
for (let b = 0; b < 256; b++)
  UNSAFE_BYTE[b] = b < 0x20 || b >= 0x7f || '"#%<>\\^`{|}'.includes(String.fromCharCode(b)) ? 1 : 0;

export function percentEncodeForDataUri(text: string): string {
  const bytes = utf8Encode(text);
  const out = new Uint8Array(bytes.length * 3);
  let o = 0;
  for (const byte of bytes) {
    if (UNSAFE_BYTE[byte]) {
      out[o++] = 0x25;
      out[o++] = HEX[byte >> 4] as number;
      out[o++] = HEX[byte & 15] as number;
    } else {
      out[o++] = byte;
    }
  }
  return asciiDecoder.decode(out.subarray(0, o));
}
