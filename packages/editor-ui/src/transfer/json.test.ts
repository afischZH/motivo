import { describe, expect, it } from "vitest";
import { packIntoFiles, parseUntrustedJson, partFileName, stringifyEach, utf8Length } from "./json";

const wrap = (part: number, body: string) => `{"part":${part},"items":[${body}]}`;

describe("packIntoFiles", () => {
  it("keeps everything in one file when it fits", () => {
    expect(packIntoFiles(['"a"', '"b"'], wrap, 1_000)).toEqual(['{"part":0,"items":["a","b"]}']);
    expect(packIntoFiles([], wrap, 1_000)).toEqual(['{"part":0,"items":[]}']);
  });

  it("splits so that no file exceeds the limit, counting UTF-8 bytes", () => {
    const items = Array.from({ length: 50 }, (_, i) => JSON.stringify(`ü${"x".repeat(i)}`));
    const max = 200;
    const files = packIntoFiles(items, wrap, max);
    expect(files.length).toBeGreaterThan(1);
    const back: unknown[] = [];
    files.forEach((text, part) => {
      expect(utf8Length(text)).toBeLessThanOrEqual(max);
      const parsed = parseUntrustedJson(text) as { part: number; items: unknown[] };
      expect(parsed.part).toBe(part);
      back.push(...parsed.items);
    });
    expect(back).toEqual(items.map((i) => JSON.parse(i) as unknown));
  });

  it("gives an oversized item a file of its own", () => {
    const files = packIntoFiles(['"a"', `"${"x".repeat(100)}"`, '"b"'], wrap, 50);
    expect(files).toHaveLength(3);
  });
});

describe("stringifyEach", () => {
  it("serialises every value in order", async () => {
    expect(await stringifyEach([1, "a", { b: [true] }])).toEqual(["1", '"a"', '{"b":[true]}']);
  });

  it("gives the event loop a turn between slices of work", async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    // About 4 x 5 MB: well over one slice of work.
    const big = Array.from({ length: 4 }, () => "x".repeat(5_000_000));
    const out = await stringifyEach(big, 1);
    clearInterval(timer);
    expect(out).toHaveLength(4);
    expect(ticks).toBeGreaterThan(0);
  });
});

describe("partFileName", () => {
  it("numbers parts only when there are several", () => {
    expect(partFileName("x", 0, 1)).toBe("x.json");
    expect(partFileName("x", 1, 3)).toBe("x-2.json");
  });
});
