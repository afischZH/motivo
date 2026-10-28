import { crc32, encodePng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { encodeIco, readIco } from "./ico";
import {
  createZip,
  dosDateTime,
  isSafeZipPath,
  rawDeflateSupported,
  readZip,
  zipBlob,
  type ZipEntry,
} from "./zip";

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function build(entries: ZipEntry[], compress = true): Promise<Uint8Array> {
  const parts = await createZip(entries, { compress });
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Round trip: every entry is found with its name, CRC, size and bytes. */
async function roundTrip(entries: ZipEntry[], compress = true) {
  const zip = await build(entries, compress);
  const records = readZip(zip);
  expect(records.map((r) => r.path)).toEqual(entries.map((e) => e.path));
  for (const [i, r] of records.entries()) {
    const original = (entries[i] as ZipEntry).data;
    const data = r.method === 8 ? await inflateRaw(r.data) : r.data;
    expect(r.size).toBe(original.length);
    expect(r.crc).toBe(crc32(original));
    expect(crc32(data)).toBe(r.crc);
    expect([...data]).toEqual([...original]);
  }
  return { zip, records };
}

describe("createZip", () => {
  it("writes a valid archive that reads back entry by entry", async () => {
    const png = encodePng({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(200) });
    await roundTrip([
      { path: "site.webmanifest", data: text(`{"name":"${"Musterli ".repeat(40)}"}`) },
      { path: "icons/icon-16.png", data: png },
      { path: "empty.txt", data: new Uint8Array(0) },
      { path: "grüezi.txt", data: text("Grüezi mitenand") },
    ]);
  });

  it("deflates entries that shrink and stores the rest", async () => {
    expect(rawDeflateSupported()).toBe(true);
    const random = Uint8Array.from({ length: 64 }, (_, i) => (i * 97 + 13) % 251);
    const { records } = await roundTrip([
      { path: "repeat.txt", data: text("a".repeat(2000)) },
      { path: "noise.bin", data: random },
    ]);
    expect(records[0]?.method).toBe(8);
    expect(records[0]?.compressedSize).toBeLessThan(100);
    expect(records[1]?.method).toBe(0);
  });

  it("stores everything without compression", async () => {
    const { records } = await roundTrip([{ path: "a.txt", data: text("a".repeat(500)) }], false);
    expect(records[0]?.method).toBe(0);
    expect(records[0]?.compressedSize).toBe(500);
  });

  it("is reproducible with the default timestamp and sets the UTF-8 flag", async () => {
    const entries = [{ path: "ä.txt", data: text("x") }];
    const a = await build(entries);
    const b = await build(entries);
    expect([...a]).toEqual([...b]);
    const view = new DataView(a.buffer);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    expect(view.getUint16(12, true)).toBe((1 << 5) | 1); // 1980-01-01
  });

  it("rejects unsafe and duplicate paths", async () => {
    for (const path of ["", "/abs.txt", "../up.txt", "a/../b", "a\\b", "dir/", "a\u0000b"]) {
      expect(isSafeZipPath(path)).toBe(false);
      await expect(createZip([{ path, data: text("x") }])).rejects.toMatchObject({
        code: "encode-failed",
      });
    }
    await expect(
      createZip([
        { path: "a.txt", data: text("1") },
        { path: "a.txt", data: text("2") },
      ]),
    ).rejects.toMatchObject({ code: "encode-failed" });
  });

  it("returns an application/zip Blob", async () => {
    const blob = await zipBlob([{ path: "a.txt", data: text("x") }]);
    expect(blob.type).toBe("application/zip");
    expect(readZip(new Uint8Array(await blob.arrayBuffer()))).toHaveLength(1);
  });
});

describe("dosDateTime", () => {
  it("packs local time fields and clamps early dates", () => {
    expect(dosDateTime(new Date(2026, 9, 28, 17, 34, 59))).toEqual({
      time: (17 << 11) | (34 << 5) | 29,
      date: (46 << 9) | (10 << 5) | 28,
    });
    expect(dosDateTime(new Date(1970, 0, 1))).toEqual({ time: 0, date: 33 });
  });
});

describe("encodeIco", () => {
  const png = (edge: number) =>
    encodePng({
      width: edge,
      height: edge,
      data: new Uint8ClampedArray(edge * edge * 4).fill(128),
    });

  it("writes a directory with PNG entries that reads back", () => {
    const images = [16, 32, 48, 256].map((edge) => ({ width: edge, height: edge, png: png(edge) }));
    const ico = encodeIco(images);
    const entries = readIco(ico);
    expect(entries.map((e) => [e.width, e.height, e.bitCount])).toEqual([
      [16, 16, 32],
      [32, 32, 32],
      [48, 48, 32],
      [256, 256, 32],
    ]);
    for (const [i, e] of entries.entries()) {
      expect([...e.data]).toEqual([...(images[i]?.png ?? [])]);
    }
    // 256 px is stored as 0 in the directory.
    expect(ico[6 + 16 * 3]).toBe(0);
    expect(ico.length).toBe(6 + 16 * 4 + images.reduce((n, i) => n + i.png.length, 0));
  });

  it("rejects bad sizes, non-PNG data and empty icons", () => {
    expect(() => encodeIco([])).toThrow();
    expect(() => encodeIco([{ width: 300, height: 300, png: png(1) }])).toThrow();
    expect(() => encodeIco([{ width: 16, height: 16, png: new Uint8Array(16) }])).toThrow();
  });
});
