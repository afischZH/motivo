/**
 * Starts the raster-effect worker. Kept in its own module so the `new URL(...,
 * import.meta.url)` pattern (understood by webpack, Turbopack and Vite) is
 * only evaluated when an image-effect tool is shown.
 */
export function createRasterEffectWorker(): Worker {
  return new Worker(new URL("./raster-effect.worker.ts", import.meta.url), {
    type: "module",
    name: "musterli-raster-effect",
  });
}
