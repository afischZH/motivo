/**
 * Shader worker: draws WebGL tools on an `OffscreenCanvas` with the WebGL2
 * runtime of `@musterli/shaders`, off the main thread. Started by
 * `createShaderWorker` (worker.ts); the protocol and the handler live in
 * protocol.ts (docs/ARCHITECTURE.md 4.15).
 */
import { createShaderRuntime, type ShaderRuntime } from "@musterli/shaders/runtime";
import { registry } from "@musterli/tool-registry";
import {
  createShaderHandler,
  type ShaderComposer,
  type ShaderRenderRequest,
  type ShaderRenderResponse,
  type ShaderRuntimeLike,
} from "./protocol";

/** The part of `DedicatedWorkerGlobalScope` used here (the package compiles with the DOM lib). */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ShaderRenderRequest>) => void,
  ): void;
  postMessage(message: ShaderRenderResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const supported =
  typeof OffscreenCanvas === "function" &&
  typeof OffscreenCanvas.prototype.transferToImageBitmap === "function" &&
  typeof OffscreenCanvas.prototype.convertToBlob === "function";

function createRuntime(): ShaderRuntimeLike | null {
  if (!supported) return null;
  try {
    return createShaderRuntime(new OffscreenCanvas(1, 1));
  } catch {
    return null;
  }
}

function createComposer(width: number, height: number): ShaderComposer {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  return {
    putStrip(strip, y, rows) {
      ctx.putImageData(new ImageData(strip as Uint8ClampedArray<ArrayBuffer>, width, rows), 0, y);
    },
    async encode(options) {
      const blob = await canvas.convertToBlob(
        options.quality === undefined
          ? { type: options.mime }
          : { type: options.mime, quality: options.quality },
      );
      if (blob.type !== options.mime) throw new Error(`Encoded ${blob.type}, not ${options.mime}`);
      return blob;
    },
    dispose() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

const handle = createShaderHandler({
  createRuntime,
  snapshot: (runtime) =>
    Promise.resolve(((runtime as ShaderRuntime).canvas as OffscreenCanvas).transferToImageBitmap()),
  createComposer,
  lookup: (id) => registry.get(id),
  progress: (id, fraction) => scope.postMessage({ id, progress: fraction }),
});

scope.addEventListener("message", (event) => {
  void handle(event.data).then((reply) => {
    scope.postMessage(reply, "ok" in reply && reply.ok && "bitmap" in reply ? [reply.bitmap] : []);
  });
});
