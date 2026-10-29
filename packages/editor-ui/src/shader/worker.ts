/**
 * Starts the shader worker. Kept in its own module so the `new URL(...,
 * import.meta.url)` pattern (understood by webpack, Turbopack and Vite) is
 * only evaluated when a WebGL tool is shown.
 */
export function createShaderWorker(): Worker {
  return new Worker(new URL("./shader.worker.ts", import.meta.url), {
    type: "module",
    name: "musterli-shader",
  });
}
