/**
 * Starts the brand kit import worker. Kept in its own module so the `new
 * URL(..., import.meta.url)` pattern is only evaluated on the first import.
 */
export function createBrandKitWorker(): Worker {
  return new Worker(new URL("./transfer.worker.ts", import.meta.url), {
    type: "module",
    name: "musterli-brandkit-import",
  });
}
