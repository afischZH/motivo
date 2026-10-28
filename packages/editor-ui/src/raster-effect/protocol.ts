/**
 * Messages between the editor and the raster-effect worker, plus the
 * worker's request handler with its browser APIs injected, so it is
 * unit-testable (docs/ARCHITECTURE.md 4.13). The worker keeps the decoded
 * photo and the generated sample between requests; the main thread only
 * sends the photo's data URI the first time (or after a worker restart).
 */
import {
  coverRect,
  photoSampleSize,
  renderImageEffect,
  type AnyToolDefinition,
  type CanvasSize,
  type PixelBuffer,
} from "@musterli/tool-registry";

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

/** Encoded output of an export. */
export interface EffectEncodeOptions {
  mime: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
  /** CSS colour filled under the picture (JPG), absent: none. */
  background?: string;
}

export interface EffectRenderRequest {
  id: number;
  toolId: string;
  /** Params with the photo param set to `null` (the photo travels in `photo`). */
  params: Values;
  seed: number;
  /** Design size (the render context). */
  design: CanvasSize;
  /** Output pixels. */
  out: CanvasSize;
  /** The user's photo by key; `href` only when the worker may not have it yet. */
  photo: { key: string; href?: string } | null;
  /** Absent: an `ImageBitmap` for the preview. */
  encode?: EffectEncodeOptions;
}

export type EffectWorkerError =
  /** The worker does not hold the photo (send `href`). */
  | "missing-photo"
  | "decode-failed"
  | "unknown-tool"
  /** No `OffscreenCanvas` or `createImageBitmap` in this worker. */
  | "unsupported"
  | "render-failed";

export type EffectRenderResponse =
  | { id: number; ok: true; bitmap: ImageBitmap }
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; error: EffectWorkerError };

/** Decoded picture: `ImageBitmap` in a browser, a fake in tests. */
export interface EffectBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/** The browser APIs the handler uses. */
export interface EffectWorkerEnv {
  /** `null` where `createImageBitmap` or `OffscreenCanvas` is missing. */
  decode: ((bytes: Uint8Array, mime: string) => Promise<EffectBitmap>) | null;
  /** Draws `crop` of the bitmap scaled to `out` (high-quality smoothing) and reads the pixels. */
  readCover(
    bitmap: EffectBitmap,
    crop: { x: number; y: number; width: number; height: number },
    out: CanvasSize,
  ): PixelBuffer;
  /** Pixels to a bitmap: the preview result (transferred), and the sample as a source. */
  toBitmap(pixels: PixelBuffer): Promise<ImageBitmap>;
  /** Pixels to an encoded file (export). */
  encode(pixels: PixelBuffer, options: EffectEncodeOptions): Promise<Blob>;
  lookup(toolId: string): AnyToolDefinition | undefined;
}

/** Photos kept decoded (the current one, plus one for a quick undo). */
export const EFFECT_PHOTO_CACHE = 2;
/** Generated samples kept (preview size plus thumbnails of another size). */
export const EFFECT_SAMPLE_CACHE = 3;

/** Bytes and type of a base64 `data:` URI, or `null` if it is not one. */
export function decodeDataUri(href: string): { bytes: Uint8Array; mime: string } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,/.exec(href);
  if (!match?.[1]) return null;
  let binary: string;
  try {
    binary = atob(href.slice(match[0].length));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime: match[1] };
}

/** Small LRU of promises; evicted entries are passed to `dispose`. */
class Lru<V> {
  private readonly map = new Map<string, V>();
  constructor(
    private readonly limit: number,
    private readonly dispose?: (value: V) => void,
  ) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (hit !== undefined) {
      this.map.delete(key);
      this.map.set(key, hit);
    }
    return hit;
  }
  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      const evicted = this.map.get(oldest.value);
      this.map.delete(oldest.value);
      if (evicted !== undefined) this.dispose?.(evicted);
    }
  }
  delete(key: string): void {
    this.map.delete(key);
  }
}

/** Handles requests one at a time (keeps memory flat with 12 MP photos). */
export function createEffectHandler(env: EffectWorkerEnv) {
  const photos = new Lru<Promise<EffectBitmap | null>>(EFFECT_PHOTO_CACHE, (p) => {
    void p.then((bitmap) => bitmap?.close());
  });
  // The sample becomes a bitmap once, so it is scaled exactly like a photo
  // (canvas smoothing, also when an export enlarges it).
  const samples = new Lru<Promise<EffectBitmap | null>>(EFFECT_SAMPLE_CACHE, (p) => {
    void p.then((bitmap) => bitmap?.close());
  });
  let queue: Promise<unknown> = Promise.resolve();

  const photoBitmap = (
    photo: NonNullable<EffectRenderRequest["photo"]>,
  ): Promise<EffectBitmap | null> | "missing" => {
    const cached = photos.get(photo.key);
    if (cached) return cached;
    if (photo.href === undefined) return "missing";
    const parsed = decodeDataUri(photo.href);
    const decode = env.decode;
    const pending =
      parsed && decode
        ? decode(parsed.bytes, parsed.mime).catch(() => null)
        : Promise.resolve(null);
    photos.set(photo.key, pending);
    void pending.then((bitmap) => {
      if (!bitmap) photos.delete(photo.key);
    });
    return pending;
  };

  const sampleFor = (
    tool: AnyToolDefinition,
    design: CanvasSize,
  ): Promise<EffectBitmap | null> | null => {
    const source = tool.photoSource;
    if (!source) return null;
    const size = photoSampleSize(design);
    const key = `${tool.id}@${tool.version}:${size.width}x${size.height}`;
    let sample = samples.get(key);
    if (!sample) {
      sample = env.toBitmap(source.sample(size.width, size.height)).catch(() => null);
      samples.set(key, sample);
      void sample.then((bitmap) => {
        if (!bitmap) samples.delete(key);
      });
    }
    return sample;
  };

  const run = async (request: EffectRenderRequest): Promise<EffectRenderResponse> => {
    const { id } = request;
    const tool = env.lookup(request.toolId);
    if (!tool) return { id, ok: false, error: "unknown-tool" };
    if (!env.decode) return { id, ok: false, error: "unsupported" };
    let pending: Promise<EffectBitmap | null>;
    if (request.photo) {
      const bitmap = photoBitmap(request.photo);
      if (bitmap === "missing") return { id, ok: false, error: "missing-photo" };
      pending = bitmap;
    } else {
      const sample = sampleFor(tool, request.design);
      if (!sample) return { id, ok: false, error: "unknown-tool" };
      pending = sample;
    }
    const decoded = await pending;
    if (!decoded) return { id, ok: false, error: "decode-failed" };
    try {
      const crop = coverRect(decoded.width, decoded.height, request.out.width, request.out.height);
      const source = env.readCover(decoded, crop, request.out);
      const pixels = renderImageEffect(
        tool,
        request.params,
        request.seed,
        request.design,
        request.out,
        source,
      );
      return request.encode
        ? { id, ok: true, blob: await env.encode(pixels, request.encode) }
        : { id, ok: true, bitmap: await env.toBitmap(pixels) };
    } catch {
      return { id, ok: false, error: "render-failed" };
    }
  };

  return (request: EffectRenderRequest): Promise<EffectRenderResponse> => {
    const next = queue.then(() => run(request));
    queue = next.catch(() => undefined);
    return next.catch((): EffectRenderResponse => ({
      id: request.id,
      ok: false,
      error: "render-failed",
    }));
  };
}
