/**
 * Reads a social designs file for import: in the import worker where
 * possible, otherwise on the main thread. Files over the limit are refused
 * unread. Never throws.
 */
import {
  readFileInWorker,
  type FileImporter,
  type ReadFileFailure,
  type ReadFileOptions,
} from "@musterli/editor-ui/transfer";

import { SOCIAL_FILE_MAX_BYTES, type SocialFileParseResult } from "./transfer-format";

export const SOCIAL_IMPORT_TIMEOUT_MS = 60_000;

export type ReadSocialFileResult = SocialFileParseResult | ReadFileFailure;

const importer: FileImporter<SocialFileParseResult> = {
  maxBytes: SOCIAL_FILE_MAX_BYTES,
  defaultTimeoutMs: SOCIAL_IMPORT_TIMEOUT_MS,
  tooLarge: { ok: false, error: "too-large" },
  empty: { ok: false, error: "empty" },
  async createWorker() {
    return new Worker(new URL("./transfer.worker.ts", import.meta.url), {
      type: "module",
      name: "musterli-social-import",
    });
  },
  async parseOnMain(file) {
    // Browser only: the guard keeps these imports out of the server bundle (Worker size).
    if (typeof window === "undefined") return { ok: false, error: "malformed" };
    const [{ parseSocialFile }, { registry }] = await Promise.all([
      import("./transfer"),
      import("@musterli/tool-registry"),
    ]);
    try {
      return parseSocialFile(await file.text(), registry);
    } catch {
      return { ok: false, error: "malformed" };
    }
  },
};

export function readSocialFile(
  file: Blob,
  options: ReadFileOptions = {},
): Promise<ReadSocialFileResult> {
  return readFileInWorker(importer, file, options);
}
