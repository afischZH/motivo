/**
 * Starts the SVG sanitize worker. Kept in its own module so the `new URL(...,
 * import.meta.url)` pattern is only evaluated on the first SVG upload.
 */
export function createSanitizeWorker(): Worker {
  return new Worker(new URL("./sanitize.worker.ts", import.meta.url), {
    type: "module",
    name: "musterli-svg-sanitize",
  });
}
