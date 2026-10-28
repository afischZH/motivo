/**
 * Reads the structure of a GIF file without decoding pixels: header, size,
 * frame count, delays and loop count. Pure (no dependencies), used by unit
 * and end-to-end tests to check exported files.
 */

export interface GifInfo {
  /** "GIF87a" or "GIF89a". */
  version: string;
  width: number;
  height: number;
  /** Number of image descriptors (frames). */
  frames: number;
  /** Delay of each frame in milliseconds (graphic control extensions). */
  delays: number[];
  /** NETSCAPE2.0 loop count: 0 = forever; `undefined` = no loop block (plays once). */
  loop?: number;
  /** The file ends with the trailer byte. */
  complete: boolean;
}

/** Parses the block structure. Throws on anything that is not a well-formed GIF. */
export function readGifInfo(bytes: Uint8Array): GifInfo {
  const at = (i: number): number => {
    const v = bytes[i];
    if (v === undefined) throw new Error(`GIF ends early at byte ${i}`);
    return v;
  };
  const u16 = (i: number): number => at(i) | (at(i + 1) << 8);
  const version = String.fromCharCode(...bytes.subarray(0, 6));
  if (version !== "GIF87a" && version !== "GIF89a") throw new Error("Not a GIF");
  const width = u16(6);
  const height = u16(8);
  const packed = at(10);
  let pos = 13;
  if (packed & 0x80) pos += 3 * (1 << ((packed & 0x07) + 1));

  /** Skips data sub-blocks starting at `p`; returns the position after the terminator. */
  const skipSubBlocks = (p: number): number => {
    let q = p;
    for (let size = at(q); size !== 0; size = at(q)) q += size + 1;
    return q + 1;
  };

  const info: GifInfo = { version, width, height, frames: 0, delays: [], complete: false };
  for (;;) {
    const block = at(pos);
    if (block === 0x3b) {
      info.complete = true;
      return info;
    }
    if (block === 0x21) {
      const label = at(pos + 1);
      if (label === 0xf9) info.delays.push(u16(pos + 4) * 10);
      if (label === 0xff && at(pos + 2) === 11) {
        const app = String.fromCharCode(...bytes.subarray(pos + 3, pos + 14));
        if (app === "NETSCAPE2.0" && at(pos + 14) >= 3 && at(pos + 15) === 1) {
          info.loop = u16(pos + 16);
        }
      }
      pos = skipSubBlocks(pos + 2);
      continue;
    }
    if (block === 0x2c) {
      info.frames++;
      const local = at(pos + 9);
      pos += 10;
      if (local & 0x80) pos += 3 * (1 << ((local & 0x07) + 1));
      // LZW minimum code size, then the image data sub-blocks.
      pos = skipSubBlocks(pos + 1);
      continue;
    }
    throw new Error(`Unexpected GIF block 0x${block.toString(16)} at byte ${pos}`);
  }
}
