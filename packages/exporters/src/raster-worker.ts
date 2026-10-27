/**
 * Starts the raster worker. Kept in its own module so the `new URL(...,
 * import.meta.url)` pattern (understood by webpack, Turbopack and Vite) is
 * only evaluated when a worker is actually needed.
 */
export function createRasterWorker(): Worker {
  return new Worker(new URL("./raster.worker.ts", import.meta.url), {
    type: "module",
    name: "motivo-raster",
  });
}
