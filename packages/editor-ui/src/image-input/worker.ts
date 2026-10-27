/**
 * Starts the image-input worker. Kept in its own module so the `new URL(...,
 * import.meta.url)` pattern (understood by webpack, Turbopack and Vite) is
 * only evaluated when a tool with an image input is opened.
 */
export function createImageInputWorker(): Worker {
  return new Worker(new URL("./image-input.worker.ts", import.meta.url), {
    type: "module",
    name: "motivo-image-input",
  });
}
