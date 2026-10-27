/**
 * Pure format metadata: MIME types, file extensions, quality defaults and
 * file names. No browser APIs.
 */
import type { CodeLanguage, ExportFormat } from "@motivo/tool-registry";

/** Formats produced by drawing into a canvas. */
export const RASTER_FORMATS = ["png", "jpg", "webp"] as const;
export type RasterFormat = (typeof RASTER_FORMATS)[number];

export function isRasterFormat(format: string): format is RasterFormat {
  return (RASTER_FORMATS as readonly string[]).includes(format);
}

/** MIME type per export format (for Blob, ClipboardItem and `toBlob`). */
export const MIME_TYPES: Readonly<Record<ExportFormat, string>> = {
  svg: "image/svg+xml",
  css: "text/css",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  react: "text/javascript",
  json: "application/json",
  tailwind: "text/plain",
};

/** File extension per export format. */
export const FILE_EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  svg: "svg",
  css: "css",
  png: "png",
  jpg: "jpg",
  webp: "webp",
  gif: "gif",
  mp4: "mp4",
  webm: "webm",
  react: "jsx",
  json: "json",
  tailwind: "txt",
};

/** MIME type and extension per code language of extra exports. */
export const CODE_LANGUAGE_FILES: Readonly<
  Record<CodeLanguage, { mime: string; extension: string }>
> = {
  css: { mime: "text/css", extension: "css" },
  html: { mime: "text/html", extension: "html" },
  js: { mime: "text/javascript", extension: "js" },
  json: { mime: "application/json", extension: "json" },
  text: { mime: "text/plain", extension: "txt" },
};

/** Encoder quality in [0, 1] for lossy formats; PNG is lossless and ignores it. */
export const DEFAULT_QUALITY: Readonly<Record<RasterFormat, number | undefined>> = {
  png: undefined,
  jpg: 0.92,
  webp: 0.9,
};

/** Background drawn under JPG exports, which cannot store transparency. */
export const DEFAULT_JPG_BACKGROUND = "#ffffff";

/** Clamps a user quality to [0, 1]; falls back to the format default. */
export function resolveQuality(format: RasterFormat, quality?: number): number | undefined {
  const fallback = DEFAULT_QUALITY[format];
  if (fallback === undefined) return undefined;
  if (quality === undefined || !Number.isFinite(quality)) return fallback;
  return Math.min(Math.max(quality, 0), 1);
}

/**
 * Background to paint before drawing: JPG always gets one (transparent
 * pixels would turn black), other formats only when asked for.
 */
export function resolveBackground(format: RasterFormat, background?: string): string | undefined {
  if (background !== undefined && background !== "transparent") return background;
  return format === "jpg" ? DEFAULT_JPG_BACKGROUND : undefined;
}

/** Characters that are unsafe in file names on common systems. */
const UNSAFE_NAME = /[^a-z0-9-]+/g;

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(UNSAFE_NAME, "-")
      .replace(/^-+|-+$/g, "") || "design"
  );
}

/**
 * `motivo-<toolId>-<seed>.<ext>`, optionally with a suffix before the
 * extension (`motivo-blob-42-clip-path.css`). Seeds are printed as uint32.
 */
export function exportFilename(
  toolId: string,
  seed: number,
  extension: string,
  suffix?: string,
): string {
  const parts = ["motivo", slug(toolId), String(seed >>> 0)];
  if (suffix !== undefined && suffix !== "") parts.push(slug(suffix));
  return `${parts.join("-")}.${extension.replace(/^\./, "")}`;
}
