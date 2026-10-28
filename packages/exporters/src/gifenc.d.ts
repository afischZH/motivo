/**
 * Minimal type declarations for `gifenc` (MIT, ships no types). Covers only
 * what `gif-encode.ts` uses, so no `@types` package is needed.
 */
declare module "gifenc" {
  export type GifencFormat = "rgb565" | "rgb444" | "rgba4444";
  /** `[r, g, b]` or `[r, g, b, a]` in bytes. */
  export type GifencPalette = number[][];

  export interface QuantizeOptions {
    format?: GifencFormat;
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): GifencPalette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifencPalette,
    format?: GifencFormat,
  ): Uint8Array;

  export interface WriteFrameOptions {
    palette?: GifencPalette;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    /** Milliseconds; stored in hundredths of a second. */
    delay?: number;
    /** -1 once, 0 forever, n > 0 repetitions. */
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
  }

  export interface GifEncoderStream {
    writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: {
    auto?: boolean;
    initialCapacity?: number;
  }): GifEncoderStream;
}
