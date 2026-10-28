/**
 * Tile math for large shader renders (pure): an output is drawn in tiles
 * of at most `SHADER_TILE_EDGE` px, each with its origin as a uniform, and
 * read back bottom-up (`readPixels`). Rows of tiles become horizontal
 * strips for the streaming PNG encoder.
 */

/** Longest tile edge: small enough for every WebGL2 device (minimum render size 2048). */
export const SHADER_TILE_EDGE = 1024;

/** A rectangle of the output in pixels, origin top left. */
export interface ShaderTile {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One row of tiles: a strip of the output, `y` to `y + height`. */
export interface TileRow {
  y: number;
  height: number;
  tiles: ShaderTile[];
}

/**
 * The output split into rows of tiles, top to bottom, left to right. Every
 * pixel belongs to exactly one tile; tiles are at most `edge` square.
 */
export function planTiles(width: number, height: number, edge = SHADER_TILE_EDGE): TileRow[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`planTiles: invalid size ${width}x${height}`);
  }
  const e = Math.max(1, Math.floor(edge));
  const rows: TileRow[] = [];
  for (let y = 0; y < height; y += e) {
    const h = Math.min(e, height - y);
    const tiles: ShaderTile[] = [];
    for (let x = 0; x < width; x += e)
      tiles.push({ x, y, width: Math.min(e, width - x), height: h });
    rows.push({ y, height: h, tiles });
  }
  return rows;
}

/**
 * Copies a tile read back with `readPixels` (RGBA, bottom row first) into a
 * strip of `stripWidth` px whose top row is the tile's top row (RGBA, top
 * row first), at the tile's x offset.
 */
export function copyTileIntoStrip(
  tilePixels: Uint8Array | Uint8ClampedArray,
  tile: ShaderTile,
  strip: Uint8Array | Uint8ClampedArray,
  stripWidth: number,
): void {
  const rowBytes = tile.width * 4;
  if (tilePixels.length < rowBytes * tile.height) {
    throw new RangeError("copyTileIntoStrip: tile buffer too small");
  }
  for (let r = 0; r < tile.height; r++) {
    const src = (tile.height - 1 - r) * rowBytes;
    const dst = (r * stripWidth + tile.x) * 4;
    strip.set(tilePixels.subarray(src, src + rowBytes), dst);
  }
}

/**
 * Renders an output tile by tile and hands it over in strips (one row of
 * tiles, RGBA, top row first). `drawTile` returns a tile as `readPixels`
 * does (bottom row first). `pause` runs between tiles (yield, abort check);
 * at most one strip exists at a time.
 */
export async function renderInStrips(
  width: number,
  height: number,
  drawTile: (tile: ShaderTile) => Uint8Array | Uint8ClampedArray,
  onStrip: (
    strip: Uint8ClampedArray,
    row: TileRow,
    index: number,
    rows: number,
  ) => Promise<void> | void,
  options: { edge?: number; pause?: () => Promise<void> | void } = {},
): Promise<void> {
  const rows = planTiles(width, height, options.edge);
  for (const [index, row] of rows.entries()) {
    const strip = new Uint8ClampedArray(width * row.height * 4);
    for (const tile of row.tiles) {
      copyTileIntoStrip(drawTile(tile), tile, strip, width);
      await options.pause?.();
    }
    await onStrip(strip, row, index, rows.length);
  }
}

/** Rows of an RGBA buffer flipped in place (bottom-up to top-down). */
export function flipRows(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const rowBytes = width * 4;
  const tmp = new Uint8Array(rowBytes);
  for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
    const a = top * rowBytes;
    const b = bottom * rowBytes;
    tmp.set(pixels.subarray(a, a + rowBytes));
    pixels.copyWithin(a, b, b + rowBytes);
    pixels.set(tmp, b);
  }
}
