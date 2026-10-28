/**
 * Ordered dithering thresholds (Bayer matrices), shared by the braille
 * output now and the dither effect later (docs/TOOLS.md E4).
 */

/** Bayer matrix of size `n` (2, 4 or 8) as thresholds in (0, 1), row-major. */
export function bayerMatrix(n: 2 | 4 | 8): Float32Array {
  let m: number[] = [0];
  let size = 1;
  while (size < n) {
    const s2 = size * 2;
    const next = new Array<number>(s2 * s2).fill(0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = (m[y * size + x] ?? 0) * 4;
        next[y * s2 + x] = v;
        next[y * s2 + x + size] = v + 2;
        next[(y + size) * s2 + x] = v + 3;
        next[(y + size) * s2 + x + size] = v + 1;
      }
    }
    m = next;
    size = s2;
  }
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = ((m[i] ?? 0) + 0.5) / (n * n);
  return out;
}
