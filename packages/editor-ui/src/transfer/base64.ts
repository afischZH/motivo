/**
 * Base64 for binary entries of import files (brand fonts): chunked, so a
 * 2 MB file never builds one huge argument list, and strict on decode.
 * Works in browsers, workers and Node (`btoa`/`atob`).
 */

const CHUNK = 0x8000;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Length in bytes that a base64 text of `length` characters decodes to (at most). */
export function base64DecodedLength(length: number): number {
  return Math.floor(length / 4) * 3;
}

/** The decoded bytes, or `null` for anything that is not padded base64. */
export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (text.length % 4 !== 0 || !BASE64.test(text)) return null;
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
