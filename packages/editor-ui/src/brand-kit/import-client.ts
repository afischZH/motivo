/**
 * Reads a brand kit file for import, in the import worker where possible
 * (see transfer/read-file.ts). Files over the size limit are refused unread.
 */
import {
  readFileInWorker,
  type FileImporter,
  type ReadFileFailure,
  type ReadFileOptions,
} from "../transfer/read-file";
import { BRAND_KIT_FILE_MAX_BYTES, type BrandKitFileParseResult } from "./transfer-format";

/** Longest an import may take before it is given up. */
export const BRAND_KIT_IMPORT_TIMEOUT_MS = 60_000;

export type ReadBrandKitFileResult = BrandKitFileParseResult | ReadFileFailure;

const importer: FileImporter<BrandKitFileParseResult> = {
  maxBytes: BRAND_KIT_FILE_MAX_BYTES,
  defaultTimeoutMs: BRAND_KIT_IMPORT_TIMEOUT_MS,
  tooLarge: { ok: false, error: "too-large" },
  empty: { ok: false, error: "empty" },
  async createWorker() {
    const { createBrandKitWorker } = await import("./transfer-worker");
    return createBrandKitWorker();
  },
  async parseOnMain(file) {
    const { parseBrandKitFile } = await import("./transfer");
    try {
      return parseBrandKitFile(await file.text());
    } catch {
      return { ok: false, error: "malformed" };
    }
  },
};

/** Validates a brand kit file. Never throws. */
export function readBrandKitFile(
  file: Blob,
  options: ReadFileOptions = {},
): Promise<ReadBrandKitFileResult> {
  return readFileInWorker(importer, file, options);
}
