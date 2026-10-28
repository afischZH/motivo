/**
 * Test doubles for the browser parts of the raster flow. Test-only module.
 *
 * Fake canvases "draw" a known pattern: after a draw whose source starts at
 * (sx, sy) and lands at (dx, dy), the pixel at canvas (x, y) reads back as
 * `fakePixel(sx - dx + x, sy - dy + y)`. So strips, probes and full canvases
 * can be checked against the image coordinates they claim to show.
 */
import {
  createStripSession,
  handleEncodeRequest,
  isStripMessage,
  type EncodeRequest,
  type Context2dLike,
  type OffscreenCanvasLike,
  type StripMessage,
} from "../raster-encode";
import type {
  LoadedImage,
  MainCanvasLike,
  MainContextLike,
  RasterEnv,
  WorkerLike,
} from "../raster";

export interface DrawLog {
  calls: string[];
}

export class FakeBitmap {
  closed = false;
  constructor(readonly source: unknown) {}
  close(): void {
    this.closed = true;
  }
}

/** The RGBA value of image pixel (x, y) in the fake pattern. */
export function fakePixel(x: number, y: number): [number, number, number, number] {
  return [y & 255, x & 255, (x + y) % 7, 255];
}

export interface FakeCanvasOptions {
  encodable?: (mime: string) => boolean;
  noContext?: boolean;
  /** Canvases larger than this many pixels draw nothing (like WebKit above its limit). */
  blankAbove?: number;
}

/** A canvas that records draw calls and "encodes" to a Blob of the requested type. */
export function fakeCanvas(
  log: DrawLog,
  width: number,
  height: number,
  opts: FakeCanvasOptions = {},
): OffscreenCanvasLike & MainCanvasLike {
  const encodable = opts.encodable ?? (() => true);
  const blank = width * height > (opts.blankAbove ?? Infinity);
  const typeFor = (mime: string | undefined): string => {
    const m = mime ?? "image/png";
    return encodable(m) ? m : "image/png";
  };
  /** Image offset of the last draw, `undefined` before any draw. */
  let offset: { x: number; y: number } | undefined;
  const ctx: MainContextLike & Context2dLike = {
    fillStyle: "" as string | CanvasGradient | CanvasPattern,
    fillRect(x: number, y: number, w: number, h: number) {
      log.calls.push(`fill ${String(ctx.fillStyle)} ${x},${y},${w},${h}`);
    },
    clearRect(x: number, y: number, w: number, h: number) {
      log.calls.push(`clear ${x},${y},${w},${h}`);
      offset = undefined;
    },
    drawImage(_img: CanvasImageSource, ...args: number[]) {
      log.calls.push(`draw ${args.join(",")}`);
      if (blank) return;
      // 4 numbers: dx, dy, dw, dh; 8 numbers: sx, sy, sw, sh, dx, dy, dw, dh.
      offset =
        args.length >= 8
          ? { x: (args[0] ?? 0) - (args[4] ?? 0), y: (args[1] ?? 0) - (args[5] ?? 0) }
          : { x: -(args[0] ?? 0), y: -(args[1] ?? 0) };
    },
    getImageData(sx: number, sy: number, sw: number, sh: number) {
      const data = new Uint8ClampedArray(sw * sh * 4);
      if (offset) {
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            data.set(fakePixel(offset.x + sx + x, offset.y + sy + y), (y * sw + x) * 4);
          }
        }
      }
      return { data };
    },
  };
  return {
    getContext: () => (opts.noContext ? null : ctx),
    convertToBlob: (o?: ImageEncodeOptions) => {
      log.calls.push(`encode ${o?.type ?? ""} q=${String(o?.quality)} ${width}x${height}`);
      return Promise.resolve(new Blob(["x"], { type: typeFor(o?.type) }));
    },
    toBlob(cb: (b: Blob | null) => void, type?: string, quality?: number) {
      log.calls.push(`toBlob ${type ?? ""} q=${String(quality)} ${width}x${height}`);
      cb(new Blob(["x"], { type: typeFor(type) }));
    },
  };
}

export interface FakeEnvOptions {
  worker?: boolean;
  bitmapFails?: boolean;
  workerCrashes?: boolean;
  workerHangs?: boolean;
  encodable?: (mime: string) => boolean;
  decodeFails?: boolean;
  /** `RasterEnv.maxCanvasArea`; default: no limit. */
  maxCanvasArea?: number;
  /** `RasterEnv.stripsSupported`; default true. */
  strips?: boolean;
  /** Main-thread canvases larger than this draw nothing. */
  blankAbove?: number;
  /** Worker canvases larger than this draw nothing. */
  workerBlankAbove?: number;
}

export interface FakeEnv extends RasterEnv {
  log: DrawLog;
  loadedSvgs: string[];
  released: number;
  terminated: number;
  yields: number;
  bitmaps: FakeBitmap[];
  /** Strip messages the worker received, by kind. */
  stripMessages: string[];
}

export function fakeEnv(o: FakeEnvOptions = {}): FakeEnv {
  const log: DrawLog = { calls: [] };
  const canvasOptions = (blankAbove: number | undefined): FakeCanvasOptions => ({
    ...(o.encodable ? { encodable: o.encodable } : {}),
    ...(blankAbove !== undefined ? { blankAbove } : {}),
  });
  const env: FakeEnv = {
    log,
    loadedSvgs: [],
    released: 0,
    terminated: 0,
    yields: 0,
    bitmaps: [],
    stripMessages: [],
    loadSvgImage(svg): Promise<LoadedImage> {
      if (o.decodeFails) return Promise.reject(new Error("decode"));
      env.loadedSvgs.push(svg);
      return Promise.resolve({
        image: { svg } as unknown as CanvasImageSource,
        release: () => {
          env.released++;
        },
      });
    },
    workerSupported: () => o.worker ?? true,
    stripsSupported: () => o.strips ?? true,
    maxCanvasArea: () => o.maxCanvasArea ?? Number.MAX_SAFE_INTEGER,
    createImageBitmap(image) {
      if (o.bitmapFails) return Promise.reject(new Error("no svg bitmaps"));
      const bitmap = new FakeBitmap(image);
      env.bitmaps.push(bitmap);
      return Promise.resolve(bitmap as unknown as ImageBitmap);
    },
    createWorker(): WorkerLike {
      const strips = createStripSession();
      let queue: Promise<void> = Promise.resolve();
      const worker: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(message: EncodeRequest | StripMessage, transfer: Transferable[]) {
          if (o.workerHangs) {
            log.calls.push(`post transfer=${transfer.length}`);
            return;
          }
          if (o.workerCrashes) {
            log.calls.push(`post transfer=${transfer.length}`);
            queueMicrotask(() => worker.onerror?.({ message: "boom" } as ErrorEvent));
            return;
          }
          if (isStripMessage(message)) {
            env.stripMessages.push(message.kind);
            queue = queue.then(() =>
              strips.handle(message).then((reply) => {
                worker.onmessage?.({ data: reply } as MessageEvent);
              }),
            );
            return;
          }
          log.calls.push(`post transfer=${transfer.length}`);
          void handleEncodeRequest(message, (w, h) =>
            fakeCanvas(log, w, h, canvasOptions(o.workerBlankAbove)),
          ).then((reply) => worker.onmessage?.({ data: reply } as MessageEvent));
        },
        terminate() {
          env.terminated++;
        },
      };
      return worker;
    },
    createCanvas: (w, h) => fakeCanvas(log, w, h, canvasOptions(o.blankAbove)),
    yieldToMain() {
      env.yields++;
      return Promise.resolve();
    },
  };
  return env;
}
