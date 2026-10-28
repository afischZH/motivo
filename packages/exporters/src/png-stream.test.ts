import { zlibStored } from "@motivo/engine";
import { describe, expect, it } from "vitest";
import { decodePng, sameBytes } from "./__fixtures__/png-decode";
import {
  compressionStreamDeflate,
  filterScanline,
  PngStreamEncoder,
  type DeflateFactory,
} from "./png-stream";

/** Deterministic RGBA test image with smooth areas, edges and translucency. */
function image(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 3 + y) & 255;
      data[i + 1] = x < width / 2 ? 200 : 20;
      data[i + 2] = (x * y) % 251;
      data[i + 3] = y % 5 === 0 ? 128 : 255;
    }
  }
  return data;
}

async function encodeInStrips(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  rowsPerStrip: number,
  deflate?: DeflateFactory,
): Promise<Uint8Array> {
  const encoder = new PngStreamEncoder(width, height, deflate);
  for (let y = 0; y < height; y += rowsPerStrip) {
    const rows = Math.min(rowsPerStrip, height - y);
    // A fresh copy per strip, as getImageData returns.
    await encoder.addRows(data.slice(y * width * 4, (y + rows) * width * 4), rows);
  }
  return new Uint8Array(await new Blob(await encoder.finish()).arrayBuffer());
}

/** Uncompressed ("stored") zlib, buffering everything: a second deflate implementation. */
const storedDeflate: DeflateFactory = (onOutput) => {
  const parts: Uint8Array[] = [];
  return {
    write(bytes) {
      parts.push(bytes.slice());
      return Promise.resolve();
    },
    close() {
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0;
      for (const p of parts) {
        all.set(p, o);
        o += p.length;
      }
      onOutput(zlibStored(all));
      return Promise.resolve();
    },
  };
};

describe("PngStreamEncoder", () => {
  it("round-trips an image given in uneven strips (CompressionStream)", async () => {
    const [w, h] = [37, 23];
    const data = image(w, h);
    const png = await decodePng(await encodeInStrips(data, w, h, 5));
    expect(png).toMatchObject({ width: w, height: h });
    expect(png.chunks[0]).toBe("IHDR");
    expect(png.chunks.at(-1)).toBe("IEND");
    expect(sameBytes(png.data, data)).toBe(true);
  });

  it("gives the same pixels for any strip height and deflate implementation", async () => {
    const [w, h] = [16, 12];
    const data = image(w, h);
    for (const rows of [1, 4, 12]) {
      const viaStream = await decodePng(
        await encodeInStrips(data, w, h, rows, compressionStreamDeflate),
      );
      const viaStored = await decodePng(await encodeInStrips(data, w, h, rows, storedDeflate));
      expect(sameBytes(viaStream.data, data)).toBe(true);
      expect(sameBytes(viaStored.data, data)).toBe(true);
    }
  });

  it("compresses smooth images well and uses predictive filters", async () => {
    const [w, h] = [256, 64];
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([i % w, (i / w) | 0, 128, 255], i * 4);
    const bytes = await encodeInStrips(data, w, h, 16);
    expect(bytes.length).toBeLessThan(data.length / 20);
    const png = await decodePng(bytes);
    expect(png.filters.some((f) => f !== 0)).toBe(true);
    expect(sameBytes(png.data, data)).toBe(true);
  });

  it("rejects wrong sizes, too many rows and finishing early", async () => {
    expect(() => new PngStreamEncoder(0, 1)).toThrow(RangeError);
    const encoder = new PngStreamEncoder(2, 2, storedDeflate);
    await expect(encoder.addRows(new Uint8ClampedArray(8), 2)).rejects.toThrow(/not enough data/);
    await expect(encoder.addRows(new Uint8ClampedArray(24), 3)).rejects.toThrow(/exceed/);
    await encoder.addRows(new Uint8ClampedArray(8), 1);
    await expect(encoder.finish()).rejects.toThrow(/1 of 2 rows/);
  });
});

describe("filterScanline", () => {
  it("picks Sub for a horizontal ramp and Up for a repeated row", () => {
    const ramp = Uint8Array.from({ length: 64 }, (_, i) => (i >> 2) * 9);
    const out = new Uint8Array(65);
    expect(filterScanline(ramp, new Uint8Array(64), out, 0)).toBe(1);
    const noisy = Uint8Array.from({ length: 64 }, (_, i) => (i * 97) % 256);
    expect(filterScanline(noisy, noisy, out, 0)).toBe(2);
    expect(out.subarray(1).every((v) => v === 0)).toBe(true);
  });
});
