/**
 * Starts the import worker. Kept in its own module so the `new URL(...,
 * import.meta.url)` pattern is only evaluated on the first import.
 */
export function createTransferWorker(): Worker {
  return new Worker(new URL("./transfer.worker.ts", import.meta.url), {
    type: "module",
    name: "musterli-designs-import",
  });
}
