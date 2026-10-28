/**
 * Pixel comparison of two PNGs inside the page under test (M1-AP12, shared
 * since M4b-AP07): anti-aliased edges and one-pixel shifts are told apart
 * from missing, moved or recoloured shapes.
 */
import type { Page } from "@playwright/test";

export interface DiffResult {
  width: number;
  height: number;
  diffRatio: number;
  /** Share of differing pixels not explained by the other image's 3 × 3 neighbourhood (both directions). */
  strayRatio: number;
  meanDiff: number;
  /** Mean channel difference without the anti-aliasing-only pixels (catches global colour shifts). */
  meanDiffOffEdges: number;
  /** Diff image (red = differing pixel) as a PNG data URL, for the report. */
  diffPng: string;
}

/** Decodes both PNGs in the page and compares them pixel by pixel. */
export async function comparePngs(
  page: Page,
  a: Buffer,
  b: Buffer,
  tolerance: number,
): Promise<DiffResult> {
  return page.evaluate(
    async ({ a64, b64, tolerance }) => {
      const decode = async (b64: string) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [x, y] = await Promise.all([decode(a64), decode(b64)]);
      if (x.width !== y.width || x.height !== y.height) {
        throw new Error(`size mismatch: ${x.width}x${x.height} vs ${y.width}x${y.height}`);
      }
      const w = x.width;
      const h = x.height;
      /**
       * Whether pixel (px, py) of `p` is explained by the 3 × 3 neighbourhood
       * of `q`: every channel lies within that neighbourhood's range (plus
       * tolerance). An anti-aliased edge pixel is a blend of its neighbours,
       * so it passes whether the other image is smoother, harder or shifted by
       * up to one pixel. Inside a missing, recoloured or moved shape the whole
       * neighbourhood has other colours, so those pixels fail.
       */
      const explainedBy = (p: ImageData, q: ImageData, px: number, py: number) => {
        const i = (py * w + px) * 4;
        for (let c = 0; c < 3; c++) {
          let lo = 255;
          let hi = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const qx = px + dx;
              const qy = py + dy;
              if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
              const v = q.data[(qy * w + qx) * 4 + c] ?? 0;
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          }
          const v = p.data[i + c] ?? 0;
          if (v < lo - tolerance || v > hi + tolerance) return false;
        }
        return true;
      };
      const out = new ImageData(w, h);
      let differing = 0;
      let stray = 0;
      let sum = 0;
      let edgeSum = 0;
      let edgePixels = 0;
      for (let i = 0; i < x.data.length; i += 4) {
        let max = 0;
        let pixelSum = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs((x.data[i + c] ?? 0) - (y.data[i + c] ?? 0));
          pixelSum += d;
          if (d > max) max = d;
        }
        sum += pixelSum;
        const bad = max > tolerance;
        let isStray = false;
        if (bad) {
          differing++;
          const px = (i / 4) % w;
          const py = Math.floor(i / 4 / w);
          isStray = !explainedBy(x, y, px, py) || !explainedBy(y, x, px, py);
          if (isStray) stray++;
          else {
            edgeSum += pixelSum;
            edgePixels++;
          }
        }
        // Red: not explained by the neighbourhood; yellow: edge/anti-aliasing only.
        out.data[i] = bad ? 255 : (x.data[i] ?? 0) / 4;
        out.data[i + 1] = bad ? (isStray ? 0 : 200) : (x.data[i + 1] ?? 0) / 4;
        out.data[i + 2] = bad ? 0 : (x.data[i + 2] ?? 0) / 4;
        out.data[i + 3] = 255;
      }
      const canvas = document.createElement("canvas");
      canvas.width = x.width;
      canvas.height = x.height;
      canvas.getContext("2d")?.putImageData(out, 0, 0);
      const pixels = x.width * x.height;
      return {
        width: x.width,
        height: x.height,
        diffRatio: differing / pixels,
        strayRatio: stray / pixels,
        meanDiff: sum / (pixels * 3),
        meanDiffOffEdges: (sum - edgeSum) / Math.max(1, (pixels - edgePixels) * 3),
        diffPng: canvas.toDataURL("image/png"),
      };
    },
    { a64: a.toString("base64"), b64: b.toString("base64"), tolerance },
  );
}
