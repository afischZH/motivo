/**
 * The designs file format (`motivo-designs` version 1) without the import
 * validation, so pages can export without loading every tool. See
 * transfer.ts for the format and the import rules.
 */
import type { ImportedDesign } from "@motivo/storage";

export const DESIGNS_FILE_FORMAT = "motivo-designs";
export const DESIGNS_FILE_VERSION = 1;
/** Largest accepted file (bytes). Real files are a few KB per design, uploads aside. */
export const DESIGNS_FILE_MAX_BYTES = 20 * 1024 * 1024;
/** Most designs one file may hold. */
export const DESIGNS_FILE_MAX_DESIGNS = 2000;

export type DesignsFileError =
  | "too-large"
  | "empty"
  | "malformed"
  | "forbidden-keys"
  | "wrong-format"
  | "unsupported-version"
  | "too-many";

export type SkipReason = "invalid" | "unknown-tool" | "invalid-params" | "unsafe-upload";

export interface SkippedDesign {
  /** Position in the file, from 0. */
  index: number;
  /** The design's name when it could be read. */
  name?: string;
  reason: SkipReason;
}

export type DesignsFileParseResult =
  | {
      ok: true;
      designs: ImportedDesign[];
      skipped: SkippedDesign[];
    }
  | { ok: false; error: DesignsFileError };

/** One design as written to the file. */
export interface DesignsFileEntry {
  id: string;
  toolId: string;
  toolVersion: number;
  name: string;
  seed: number;
  size: { width: number; height: number };
  params: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface DesignsFile {
  format: typeof DESIGNS_FILE_FORMAT;
  version: typeof DESIGNS_FILE_VERSION;
  exportedAt: number;
  designs: DesignsFileEntry[];
}

/** The export file for these designs. */
export function buildDesignsFile(
  designs: readonly DesignsFileEntry[],
  exportedAt: number,
): DesignsFile {
  return {
    format: DESIGNS_FILE_FORMAT,
    version: DESIGNS_FILE_VERSION,
    exportedAt,
    designs: designs.map((d) => ({
      id: d.id,
      toolId: d.toolId,
      toolVersion: d.toolVersion,
      name: d.name,
      seed: d.seed,
      size: { width: d.size.width, height: d.size.height },
      params: d.params,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
  };
}

/** `motivo-designs-v1-2026-10-28.json` (local date). */
export function designsFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${DESIGNS_FILE_FORMAT}-v${DESIGNS_FILE_VERSION}-${day}.json`;
}
