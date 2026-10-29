import { describe, expect, it } from "vitest";
import { copyTileIntoStrip, flipRows, planTiles, renderInStrips, type ShaderTile } from "./tiles";

describe("planTiles", () => {
  it("covers every pixel exactly once with tiles of at most `edge`", () => {
    for (const [w, h, edge] of [
      [1, 1, 1024],
      [2500, 1100, 1024],
      [7680, 4320, 1024],
      [8192, 16, 1024],
      [5, 7, 2],
    ] as const) {
      const rows = planTiles(w, h, edge);
      let area = 0;
      let y = 0;
      for (const row of rows) {
        expect(row.y).toBe(y);
        let x = 0;
        for (const t of row.tiles) {
          expect(t.x).toBe(x);
          expect(t.y).toBe(row.y);
          expect(t.height).toBe(row.height);
          expect(t.width).toBeLessThanOrEqual(edge);
          expect(t.height).toBeLessThanOrEqual(edge);
          area += t.width * t.height;
          x += t.width;
        }
        expect(x).toBe(w);
        y += row.height;
      }
      expect(y).toBe(h);
      expect(area).toBe(w * h);
    }
  });

  it("rejects invalid sizes", () => {
    expect(() => planTiles(0, 10)).toThrow(RangeError);
    expect(() => planTiles(10.5, 10)).toThrow(RangeError);
  });
});

/** A fake "GPU": pixel value = global coordinates, returned bottom row first. */
function fakeTile(tile: ShaderTile, width: number): Uint8Array {
  const out = new Uint8Array(tile.width * tile.height * 4);
  for (let r = 0; r < tile.height; r++) {
    const y = tile.y + (tile.height - 1 - r);
    for (let c = 0; c < tile.width; c++) {
      const i = (r * tile.width + c) * 4;
      const index = y * width + tile.x + c;
      out[i] = index & 255;
      out[i + 1] = (index >> 8) & 255;
      out[i + 2] = (index >> 16) & 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

describe("strips", () => {
  it("copyTileIntoStrip flips a bottom-up tile into place", () => {
    const tile = { x: 1, y: 0, width: 2, height: 2 };
    const strip = new Uint8Array(4 * 2 * 4);
    copyTileIntoStrip(fakeTile(tile, 4), tile, strip, 4);
    // Top row of the tile: global pixels 1 and 2; bottom row: 5 and 6.
    expect(strip[1 * 4]).toBe(1);
    expect(strip[2 * 4]).toBe(2);
    expect(strip[(4 + 1) * 4]).toBe(5);
    expect(strip[(4 + 2) * 4]).toBe(6);
    expect(strip[0]).toBe(0);
    expect(() => copyTileIntoStrip(new Uint8Array(4), tile, strip, 4)).toThrow(RangeError);
  });

  it("renderInStrips assembles the whole image top to bottom", async () => {
    const width = 37;
    const height = 23;
    const image = new Uint8Array(width * height * 4);
    const drawn: ShaderTile[] = [];
    let pauses = 0;
    await renderInStrips(
      width,
      height,
      (tile) => {
        drawn.push(tile);
        return fakeTile(tile, width);
      },
      (strip, row, index, rows) => {
        expect(rows).toBe(3);
        expect(index).toBe(Math.floor(row.y / 10));
        image.set(strip, row.y * width * 4);
      },
      { edge: 10, pause: () => void pauses++ },
    );
    expect(drawn.length).toBe(4 * 3);
    expect(pauses).toBe(drawn.length);
    for (let i = 0; i < width * height; i++) {
      const v =
        (image[i * 4] ?? 0) | ((image[i * 4 + 1] ?? 0) << 8) | ((image[i * 4 + 2] ?? 0) << 16);
      expect(v).toBe(i);
    }
  });

  it("flipRows reverses the row order in place", () => {
    const px = Uint8Array.from({ length: 3 * 4 }, (_, i) => Math.floor(i / 4));
    flipRows(px, 1, 3);
    expect([...px].filter((_, i) => i % 4 === 0)).toEqual([2, 1, 0]);
  });
});
