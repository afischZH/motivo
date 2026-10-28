/**
 * A minimal ICO encoder: one directory entry per image, each image stored
 * as a complete PNG (allowed since Windows Vista and read by every current
 * browser). Pure, no DOM.
 */
import { ExportError } from "./errors";

/** One image of an icon: a PNG file and its pixel size (1 to 256). */
export interface IcoImage {
  width: number;
  height: number;
  png: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/**
 * Builds an `.ico` file (ICONDIR, ICONDIRENTRY × n, PNG data). Images are
 * written in the given order. Throws `ExportError("encode-failed")` for
 * sizes outside 1 to 256, non-PNG data or more than 255 images.
 */
export function encodeIco(images: readonly IcoImage[]): Uint8Array<ArrayBuffer> {
  if (images.length === 0 || images.length > 255) {
    throw new ExportError("encode-failed", "An icon holds 1 to 255 images");
  }
  const header = 6 + 16 * images.length;
  const total = images.reduce((sum, img) => sum + img.png.length, header);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);
  let offset = header;
  images.forEach((img, i) => {
    const { width, height, png } = img;
    if (![width, height].every((v) => Number.isInteger(v) && v >= 1 && v <= 256)) {
      throw new ExportError("encode-failed", `Icon images are 1 to 256 px, not ${width}x${height}`);
    }
    if (!isPng(png)) throw new ExportError("encode-failed", "Icon images must be PNG");
    const at = 6 + 16 * i;
    out[at] = width === 256 ? 0 : width; // 0 means 256
    out[at + 1] = height === 256 ? 0 : height;
    out[at + 2] = 0; // palette size
    out[at + 3] = 0; // reserved
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, 32, true); // bits per pixel
    view.setUint32(at + 8, png.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

/** One image as read back by `readIco` (tests). */
export interface IcoEntry {
  width: number;
  height: number;
  bitCount: number;
  data: Uint8Array;
}

/** Parses the directory of an `.ico` file; throws on structural errors. */
export function readIco(bytes: Uint8Array): IcoEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error("Not an icon");
  }
  const count = view.getUint16(4, true);
  const out: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + 16 * i;
    const size = view.getUint32(at + 8, true);
    const offset = view.getUint32(at + 12, true);
    if (offset + size > bytes.length) throw new Error(`Image ${i} runs past the end`);
    out.push({
      width: bytes[at] || 256,
      height: bytes[at + 1] || 256,
      bitCount: view.getUint16(at + 6, true),
      data: bytes.subarray(offset, offset + size),
    });
  }
  return out;
}
