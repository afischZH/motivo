/**
 * Decodes, resizes and encodes images off the main thread with
 * `createImageBitmap` and `OffscreenCanvas`. The bytes were sniffed before
 * they arrive; nothing is ever fetched or evaluated.
 */
import {
  MAX_IMAGE_EDGE,
  OUTPUT_MIME,
  encoderQuality,
  targetSize,
  type ImageConvertSettings,
} from "./image-convert";

export type ImageConvertRequest = {
  requestId: number;
  bytes: ArrayBuffer;
  mime: string;
  settings: ImageConvertSettings;
};

export type ImageConvertFailure = "decodeFailed" | "tooManyPixels" | "encodeFailed";

export type ImageConvertResponse =
  | {
      requestId: number;
      ok: true;
      blob: Blob;
      width: number;
      height: number;
      sourceWidth: number;
      sourceHeight: number;
    }
  | { requestId: number; ok: false; error: ImageConvertFailure };

/** The part of DedicatedWorkerGlobalScope we use (the app compiles against the DOM lib). */
type WorkerScope = {
  onmessage: ((event: MessageEvent<ImageConvertRequest>) => void) | null;
  postMessage: (message: ImageConvertResponse) => void;
};

const scope = self as unknown as WorkerScope;

async function convert(request: ImageConvertRequest): Promise<ImageConvertResponse> {
  const { requestId, settings } = request;
  const source = new Blob([request.bytes], { type: request.mime });
  let probe: ImageBitmap;
  try {
    probe = await createImageBitmap(source);
  } catch {
    return { requestId, ok: false, error: "decodeFailed" };
  }
  const sourceWidth = probe.width;
  const sourceHeight = probe.height;
  if (Math.max(sourceWidth, sourceHeight) > MAX_IMAGE_EDGE) {
    probe.close();
    return { requestId, ok: false, error: "tooManyPixels" };
  }
  const { width, height } = targetSize(sourceWidth, sourceHeight, settings.maxEdge);
  let bitmap = probe;
  if (width !== sourceWidth || height !== sourceHeight) {
    probe.close();
    try {
      bitmap = await createImageBitmap(source, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
      });
    } catch {
      return { requestId, ok: false, error: "decodeFailed" };
    }
  }

  const mime = OUTPUT_MIME[settings.format];
  try {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { requestId, ok: false, error: "encodeFailed" };
    if (settings.format === "jpeg") {
      ctx.fillStyle = settings.matte;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0);
    const quality = encoderQuality(settings);
    const blob = await canvas.convertToBlob(
      quality === undefined ? { type: mime } : { type: mime, quality },
    );
    // Browsers fall back to PNG for types they cannot encode.
    if (blob.type !== mime) return { requestId, ok: false, error: "encodeFailed" };
    return { requestId, ok: true, blob, width, height, sourceWidth, sourceHeight };
  } catch {
    return { requestId, ok: false, error: "encodeFailed" };
  } finally {
    bitmap.close();
  }
}

// One image at a time keeps memory flat for large batches.
let queue: Promise<void> = Promise.resolve();
scope.onmessage = (event) => {
  const request = event.data;
  queue = queue.then(async () => scope.postMessage(await convert(request)));
};
