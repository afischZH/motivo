/**
 * Starts the GIF worker. Kept in its own module so the `new URL(...,
 * import.meta.url)` pattern (understood by webpack, Turbopack and Vite) is
 * only evaluated when a GIF export starts.
 */
export function createGifWorker(): Worker {
  return new Worker(new URL("./gif.worker.ts", import.meta.url), {
    type: "module",
    name: "musterli-gif",
  });
}
