/** Why an export failed. Stable strings, so the UI can map them to i18n keys. */
export type ExportErrorCode =
  /** The tool does not list the format in `exports`, or its render kind cannot produce it. */
  | "unsupported-format"
  /** No extra export with that id. */
  | "unknown-extra"
  /** The browser could not load the SVG as an image. */
  | "decode-failed"
  /** The browser cannot encode this format (e.g. WebP in some Safari versions). */
  | "encode-unsupported"
  /** Encoding failed, typically because the canvas is too large for this device. */
  | "encode-failed"
  /**
   * The browser could not draw an image this large in this format (canvas
   * size limit, e.g. Safari); PNG still works through strips.
   */
  | "too-large"
  /** An animation exceeds the pixel budget (frames × width × height, see `GIF_PIXEL_BUDGET`). */
  | "budget-exceeded"
  /** The required browser API is missing (Canvas, Clipboard, ...). */
  | "unavailable"
  | "aborted";

export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExportError";
    this.code = code;
  }
}

export function isExportError(error: unknown): error is ExportError {
  return error instanceof ExportError;
}

/** Throws `ExportError("aborted")` when the signal has fired. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ExportError("aborted", "Export aborted");
}
