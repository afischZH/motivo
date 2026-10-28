/**
 * Pixel buffers: the structural subset of `ImageData` every effect reads and
 * writes (`width`, `height`, RGBA bytes, row-major, not premultiplied). Plain
 * objects, so effects run in workers, on the main thread and in Node tests.
 */

export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** A transparent buffer of `width` × `height` pixels (both rounded, at least 1). */
export function createPixelBuffer(width: number, height: number): PixelBuffer {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}

/** Whether `buffer` is well-formed: positive integer size and `width × height × 4` bytes. */
export function isPixelBuffer(buffer: PixelBuffer): boolean {
  return (
    Number.isInteger(buffer.width) &&
    Number.isInteger(buffer.height) &&
    buffer.width > 0 &&
    buffer.height > 0 &&
    buffer.data.length === buffer.width * buffer.height * 4
  );
}

/**
 * Short, stable digest of a buffer (FNV-1a over size and bytes), for
 * snapshot tests of effects without storing megabytes of pixels.
 */
export function pixelDigest(buffer: PixelBuffer): string {
  let h = 0x811c9dc5;
  const mix = (byte: number) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193);
  };
  for (const v of [buffer.width, buffer.height]) {
    mix(v & 255);
    mix((v >>> 8) & 255);
  }
  const d = buffer.data;
  for (let i = 0; i < d.length; i++) mix(d[i] ?? 0);
  return `${buffer.width}x${buffer.height}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Part of a `sw` × `sh` source that covers a `dw` × `dh` target without
 * distortion (CSS `object-fit: cover`, centred), in source pixels.
 */
export function coverRect(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(dw / sw, dh / sh);
  const width = Math.min(sw, dw / scale);
  const height = Math.min(sh, dh / scale);
  return { x: (sw - width) / 2, y: (sh - height) / 2, width, height };
}

/**
 * Stretches `src` to `width` × `height` with nearest-neighbour sampling
 * (hard pixel edges, e.g. a dither grid enlarged to the output). Pure.
 */
export function resizeNearest(src: PixelBuffer, width: number, height: number): PixelBuffer {
  const out = createPixelBuffer(width, height);
  if (out.width === src.width && out.height === src.height) {
    out.data.set(src.data);
    return out;
  }
  const s = new Uint32Array(src.data.buffer, src.data.byteOffset, src.width * src.height);
  const d = new Uint32Array(out.data.buffer, out.data.byteOffset, out.width * out.height);
  const xs = new Uint32Array(out.width);
  for (let x = 0; x < out.width; x++) {
    xs[x] = Math.min(src.width - 1, Math.floor(((x + 0.5) * src.width) / out.width));
  }
  for (let y = 0; y < out.height; y++) {
    const sy = Math.min(src.height - 1, Math.floor(((y + 0.5) * src.height) / out.height));
    const row = sy * src.width;
    const o = y * out.width;
    for (let x = 0; x < out.width; x++) d[o + x] = s[row + (xs[x] ?? 0)] ?? 0;
  }
  return out;
}

/**
 * Scales an effect grid to the output: nearest neighbour when enlarging
 * (crisp pixels), box filter when shrinking (a small preview shows the
 * mean, like any downscaled image).
 */
export function scaleGrid(src: PixelBuffer, width: number, height: number): PixelBuffer {
  return width >= src.width && height >= src.height
    ? resizeNearest(src, width, height)
    : resizeCover(src, width, height);
}

/**
 * Resamples `src` to `width` × `height` with `coverRect` (box filter when
 * shrinking, nearest sample when enlarging). Pure and deterministic; the
 * browser draws with a canvas instead, this one serves Node (static motifs,
 * tests).
 */
export function resizeCover(src: PixelBuffer, width: number, height: number): PixelBuffer {
  const out = createPixelBuffer(width, height);
  const rect = coverRect(src.width, src.height, out.width, out.height);
  const sx = rect.width / out.width;
  const sy = rect.height / out.height;
  const d = out.data;
  const s = src.data;
  for (let y = 0; y < out.height; y++) {
    const y0 = rect.y + y * sy;
    const ya = Math.min(src.height - 1, Math.floor(y0));
    const yb = Math.max(ya + 1, Math.min(src.height, Math.ceil(y0 + sy)));
    for (let x = 0; x < out.width; x++) {
      const x0 = rect.x + x * sx;
      const xa = Math.min(src.width - 1, Math.floor(x0));
      const xb = Math.max(xa + 1, Math.min(src.width, Math.ceil(x0 + sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = ya; yy < yb; yy++) {
        let i = (yy * src.width + xa) * 4;
        for (let xx = xa; xx < xb; xx++, i += 4) {
          r += s[i] ?? 0;
          g += s[i + 1] ?? 0;
          b += s[i + 2] ?? 0;
          a += s[i + 3] ?? 0;
        }
      }
      const n = (yb - ya) * (xb - xa);
      const o = (y * out.width + x) * 4;
      d[o] = r / n;
      d[o + 1] = g / n;
      d[o + 2] = b / n;
      d[o + 3] = a / n;
    }
  }
  return out;
}
