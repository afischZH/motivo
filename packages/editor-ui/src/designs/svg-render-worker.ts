/**
 * Starts the SVG render worker. Kept in its own module so the `new URL(...,
 * import.meta.url)` pattern is only evaluated on the first import.
 */
export function createSvgRenderWorker(): Worker {
  return new Worker(new URL("./svg-render.worker.ts", import.meta.url), {
    type: "module",
    name: "musterli-svg-render",
  });
}
