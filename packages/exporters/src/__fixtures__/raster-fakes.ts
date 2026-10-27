/**
 * Test doubles for the browser parts of the raster flow. Test-only module.
 */
import {
  handleEncodeRequest,
  type EncodeRequest,
  type OffscreenCanvasLike,
} from "../raster-encode";
import type { LoadedImage, MainCanvasLike, RasterEnv, WorkerLike } from "../raster";

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

/** A canvas that records draw calls and "encodes" to a Blob of the requested type. */
export function fakeCanvas(
  log: DrawLog,
  width: number,
  height: number,
  opts: { encodable?: (mime: string) => boolean; noContext?: boolean } = {},
): OffscreenCanvasLike & MainCanvasLike {
  const encodable = opts.encodable ?? (() => true);
  const typeFor = (mime: string | undefined): string => {
    const m = mime ?? "image/png";
    return encodable(m) ? m : "image/png";
  };
  const ctx = {
    fillStyle: "" as string | CanvasGradient | CanvasPattern,
    fillRect(x: number, y: number, w: number, h: number) {
      log.calls.push(`fill ${String(ctx.fillStyle)} ${x},${y},${w},${h}`);
    },
    drawImage(_img: CanvasImageSource, ...args: number[]) {
      log.calls.push(`draw ${args.join(",")}`);
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
}

export interface FakeEnv extends RasterEnv {
  log: DrawLog;
  loadedSvgs: string[];
  released: number;
  terminated: number;
  yields: number;
  bitmaps: FakeBitmap[];
}

export function fakeEnv(o: FakeEnvOptions = {}): FakeEnv {
  const log: DrawLog = { calls: [] };
  const env: FakeEnv = {
    log,
    loadedSvgs: [],
    released: 0,
    terminated: 0,
    yields: 0,
    bitmaps: [],
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
    createImageBitmap(image) {
      if (o.bitmapFails) return Promise.reject(new Error("no svg bitmaps"));
      const bitmap = new FakeBitmap(image);
      env.bitmaps.push(bitmap);
      return Promise.resolve(bitmap as unknown as ImageBitmap);
    },
    createWorker(): WorkerLike {
      const worker: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage(message: EncodeRequest, transfer: Transferable[]) {
          log.calls.push(`post transfer=${transfer.length}`);
          if (o.workerHangs) return;
          if (o.workerCrashes) {
            queueMicrotask(() => worker.onerror?.({ message: "boom" } as ErrorEvent));
            return;
          }
          const opts = o.encodable ? { encodable: o.encodable } : {};
          void handleEncodeRequest(message, (w, h) => fakeCanvas(log, w, h, opts)).then((reply) =>
            worker.onmessage?.({ data: reply } as MessageEvent),
          );
        },
        terminate() {
          env.terminated++;
        },
      };
      return worker;
    },
    createCanvas: (w, h) => fakeCanvas(log, w, h, o.encodable ? { encodable: o.encodable } : {}),
    yieldToMain() {
      env.yields++;
      return Promise.resolve();
    },
  };
  return env;
}
