/**
 * Pure logic behind the export dialog (M1-AP05): which formats a tool
 * offers, how the output size is derived, and which message explains an
 * error. No React, no browser APIs.
 */
import {
  isExportError,
  listExtraExports,
  resolveRasterSize,
  supportsExport,
  type ClipboardResult,
  type ExtraExportInfo,
  type RasterFormat,
} from "@motivo/exporters";
import { CANVAS_EDGE_MAX, type AnyToolDefinition, type CanvasSize } from "@motivo/tool-registry";

/** Card groups of the format choice (docs/DESIGN.md 6: Bild, Vektor, Code). */
export type ExportCategory = "image" | "vector" | "code";

export const EXPORT_CATEGORIES: readonly ExportCategory[] = ["image", "vector", "code"];

export type ExportChoice =
  | { id: RasterFormat; kind: "raster"; format: RasterFormat; category: "image" }
  | { id: "svg"; kind: "svg"; category: "vector" }
  | { id: "css"; kind: "css"; category: "code" }
  | { id: `extra:${string}`; kind: "extra"; extra: ExtraExportInfo; category: "code" };

/** Text outputs: shown as code, copied as text. */
export type TextChoice = Extract<ExportChoice, { kind: "svg" | "css" | "extra" }>;

export const isTextChoice = (choice: ExportChoice): choice is TextChoice =>
  choice.kind !== "raster";

const RASTER_ORDER: readonly RasterFormat[] = ["png", "jpg", "webp"];

/**
 * Every export the tool offers and the exporters can produce, in display
 * order: PNG, JPG, WebP, SVG, CSS, then the tool's extra exports.
 */
export function listExportChoices(tool: AnyToolDefinition): ExportChoice[] {
  const choices: ExportChoice[] = [];
  for (const format of RASTER_ORDER) {
    if (supportsExport(tool, format))
      choices.push({ id: format, kind: "raster", format, category: "image" });
  }
  if (supportsExport(tool, "svg")) choices.push({ id: "svg", kind: "svg", category: "vector" });
  if (supportsExport(tool, "css")) choices.push({ id: "css", kind: "css", category: "code" });
  for (const extra of listExtraExports(tool)) {
    choices.push({ id: `extra:${extra.id}`, kind: "extra", extra, category: "code" });
  }
  return choices;
}

/** The remembered choice if the tool still offers it, else the first one. */
export function pickInitialChoice(
  choices: readonly ExportChoice[],
  remembered: string | null | undefined,
): ExportChoice | undefined {
  return choices.find((c) => c.id === remembered) ?? choices[0];
}

/** Scale steps offered next to the custom size. */
export const EXPORT_SCALES = [1, 2, 4] as const;
export type ExportScale = (typeof EXPORT_SCALES)[number];

export type ExportSizeMode =
  { kind: "scale"; scale: ExportScale } | { kind: "custom"; width: number; height: number };

export interface RasterSizePlan {
  /** Size the design is rendered at (the `RenderContext` size). */
  render: CanvasSize;
  /** Pixel size of the exported file. */
  output: CanvasSize;
  /** The custom size has another aspect ratio, so the design is recomposed at that size. */
  recomposed: boolean;
  /** The request exceeded `maxEdge` and was scaled down. */
  clamped: boolean;
}

/**
 * Whether `width` x `height` has the aspect ratio of `design`, up to the
 * rounding of one pixel edge.
 */
export function sameAspect(design: CanvasSize, width: number, height: number): boolean {
  const h = Math.round((width * design.height) / design.width);
  const w = Math.round((height * design.width) / design.height);
  return h === height || w === width;
}

/**
 * Plans a raster export. Scales and custom sizes with the design's aspect
 * ratio scale the vector; a custom size with another aspect ratio renders
 * the design anew at that size (a new composition, no letterboxing).
 */
export function planRasterSize(
  design: CanvasSize,
  mode: ExportSizeMode,
  maxEdge: number = CANVAS_EDGE_MAX,
): RasterSizePlan {
  if (mode.kind === "scale") {
    const out = resolveRasterSize(design, { scale: mode.scale }, maxEdge);
    return {
      render: design,
      output: { width: out.width, height: out.height },
      recomposed: false,
      clamped: out.clamped,
    };
  }
  const { width, height } = mode;
  if (sameAspect(design, width, height)) {
    const out = resolveRasterSize(design, { width, height }, maxEdge);
    return {
      render: design,
      output: { width: out.width, height: out.height },
      recomposed: false,
      clamped: out.clamped,
    };
  }
  const out = resolveRasterSize({ width, height }, { scale: 1 }, maxEdge);
  const size = { width: out.width, height: out.height };
  return { render: size, output: size, recomposed: true, clamped: out.clamped };
}

/** Message key (under `Editor.export.errors`) for a failed export. */
export function exportErrorKey(error: unknown): string {
  if (isExportError(error)) {
    switch (error.code) {
      case "unsupported-format":
      case "unknown-extra":
        return "unsupportedFormat";
      case "decode-failed":
        return "decodeFailed";
      case "encode-unsupported":
        return "encodeUnsupported";
      case "encode-failed":
        return "encodeFailed";
      case "unavailable":
        return "unavailable";
      case "aborted":
        return "aborted";
    }
  }
  return "unknown";
}

/** Message key (under `Editor.export.copyErrors`) for a failed clipboard write. */
export function clipboardErrorKey(result: ClipboardResult): string | null {
  return result.ok ? null : result.reason;
}

/** Colour under JPG exports: the design's own background, or white if it is transparent. */
export function defaultJpgBackground(background: unknown): string {
  return typeof background === "string" && /^#[0-9a-f]{6}$/i.test(background)
    ? background.toLowerCase()
    : "#ffffff";
}

/** Byte length of a UTF-8 string. */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Rounds a byte count for display: `{ value, unit }` with unit B, KB or MB (1000-based). */
export function formatBytes(bytes: number): { value: string; unit: "B" | "KB" | "MB" } {
  if (bytes < 1000) return { value: String(bytes), unit: "B" };
  if (bytes < 1_000_000) return { value: (bytes / 1000).toFixed(1), unit: "KB" };
  return { value: (bytes / 1_000_000).toFixed(1), unit: "MB" };
}
