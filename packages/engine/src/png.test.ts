import { describe, expect, it } from "vitest";
import {
  PNG_MAX_EDGE,
  adler32,
  crc32,
  encodePng,
  pngDataUri,
  toBase64,
  zlibStored,
  type RgbaBuffer,
} from "./png";

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const u32 = (b: Uint8Array, o: number): number =>
  (((b[o] as number) << 24) |
    ((b[o + 1] as number) << 16) |
    ((b[o + 2] as number) << 8) |
    (b[o + 3] as number)) >>>
  0;

/** Reads the payload of a zlib stream made of stored blocks only. */
function inflateStored(z: Uint8Array): Uint8Array {
  const out: number[] = [];
  let o = 2;
  for (;;) {
    const final = (z[o] as number) & 1;
    expect((z[o] as number) & 6).toBe(0); // BTYPE stored
    const len = (z[o + 1] as number) | ((z[o + 2] as number) << 8);
    const nlen = (z[o + 3] as number) | ((z[o + 4] as number) << 8);
    expect(len ^ nlen).toBe(0xffff);
    out.push(...z.subarray(o + 5, o + 5 + len));
    o += 5 + len;
    if (final) break;
  }
  const payload = Uint8Array.from(out);
  expect(u32(z, o)).toBe(adler32(payload));
  expect(o + 4).toBe(z.length);
  return payload;
}

/** Splits a PNG into chunks, checking signature and CRCs. */
function chunks(png: Uint8Array): { type: string; data: Uint8Array }[] {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out: { type: string; data: Uint8Array }[] = [];
  for (let o = 8; o < png.length;) {
    const len = u32(png, o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    expect(u32(png, o + 8 + len)).toBe(crc32(png, o + 4, o + 8 + len));
    out.push({ type, data: png.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

function buffer(width: number, height: number, fill: (i: number) => number): RgbaBuffer {
  return {
    width,
    height,
    data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => fill(i)),
  };
}

describe("checksums", () => {
  it("match the standard check values", () => {
    expect(crc32(ascii("123456789"))).toBe(0xcbf43926);
    expect(crc32(ascii("IEND"))).toBe(0xae426082);
    expect(adler32(ascii("Wikipedia"))).toBe(0x11e60398);
    expect(adler32(new Uint8Array(0))).toBe(1);
  });

  it("adler32 stays exact over long inputs", () => {
    const big = new Uint8Array(100_000).fill(255);
    // Reference: a = 1 + n * 255, b = sum of all a, both mod 65521.
    let a = 1;
    let b = 0;
    for (let i = 0; i < big.length; i++) {
      a = (a + 255) % 65521;
      b = (b + a) % 65521;
    }
    expect(adler32(big)).toBe(((b << 16) | a) >>> 0);
  });
});

describe("zlibStored", () => {
  it("round-trips data across several stored blocks", () => {
    const raw = Uint8Array.from({ length: 140_000 }, (_, i) => (i * 7) & 255);
    const z = zlibStored(raw);
    expect(((z[0] as number) << 8) | (z[1] as number)).toBe(0x7801);
    expect(inflateStored(z)).toEqual(raw);
  });

  it("encodes empty input as one final block", () => {
    expect(inflateStored(zlibStored(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });
});

describe("encodePng", () => {
  const img = buffer(3, 2, (i) => (i * 37) & 255);

  it.each([
    ["gray", 0, 1],
    ["rgb", 2, 3],
    ["rgba", 6, 4],
  ] as const)("writes %s rows with filter 0", (type, code, channels) => {
    const parts = chunks(encodePng(img, type));
    expect(parts.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const ihdr = parts[0]?.data ?? new Uint8Array(0);
    expect([u32(ihdr, 0), u32(ihdr, 4), ihdr[8], ihdr[9]]).toEqual([3, 2, 8, code]);
    const raw = inflateStored(parts[1]?.data ?? new Uint8Array(0));
    expect(raw.length).toBe(2 * (3 * channels + 1));
    expect(raw[0]).toBe(0);
    // Second pixel of the second row, first channel.
    expect(raw[3 * channels + 1 + 1 + channels]).toBe(img.data[(3 + 1) * 4]);
    if (type === "rgba") expect(raw[1 + 3]).toBe(img.data[3]);
  });

  it("rejects empty, inconsistent and oversized buffers", () => {
    expect(() => encodePng({ width: 0, height: 1, data: new Uint8ClampedArray(0) })).toThrow(
      RangeError,
    );
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8ClampedArray(4) })).toThrow(
      RangeError,
    );
    expect(() =>
      encodePng({ width: PNG_MAX_EDGE + 1, height: 1, data: new Uint8ClampedArray(0) }),
    ).toThrow(RangeError);
  });
});

describe("toBase64", () => {
  it("matches RFC 4648 test vectors", () => {
    const cases: [string, string][] = [
      ["", ""],
      ["f", "Zg=="],
      ["fo", "Zm8="],
      ["foo", "Zm9v"],
      ["foob", "Zm9vYg=="],
      ["fooba", "Zm9vYmE="],
      ["foobar", "Zm9vYmFy"],
    ];
    for (const [input, expected] of cases) expect(toBase64(ascii(input))).toBe(expected);
  });

  it("covers the whole alphabet and long inputs", () => {
    const bytes = Uint8Array.from({ length: 30_000 }, (_, i) => (i * 131) & 255);
    const out = toBase64(bytes);
    expect(out.length).toBe(40_000);
    expect(out).toMatch(/^[A-Za-z0-9+/]+$/);
    expect(toBase64(Uint8Array.from([0xfb, 0xff]))).toBe("+/8=");
  });
});

describe("pngDataUri", () => {
  it("prefixes the base64 PNG", () => {
    const uri = pngDataUri(
      buffer(1, 1, () => 0),
      "gray",
    );
    expect(uri.startsWith("data:image/png;base64,iVBORw0KGgo")).toBe(true);
  });
});
