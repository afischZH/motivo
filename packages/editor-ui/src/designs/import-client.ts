/**
 * Reads a designs file for import: in the import worker where possible,
 * otherwise (no Worker, worker failed to start) on the main thread. Files
 * over the size limit are refused before a single byte is read.
 */
import {
  readFileInWorker,
  type FileImporter,
  type ReadFileFailure,
  type ReadFileOptions,
} from "../transfer/read-file";
import { DESIGNS_FILE_MAX_BYTES, type DesignsFileParseResult } from "./transfer-format";

/** Longest an import may take before it is given up. */
export const IMPORT_TIMEOUT_MS = 60_000;

export type ReadDesignsFileResult = DesignsFileParseResult | ReadFileFailure;
export type ReadDesignsFileOptions = ReadFileOptions;

const importer: FileImporter<DesignsFileParseResult> = {
  maxBytes: DESIGNS_FILE_MAX_BYTES,
  defaultTimeoutMs: IMPORT_TIMEOUT_MS,
  tooLarge: { ok: false, error: "too-large" },
  empty: { ok: false, error: "empty" },
  async createWorker() {
    const { createTransferWorker } = await import("./transfer-worker");
    return createTransferWorker();
  },
  async parseOnMain(file) {
    const [{ parseDesignsFile }, { registry }] = await Promise.all([
      import("./transfer"),
      import("@musterli/tool-registry"),
    ]);
    try {
      return parseDesignsFile(await file.text(), registry);
    } catch {
      return { ok: false, error: "malformed" };
    }
  },
};

/** Validates an import file. Never throws. */
export function readDesignsFile(
  file: Blob,
  options: ReadDesignsFileOptions = {},
): Promise<ReadDesignsFileResult> {
  return readFileInWorker(importer, file, options);
}
